import { createHash, randomBytes, X509Certificate } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { z } from 'zod';
import type { OutsideRunEvidence } from '../case/change.js';
import { inspectContainer, inspectNetwork, ownerLabel } from './container.js';
import { command, freePort } from './runtime.js';
import type { EnvironmentState, SaveState } from './types.js';

/**
 * Recorded outside calls through Hoverfly (SpectoLabs, Apache-2.0), run as one owned container per
 * environment. Without a recording it records (capture mode: calls reach the real service and are
 * stored); with one it replays (simulate mode: a call that is not in the recording is refused).
 * Core knows HTTP and HTTPS through the application's own proxy settings; it never learns what the
 * outside service is.
 */
export const outsideImage = 'spectolabs/hoverfly:v1.12.17';
const user = 'praman';
const journalSize = 1000;
/** Hoverfly answers a call it cannot serve (no match, or the real service failed) with 502 and this body. */
const refusalBody = 'Hoverfly Error!';
/** Logged by Hoverfly (`-v`) when the application rejected the environment's CA during an HTTPS call. */
const tlsRefusal = /Cannot handshake client (\S+)/g;
const masquerade = 'com.docker.network.bridge.enable_ip_masquerade';

const manifestSchema = z.object({
  version: z.literal(1), image: z.string().min(1), calls: z.number().int().positive(),
  bytes: z.number().int().positive(), sha256: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
export type RecordingManifest = z.infer<typeof manifestSchema>;
export interface Recording { id: string; manifest: RecordingManifest; simulation: string; }
export const recordingIdPattern = /^[a-f0-9]{12}$/;
const canonical = (manifest: RecordingManifest) => JSON.stringify([manifest.version, manifest.image, manifest.calls, manifest.bytes, manifest.sha256]);
export const recordingIdOf = (manifest: RecordingManifest) => createHash('sha256').update(canonical(manifest)).digest('hex').slice(0, 12);
const pairsOf = (simulation: unknown) => z.object({ data: z.object({ pairs: z.array(z.unknown()) }).passthrough() }).passthrough().parse(simulation).data.pairs;

/** Loads a saved recording and proves it is unchanged (manifest id, size, hash, call count). */
export function loadRecording(ref: { id: string; directory: string }): Recording {
  const manifestPath = join(ref.directory, 'manifest.json');
  const file = join(ref.directory, 'simulation.json');
  if (!existsSync(manifestPath) || !existsSync(file)) throw new Error(`Recording ${ref.id} not found`);
  const manifest = manifestSchema.parse(JSON.parse(readFileSync(manifestPath, 'utf8')));
  if (recordingIdOf(manifest) !== ref.id) throw new Error(`Recording ${ref.id} manifest does not match its id; it was altered`);
  if (manifest.image !== outsideImage) throw new Error(`Recording ${ref.id} was made with ${manifest.image}; this PRAMAN replays with ${outsideImage}`);
  const bytes = readFileSync(file);
  if (statSync(file).size !== manifest.bytes || createHash('sha256').update(bytes).digest('hex') !== manifest.sha256) throw new Error(`Recording ${ref.id} simulation was altered`);
  const simulation = bytes.toString('utf8');
  if (pairsOf(JSON.parse(simulation)).length !== manifest.calls) throw new Error(`Recording ${ref.id} holds a different number of calls than its manifest`);
  return { id: ref.id, manifest, simulation };
}

const tokens = new Map<string, string>();
async function api(state: EnvironmentState, method: string, path: string, body?: string, retry = true): Promise<unknown> {
  const outside = state.outside!;
  const key = `${outside.adminPort}:${outside.password}`;
  if (!tokens.has(key)) {
    const response = await fetch(`http://127.0.0.1:${outside.adminPort}/api/token-auth`, { method: 'POST', body: JSON.stringify({ username: user, password: outside.password }), signal: AbortSignal.timeout(5_000) });
    if (!response.ok) throw new Error(`Outside-call recorder sign-in: HTTP ${response.status}`);
    tokens.set(key, z.object({ token: z.string().min(1) }).parse(await response.json()).token);
  }
  const response = await fetch(`http://127.0.0.1:${outside.adminPort}${path}`, {
    method, headers: { authorization: `Bearer ${tokens.get(key)}`, 'content-type': 'application/json' }, ...(body === undefined ? {} : { body }), signal: AbortSignal.timeout(15_000),
  });
  const text = await response.text();
  if (response.status === 401 && retry) { tokens.delete(key); return api(state, method, path, body, false); }
  if (!response.ok) throw new Error(`Outside-call recorder ${method} ${path}: HTTP ${response.status} ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}

/** One plain-HTTP call through the proxy, as the application would make it. */
function viaProxy(state: EnvironmentState, url: string, withPassword: boolean) {
  const target = new URL(url);
  return new Promise<{ status: number; body: string }>((resolve, reject) => {
    const req = httpRequest({ host: '127.0.0.1', port: state.outside!.proxyPort, method: 'GET', path: target.href, timeout: 10_000,
      headers: { host: target.host, ...(withPassword ? { 'proxy-authorization': `Basic ${Buffer.from(`${user}:${state.outside!.password}`).toString('base64')}` } : {}) } }, res => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { if (body.length < 4096) body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
    });
    req.on('timeout', () => req.destroy(new Error('proxy probe timed out')));
    req.on('error', reject);
    req.end();
  });
}

async function logText(state: EnvironmentState) {
  return command(state, 'docker', ['logs', state.outside!.name], { withStderr: true, timeoutMs: 30_000 });
}
const tlsHosts = (log: string) => [...log.matchAll(tlsRefusal)].map(match => match[1]);

/** Starts the owned recorder (no recording) or replay (a loaded recording) and observes that it works. */
export async function startOutside(state: EnvironmentState, save: SaveState, recording?: Recording) {
  const name = `praman-${state.id}--hoverfly`;
  if (await inspectContainer(state, name)) throw new Error(`Container ${name} exists; refusing adoption`);
  const mode = recording ? 'replay' : 'record';
  const network = mode === 'replay' ? `praman-${state.id}--outside` : undefined;
  if (network && await inspectNetwork(state, network)) throw new Error(`Network ${network} exists; refusing adoption`);
  const password = randomBytes(24).toString('hex');
  const proxyPort = await freePort(), adminPort = await freePort();
  state.outside = { name, mode, proxyPort, adminPort, password, proxyUrl: `http://${user}:${password}@127.0.0.1:${proxyPort}`,
    caCert: join(state.directory, 'outside-ca.pem'), ...(network ? { network } : {}), ...(recording ? { recordingId: recording.id } : {}) };
  save();
  // The replay has no route out: its network does not translate outbound addresses, while published ports still work.
  if (network) await command(state, 'docker', ['network', 'create', '--label', `${ownerLabel}=${state.ownershipToken}`, '-o', `${masquerade}=false`, network]);
  await command(state, 'docker', ['run', '-d', '--name', name, '--label', `${ownerLabel}=${state.ownershipToken}`, ...(network ? ['--network', network] : []),
    '-p', `127.0.0.1:${proxyPort}:8500`, '-p', `127.0.0.1:${adminPort}:8888`, outsideImage,
    '-generate-ca-cert', '-auth', '-username', user, '-password', password, '-v', '-journal-size', String(journalSize), ...(mode === 'record' ? ['-capture'] : [])], { timeoutMs: 300_000 });
  const deadline = Date.now() + 30_000;
  let shownMode: string;
  while (true) {
    try { shownMode = z.object({ mode: z.string() }).passthrough().parse(await api(state, 'GET', '/api/v2/hoverfly/mode')).mode; break; }
    catch (error) { if (Date.now() >= deadline) throw new Error(`Outside-call recorder did not answer: ${error instanceof Error ? error.message : error}`); await delay(300); }
  }
  // A fresh CA made inside the container for this environment; Hoverfly's built-in default CA is public.
  await command(state, 'docker', ['cp', `${name}:/cert.pem`, state.outside.caCert]);
  const certificate = new X509Certificate(readFileSync(state.outside.caCert));
  if (!certificate.ca) throw new Error('The outside-call recorder did not provide a CA certificate');
  if (recording) {
    await api(state, 'PUT', '/api/v2/simulation', recording.simulation);
    const loaded = pairsOf(await api(state, 'GET', '/api/v2/simulation')).length;
    if (loaded !== recording.manifest.calls) throw new Error(`The replay holds ${loaded} calls; recording ${recording.id} has ${recording.manifest.calls}`);
    shownMode = z.object({ mode: z.string() }).passthrough().parse(await api(state, 'GET', '/api/v2/hoverfly/mode')).mode;
  }
  const expectedMode = mode === 'replay' ? 'simulate' : 'capture';
  if (shownMode !== expectedMode) throw new Error(`The outside-call recorder is in ${shownMode} mode, not ${expectedMode}`);
  const probe = `http://praman-probe-${randomBytes(4).toString('hex')}.invalid/`;
  const stranger = await viaProxy(state, probe, false);
  if (stranger.status !== 407) throw new Error(`The outside-call proxy answered a call without its password with HTTP ${stranger.status}, not 407`);
  let refused: { status: number } | undefined;
  if (mode === 'replay') {
    const answer = await viaProxy(state, probe, true);
    if (answer.status !== 502 || !answer.body.startsWith(refusalBody)) throw new Error(`The replay did not refuse an unrecorded call (HTTP ${answer.status})`);
    refused = { status: answer.status };
  }
  let networkOptions: Record<string, string> | undefined;
  if (network) {
    networkOptions = (await inspectNetwork(state, network))?.Options ?? undefined;
    if (networkOptions?.[masquerade] !== 'false') throw new Error('The replay network still translates outbound addresses');
  }
  await api(state, 'DELETE', '/api/v2/journal');
  const evidence = { image: outsideImage, mode, recordingId: recording?.id, calls: recording?.manifest.calls,
    ca: { subject: certificate.subject, validTo: certificate.validTo, fingerprint256: certificate.fingerprint256 },
    probes: { withoutPassword: stranger.status, ...(refused ? { unrecorded: refused.status } : {}) }, ...(network ? { network: { name: network, options: networkOptions } } : {}) };
  writeFileSync(join(state.directory, `outside-readiness-${Date.now()}.json`), JSON.stringify(evidence, null, 2), { mode: 0o600 });
  return evidence;
}

/** The recorder kept across a reset must still be the owned, running container. */
export async function checkOutside(state: EnvironmentState) {
  const container = await inspectContainer(state, state.outside!.name);
  if (!container || container.Config.Labels?.[ownerLabel] !== state.ownershipToken || !container.State.Running) throw new Error('The owned outside-call recorder is missing or stopped');
}

/** Removes the owned recorder and its network; unlabelled ones are refused. */
export async function destroyOutside(state: EnvironmentState, save: SaveState) {
  const outside = state.outside;
  if (!outside) return;
  const container = await inspectContainer(state, outside.name);
  if (container && container.Config.Labels?.[ownerLabel] !== state.ownershipToken) throw new Error('Outside-call recorder ownership label differs; refusing removal');
  if (container) await command(state, 'docker', ['rm', '-fv', outside.name]);
  if (await inspectContainer(state, outside.name)) throw new Error(`Container remains: ${outside.name}`);
  if (outside.network) {
    const network = await inspectNetwork(state, outside.network);
    if (network && network.Labels?.[ownerLabel] !== state.ownershipToken) throw new Error('Outside network ownership label differs; refusing removal');
    if (network) await command(state, 'docker', ['network', 'rm', outside.network]);
    if (await inspectNetwork(state, outside.network)) throw new Error(`Network remains: ${outside.network}`);
  }
  tokens.delete(`${outside.adminPort}:${outside.password}`);
  delete state.outside; save();
}

/** Stores what the recorder holds as a hashed recording under `<recordings>/<id>`. */
export async function saveRecording(state: EnvironmentState, recordingsDirectory: string) {
  if (state.outside?.mode !== 'record') throw new Error('recording-save needs an environment that records outside calls (declare outsideCalls and create without --recording)');
  await checkOutside(state);
  const simulation = JSON.stringify(await api(state, 'GET', '/api/v2/simulation'), null, 2);
  const calls = pairsOf(JSON.parse(simulation)).length;
  if (!calls) throw new Error('Nothing was recorded; run a scenario that makes the outside calls first');
  const bytes = Buffer.from(simulation);
  const manifest: RecordingManifest = { version: 1, image: outsideImage, calls, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
  const id = recordingIdOf(manifest);
  const staging = join(recordingsDirectory, `.saving-${randomBytes(6).toString('hex')}`);
  mkdirSync(staging, { recursive: true, mode: 0o700 });
  try {
    writeFileSync(join(staging, 'simulation.json'), bytes, { mode: 0o600 });
    writeFileSync(join(staging, 'manifest.json'), JSON.stringify(manifest, null, 2), { mode: 0o600 });
    const directory = join(recordingsDirectory, id);
    rmSync(directory, { recursive: true, force: true });
    renameSync(staging, directory);
    return { id, directory, manifest };
  } catch (error) { rmSync(staging, { recursive: true, force: true }); throw error; }
}

const entrySchema = z.object({
  request: z.object({ method: z.string().optional(), scheme: z.string().optional(), destination: z.string().optional(), path: z.string().optional(), query: z.unknown().optional() }).passthrough(),
  response: z.object({ status: z.number().optional(), body: z.string().optional() }).passthrough(),
  timeStarted: z.string().optional(),
}).passthrough();
const journalPage = z.object({ journal: z.array(entrySchema).nullable(), total: z.number().int() }).passthrough();

/** Clears the journal before a run and returns the number of TLS refusals logged so far. */
export async function beginOutsideRun(state: EnvironmentState) {
  await checkOutside(state);
  await api(state, 'DELETE', '/api/v2/journal');
  return { tlsSeen: tlsHosts(await logText(state)).length };
}

/** Reads the run's journal and log, writes the private call list and judges the run. */
export async function endOutsideRun(state: EnvironmentState, begun: { tlsSeen: number }, directory: string): Promise<OutsideRunEvidence> {
  const outside = state.outside!;
  const minPerRun = state.spec.outsideCalls?.minPerRun ?? 1;
  const entries: z.infer<typeof entrySchema>[] = [];
  let total = 0;
  do {
    const page = journalPage.parse(await api(state, 'GET', `/api/v2/journal?offset=${entries.length}&limit=100`));
    total = page.total;
    if (!page.journal?.length) break;
    entries.push(...page.journal);
  } while (entries.length < total);
  const tls = tlsHosts(await logText(state)).slice(begun.tlsSeen);
  const calls = entries.map(entry => {
    const query = entry.request.query && typeof entry.request.query === 'object' ? new URLSearchParams(Object.entries(entry.request.query as Record<string, unknown>)
      .flatMap(([key, values]) => (Array.isArray(values) ? values : [values]).map((value): [string, string] => [key, String(value)]))).toString() : '';
    const refused = entry.response.status === 502 && (entry.response.body ?? '').startsWith(refusalBody);
    return { at: entry.timeStarted, method: entry.request.method, url: `${entry.request.scheme}://${entry.request.destination}${entry.request.path ?? ''}${query ? `?${query}` : ''}`,
      status: entry.response.status, served: !refused };
  });
  const served = calls.filter(call => call.served).length, refused = calls.length - served;
  const file = join(directory, 'outside-calls.json');
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  writeFileSync(file, JSON.stringify({ mode: outside.mode, recordingId: outside.recordingId, journalTotal: total, calls, tlsRefused: tls }, null, 2), { mode: 0o600 });
  const kept = outside.mode === 'replay' ? 'the replay' : 'the recorder';
  const reason = total !== entries.length || total >= journalSize ? `The journal of ${kept} could not be read completely (${entries.length} of ${total} entries).`
    : refused || tls.length ? `${refused + tls.length} outside call(s) ${outside.mode === 'replay' ? 'were refused: not in the recording' : 'could not be recorded: the real service failed'} (${refused}) or the application rejected the environment's CA (${tls.length}). The run proves nothing about them.`
    : served < minPerRun ? `Only ${served} outside call(s) went through ${kept}; the declaration needs ${minPerRun} per run. The application may not be pointed at it.`
    : undefined;
  return { mode: outside.mode, ...(outside.recordingId ? { recordingId: outside.recordingId } : {}), served, refused, tlsRefused: tls.length, minPerRun, ok: !reason, ...(reason ? { reason } : {}), calls: 'outside-calls.json' };
}
