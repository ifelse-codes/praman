import { createHash } from 'node:crypto';
import { accessSync, closeSync, constants, fstatSync, openSync, readSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

export const identityDeclarationSchema = z.object({
  files: z.array(z.object({ role: z.enum(['script', 'input']), path: z.string().min(1) }).strict()).max(32).default([]),
  tools: z.array(z.object({ role: z.enum(['interpreter', 'browser', 'tool']), executable: z.string().min(1) }).strict()).max(32).default([]),
}).strict();
export type IdentityDeclaration = z.infer<typeof identityDeclarationSchema>;
export const identityScope = 'Identity scope: sampled local SHA-256 of the resolved command executable, runner interpreter/evaluator, browser binary where used, and explicitly declared scripts, inputs, interpreters and tools only. Declarations are caller-owned, not automatic script or shebang discovery. Transitive imports, packages, shared libraries, browser resources, undeclared subprocesses, environment/credentials, remote content, application/database state and source-to-deployment/history attribution are outside this scope. Files are checked at boundaries, not continuously: change-and-restore races are not excluded. These hashes are neither signed nor hermetic provenance or a sandbox.';
const entrySchema = z.object({
  role: z.string(), requested: z.string(), path: z.string().optional(), realPath: z.string().optional(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/).optional(), error: z.string().optional(),
}).strict();
export const identitySnapshotSchema = z.object({ version: z.literal(1), scope: z.string(), entries: z.array(entrySchema).min(2) }).strict();
export type IdentitySnapshot = z.infer<typeof identitySnapshotSchema>;
type Entry = IdentitySnapshot['entries'][number];

/** File declarations are declaration-relative, not inferred from argv or shell text. */
export function normalizeIdentity(declaration: IdentityDeclaration | undefined, directory: string): void {
  if (!declaration) return;
  for (const file of declaration.files) file.path = path.resolve(directory, file.path);
  for (const tool of declaration.tools) if (tool.executable.includes(path.sep)) tool.executable = path.resolve(directory, tool.executable);
}

function resolveExecutable(executable: string, cwd: string, env: NodeJS.ProcessEnv): string {
  if (executable.includes(path.sep)) return path.resolve(cwd, executable);
  for (const directory of (env.PATH ?? '/usr/bin:/bin').split(path.delimiter)) {
    const candidate = path.resolve(cwd, directory || '.', executable);
    try { accessSync(candidate, constants.X_OK); if (statSync(candidate).isFile()) return candidate; } catch { /* Try the next PATH entry. */ }
  }
  throw new Error('Executable is unavailable on the effective PATH.');
}

// Synchronous boundary capture cannot interleave reads in this process. Reuse one bounded buffer.
const buffer = Buffer.allocUnsafe(128 * 1024);
function captureFile(role: string, requested: string, file: string, executable = false): Entry {
  const entry: Entry = { role, requested, path: file };
  let fd: number | undefined;
  try {
    entry.realPath = realpathSync(file);
    if (executable) accessSync(file, constants.X_OK);
    fd = openSync(file, constants.O_RDONLY | constants.O_NONBLOCK);
    const before = fstatSync(fd, { bigint: true });
    if (!before.isFile()) throw new Error('Identity input must be a regular file.');
    const hash = createHash('sha256');
    let count: number;
    while ((count = readSync(fd, buffer, 0, buffer.length, null)) > 0) hash.update(buffer.subarray(0, count));
    const after = fstatSync(fd, { bigint: true });
    if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size || before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs || realpathSync(file) !== entry.realPath) throw new Error('Identity input changed while being read.');
    entry.sha256 = hash.digest('hex');
  } catch (error) { entry.error = error instanceof Error ? error.message : String(error); }
  finally { if (fd !== undefined) closeSync(fd); }
  return entry;
}

export function captureIdentity(declaration: IdentityDeclaration | undefined, options: { cwd: string; env?: NodeJS.ProcessEnv; executable?: string; browser?: string; harness: string }): IdentitySnapshot {
  const cwd = path.resolve(options.cwd), env = options.env ?? process.env;
  const entries: Entry[] = [captureFile('runner-interpreter', process.execPath, process.execPath, true),
    captureFile('runner-evaluator', options.harness, options.harness.startsWith('file:') ? fileURLToPath(options.harness) : path.resolve(cwd, options.harness))];
  const executable = (role: string, requested: string) => {
    try { entries.push(captureFile(role, requested, resolveExecutable(requested, cwd, env), true)); }
    catch (error) { entries.push({ role, requested, error: error instanceof Error ? error.message : String(error) }); }
  };
  if (options.executable) executable('command-executable', options.executable);
  if (options.browser) executable('browser', options.browser);
  for (const file of declaration?.files ?? []) entries.push(captureFile(file.role, file.path, path.resolve(cwd, file.path)));
  for (const tool of declaration?.tools ?? []) executable(tool.role, tool.executable);
  return { version: 1, scope: identityScope, entries };
}

export function identityComplete(snapshot: IdentitySnapshot | undefined): boolean {
  return Boolean(snapshot && identitySnapshotSchema.safeParse(snapshot).success && snapshot.entries.every(entry => entry.path && entry.realPath && entry.sha256 && !entry.error));
}

export function sameIdentity(a: IdentitySnapshot | undefined, b: IdentitySnapshot | undefined): boolean {
  return identityComplete(a) && identityComplete(b) && JSON.stringify(a!.entries) === JSON.stringify(b!.entries);
}
