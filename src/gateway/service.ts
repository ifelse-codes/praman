import { createServer, type Server } from 'node:http';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { z } from 'zod';

const responseSchema = z.object({
  status: z.number().int().min(200).max(599),
  body: z.unknown().refine(value => value !== undefined, 'body is required'),
}).strict();
const transitionSchema = z.object({
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']),
  path: z.string().regex(/^\/[^?#]*$/),
  next: z.string().min(1),
  response: responseSchema,
}).strict();
export const serviceSchema = z.object({
  version: z.literal(1),
  initial: z.string().min(1),
  states: z.record(z.string().min(1), z.array(transitionSchema)).refine(states => Object.keys(states).length > 0),
}).strict().superRefine((spec, ctx) => {
  if (!Object.hasOwn(spec.states, spec.initial)) ctx.addIssue({ code: 'custom', message: 'Unknown initial state' });
  for (const [state, transitions] of Object.entries(spec.states)) {
    const routes = new Set<string>();
    for (const transition of transitions) {
      const route = `${transition.method} ${transition.path}`;
      if (routes.has(route)) ctx.addIssue({ code: 'custom', message: `Duplicate route in ${state}: ${route}` });
      routes.add(route);
      if (!Object.hasOwn(spec.states, transition.next)) ctx.addIssue({ code: 'custom', message: `Unknown next state: ${transition.next}` });
    }
  }
});

const snapshotSchema = z.object({
  version: z.literal(1),
  declarationHash: z.string(),
  state: z.string(),
  requests: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
}).strict();
export type ServiceSnapshot = z.infer<typeof snapshotSchema>;
export interface ServiceState {
  snapshot(): ServiceSnapshot;
  restore(snapshot: unknown): void;
  reset(): void;
  transition(method: string, url: string): ServiceInteraction;
}
export interface ServiceInstance extends ServiceState {
  server: Server;
  save(file: string): void;
  load(file: string): void;
}
export interface ServiceInteraction {
  method: string; path: string; status: number; body: string;
  before: string; after: string; matched: boolean;
}

/** One atomic finite-state model can back multiple owned loopback listeners. */
export function createServiceState(input: unknown, saved?: unknown): ServiceState {
  const declaration = serviceSchema.parse(input);
  const declarationHash = createHash('sha256').update(JSON.stringify(declaration)).digest('hex');
  let state = declaration.initial;
  let requests = 0;
  const snapshot = (): ServiceSnapshot => ({ version: 1, declarationHash, state, requests });
  const restore = (input: unknown) => {
    const saved = snapshotSchema.parse(input);
    if (saved.declarationHash !== declarationHash || !Object.hasOwn(declaration.states, saved.state)) {
      throw new Error('Snapshot does not match this service declaration');
    }
    state = saved.state;
    requests = saved.requests;
  };
  if (saved !== undefined) restore(saved);
  return {
    snapshot, restore, reset: () => { state = declaration.initial; requests = 0; },
    transition(method, url) {
      const transition = declaration.states[state].find(item => item.method === method && item.path === url);
      const before = state;
      if (!transition) return { method, path: url, status: 404,
        body: method === 'HEAD' ? '' : JSON.stringify({ error: 'No declared transition' }), before, after: state, matched: false };
      state = transition.next;
      requests += 1;
      return { method, path: url, status: transition.response.status,
        body: method === 'HEAD' || [204, 304].includes(transition.response.status) ? '' : JSON.stringify(transition.response.body),
        before, after: state, matched: true };
    },
  };
}

/** Trusted declarations only. Shared state is explicit; no HTTP state-administration API. */
export function startService(opts: { port: number; declaration: unknown; restore?: unknown; state?: ServiceState; onRequest?: (interaction: ServiceInteraction) => void }): ServiceInstance {
  const declaration = serviceSchema.parse(opts.declaration);
  if (opts.state && opts.restore !== undefined) throw new Error('Restore shared state once before creating listeners');
  if (opts.state && opts.state.snapshot().declarationHash !== createHash('sha256').update(JSON.stringify(declaration)).digest('hex')) throw new Error('Shared state does not match declaration');
  const state = opts.state ?? createServiceState(declaration, opts.restore);
  const server = createServer((req, res) => {
    req.resume();
    const interaction = state.transition(req.method ?? '', req.url ?? '');
    res.setHeader('Content-Type', 'application/json');
    res.writeHead(interaction.status);
    res.end(interaction.body);
    opts.onRequest?.(interaction);
  });
  server.listen(opts.port, '127.0.0.1');
  return {
    ...state, server,
    save: (file: string) => {
      // Same-directory rename prevents partially written snapshots becoming readable.
      const temporary = `${file}.${process.pid}.tmp`;
      writeFileSync(temporary, JSON.stringify(state.snapshot(), null, 2), { mode: 0o600 });
      renameSync(temporary, file);
    },
    load: (file: string) => state.restore(JSON.parse(readFileSync(file, 'utf8'))),
  };
}
