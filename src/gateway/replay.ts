import { once } from 'node:events';
import { request } from 'node:http';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { mkdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { serviceSchema, startService, type ServiceInstance } from './service.js';

const maxBytes = 1024 * 1024;
const position = z.object({ state: z.string().min(1), requests: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER) }).strict();
export const serviceReplaySchema = z.object({
  version: z.literal(1), service: serviceSchema,
  start: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('initial') }).strict(),
    z.object({ kind: z.literal('snapshot'), path: z.string().min(1) }).strict(),
  ]),
  steps: z.array(z.object({
    method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']),
    path: z.string().regex(/^\/[^\r\n\x00-\x20\x7f]*$/),
    expect: z.object({
      status: z.number().int().min(200).max(599),
      body: z.discriminatedUnion('kind', [
        z.object({ kind: z.literal('text'), value: z.string() }).strict(),
        z.object({ kind: z.literal('json'), value: z.unknown().refine(value => value !== undefined, 'value is required') }).strict(),
      ]),
    }).strict(),
  }).strict()).min(1).max(100),
  final: position,
  repeats: z.number().int().min(2).max(10).default(2),
  deadlineMs: z.number().int().min(1).max(10000).default(2000),
}).strict();
type Verdict = 'passed' | 'failed' | 'insufficient_evidence';
type Step = z.infer<typeof serviceReplaySchema>['steps'][number];
interface Run {
  verdict: Verdict;
  steps: { index: number; verdict: Verdict; status?: number; body?: string; expected: Step['expect']; error?: string }[];
  initial?: unknown; final?: unknown; expectedFinal?: unknown; finalVerdict?: Verdict; error?: string;
}
function readJson(file: string): unknown {
  const info = statSync(file);
  if (!info.isFile() || info.size > maxBytes) throw new Error('Input must be a regular file no larger than 1 MiB');
  return JSON.parse(readFileSync(file, 'utf8'));
}
function privateJson(file: string, value: unknown) {
  writeFileSync(file, JSON.stringify(value, null, 2), { mode: 0o600, flag: 'wx' });
}
/** Only connects to the owned loopback service. Redirects are observations, never followed. */
function exchange(port: number, step: Step, deadlineMs: number): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = request({ hostname: '127.0.0.1', port, method: step.method, path: step.path, agent: false }, res => {
      const chunks: Buffer[] = [];
      let bytes = 0;
      res.on('data', (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > maxBytes) req.destroy(new Error('Response exceeds 1 MiB'));
        else chunks.push(chunk);
      });
      res.on('error', reject);
      res.on('end', () => resolve({ status: res.statusCode!, body: Buffer.concat(chunks).toString('utf8') }));
    });
    const timer = setTimeout(() => req.destroy(new Error('Request deadline exceeded')), deadlineMs);
    req.on('error', reject);
    req.on('close', () => clearTimeout(timer));
    req.end();
  });
}

/** Authored simulator checks, not application acceptance or historical regression proof. */
export async function replayService(specPath: string, outputDirectory: string) {
  const outDir = path.resolve(outputDirectory);
  mkdirSync(path.dirname(outDir), { recursive: true, mode: 0o700 });
  mkdirSync(outDir, { mode: 0o700 }); // Exclusive: never overwrite any existing output.
  const runs: Run[] = [];
  let error: string | undefined;
  let specHash: string | undefined;
  try {
    const raw = readJson(path.resolve(specPath));
    privateJson(path.join(outDir, 'declaration.json'), raw);
    const spec = serviceReplaySchema.parse(raw);
    specHash = createHash('sha256').update(JSON.stringify(spec)).digest('hex');
    // Read once: all repeats use the same supplied starting snapshot.
    const restore = spec.start.kind === 'snapshot'
      ? readJson(path.resolve(path.dirname(path.resolve(specPath)), spec.start.path)) : undefined;
    if (restore !== undefined) privateJson(path.join(outDir, 'starting-snapshot.json'), restore);
    for (let repeat = 0; repeat < spec.repeats; repeat++) {
      const run: Run = { verdict: 'insufficient_evidence', steps: [], expectedFinal: spec.final };
      let service: ServiceInstance | undefined;
      try {
        service = startService({ port: 0, declaration: spec.service, restore });
        await once(service.server, 'listening');
        run.initial = service.snapshot();
        const address = service.server.address();
        if (!address || typeof address === 'string') throw new Error('Missing service address');
        for (const [index, step] of spec.steps.entries()) {
          try {
            const observed = await exchange(address.port, step, spec.deadlineMs);
            let bodyMatches = false;
            if (step.expect.body.kind === 'text') bodyMatches = observed.body === step.expect.body.value;
            else { try { bodyMatches = isDeepStrictEqual(JSON.parse(observed.body), step.expect.body.value); } catch { /* malformed JSON is an observed mismatch */ } }
            run.steps.push({ index, expected: step.expect, ...observed, verdict: observed.status === step.expect.status && bodyMatches ? 'passed' : 'failed' });
          } catch (e) {
            run.steps.push({ index, expected: step.expect, verdict: 'insufficient_evidence', error: String(e) });
            break; // After uncertain execution, subsequent state cannot be assumed.
          }
        }
        const final = service.snapshot();
        run.final = final;
        run.finalVerdict = run.steps.length === spec.steps.length && run.steps.every(step => step.verdict !== 'insufficient_evidence')
          ? isDeepStrictEqual({ state: final.state, requests: final.requests }, spec.final) ? 'passed' : 'failed'
          : 'insufficient_evidence';
        run.verdict = run.finalVerdict === 'insufficient_evidence' ? 'insufficient_evidence'
          : run.finalVerdict === 'failed' || run.steps.some(step => step.verdict === 'failed') ? 'failed' : 'passed';
      } catch (e) { run.error = String(e); }
      finally {
        if (service) {
          service.server.closeAllConnections();
          await new Promise<void>(resolve => service!.server.close(() => resolve()));
        }
      }
      runs.push(run);
      privateJson(path.join(outDir, `run-${repeat + 1}.json`), run);
    }
  } catch (e) { error = String(e); }
  const verdict: Verdict = error || !runs.length || runs.some(run => run.verdict === 'insufficient_evidence') ? 'insufficient_evidence'
    : runs.some(run => run.verdict === 'failed') ? 'failed' : 'passed';
  const scope = 'Declared simulator HTTP sequence only; not application acceptance, retry behavior, trace reconstruction or historical repair proof.';
  const proofPath = path.join(outDir, 'replay.json');
  privateJson(proofPath, { version: 1, simulated: true, proof: false, verdict, scope, specHash, runs, error });
  // No application strings, snapshot values, response content or raw errors in public feedback.
  const result = {
    verdict, simulated: true, proof: false, scope, proofPath,
    runs: runs.map((run, index) => ({ run: index + 1, verdict: run.verdict, evidencePath: path.join(outDir, `run-${index + 1}.json`),
      diagnostics: run.steps.filter(step => step.verdict !== 'passed').map(step => ({ stepIndex: step.index, verdict: step.verdict })), finalVerdict: run.finalVerdict })),
    nextAction: verdict === 'passed' ? 'Declared simulator checks passed; preserve private evidence. No application behavior claim.'
      : verdict === 'failed' ? 'Inspect private expected/observed responses and final state; review requirements before diagnosing a defect.'
      : 'Inspect private execution/input errors; restore valid inputs and complete execution before making a behavior claim.',
  };
  privateJson(path.join(outDir, 'feedback.json'), result);
  return result;
}
