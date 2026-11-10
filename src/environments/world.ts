import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createReadStream, createWriteStream, existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import type { EnvironmentState } from './types.js';

/**
 * Worlds: a saved starting state made of the declared data paths of Docker services.
 * PRAMAN copies the paths as opaque tar archives. It never reads the files, so it does not
 * know which database or storage system produced them.
 */
const entrySchema = z.object({
  image: z.string().min(1), dataPath: z.string().startsWith('/'),
  bytes: z.number().int().nonnegative(), sha256: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
export const worldManifestSchema = z.object({ version: z.literal(1), services: z.record(z.string(), entrySchema) }).strict();
export type WorldManifest = z.infer<typeof worldManifestSchema>;
export interface WorldRef { id: string; directory: string; }
export interface WorldStart { service: string; worldId: string; sha256: string; matchesWorld: boolean; }

/** Field order and service order are fixed so the id depends only on the content. */
export function canonicalManifest(manifest: WorldManifest) {
  return JSON.stringify({ version: 1, services: Object.keys(manifest.services).sort().map(name => {
    const { image, dataPath, bytes, sha256 } = manifest.services[name];
    return [name, { image, dataPath, bytes, sha256 }];
  }) });
}
export const worldIdOf = (manifest: WorldManifest) => createHash('sha256').update(canonicalManifest(manifest)).digest('hex').slice(0, 12);
export const worldIdPattern = /^[a-f0-9]{12}$/;
export const archiveFile = (directory: string, service: string) => join(directory, `${service}.tar`);

export function sha256File(path: string): Promise<string> {
  return new Promise((resolveHash, reject) => {
    const hash = createHash('sha256');
    createReadStream(path).on('data', chunk => hash.update(chunk)).on('error', reject).on('end', () => resolveHash(hash.digest('hex')));
  });
}

function dockerEnv(state: EnvironmentState) { return { ...process.env, DOCKER_HOST: state.spec.dockerHost }; }

/** Streams `docker cp <container>:<path> -` to a file (or only to a hash when `file` is omitted). */
export async function copyOut(state: EnvironmentState, container: string, path: string, file?: string) {
  const proc = spawn('docker', ['cp', `${container}:${path}`, '-'], { env: dockerEnv(state), stdio: ['ignore', 'pipe', 'pipe'] });
  const hash = createHash('sha256');
  let bytes = 0, stderr = '';
  proc.stderr.on('data', chunk => { stderr += chunk; });
  const sink = file ? createWriteStream(file, { mode: 0o600 }) : undefined;
  proc.stdout.on('data', chunk => { hash.update(chunk); bytes += chunk.length; sink?.write(chunk); });
  const [code] = await once(proc, 'close');
  if (sink) { sink.end(); await once(sink, 'close'); }
  if (code !== 0) throw new Error(`docker cp ${container}:${path} failed (exit ${code}): ${stderr.trim()}`);
  return { sha256: hash.digest('hex'), bytes };
}

/** Streams an archive file into `docker cp - <container>:<parent>`. The container must exist; it may be stopped. */
export async function copyIn(state: EnvironmentState, container: string, parent: string, file: string) {
  const proc = spawn('docker', ['cp', '-', `${container}:${parent}`], { env: dockerEnv(state), stdio: ['pipe', 'ignore', 'pipe'] });
  let stderr = '';
  proc.stderr.on('data', chunk => { stderr += chunk; });
  proc.stdin.on('error', () => {});
  createReadStream(file).pipe(proc.stdin);
  const [code] = await once(proc, 'close');
  if (code !== 0) throw new Error(`docker cp into ${container}:${parent} failed (exit ${code}): ${stderr.trim()}`);
}

/**
 * Loads a world and proves it is unchanged: manifest id, archive sizes and hashes. Anything that
 * differs from the manifest, or does not match the declared services, is an error.
 */
export async function loadWorld(ref: WorldRef, state: EnvironmentState): Promise<WorldManifest> {
  const manifestPath = join(ref.directory, 'manifest.json');
  if (!existsSync(manifestPath)) throw new Error(`World ${ref.id} not found`);
  const manifest = worldManifestSchema.parse(JSON.parse(readFileSync(manifestPath, 'utf8')));
  if (worldIdOf(manifest) !== ref.id) throw new Error(`World ${ref.id} manifest does not match its id; it was altered`);
  const declared = Object.entries(state.spec.services ?? {}).filter(([, service]) => service.dataPath).map(([name]) => name).sort();
  if (JSON.stringify(declared) !== JSON.stringify(Object.keys(manifest.services).sort())) {
    throw new Error(`World ${ref.id} covers different services than the declaration's dataPath services`);
  }
  for (const [name, entry] of Object.entries(manifest.services)) {
    const service = state.spec.services![name];
    if (service.image !== entry.image || service.dataPath !== entry.dataPath) throw new Error(`World ${ref.id} was saved for a different image or dataPath of service ${name}`);
    const file = archiveFile(ref.directory, name);
    if (!existsSync(file) || statSync(file).size !== entry.bytes || await sha256File(file) !== entry.sha256) {
      throw new Error(`World ${ref.id} archive for service ${name} was altered or is missing`);
    }
  }
  return manifest;
}
