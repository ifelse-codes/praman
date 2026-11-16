import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import type { IdentitySnapshot } from '../eval/identity.js';

/**
 * A run that repeats an earlier one with the same declaration and the same declared inputs
 * proves nothing new about a change. The note is informational and never changes a verdict.
 */
export interface RepeatInputs {
  specHash: string;
  /** identityBefore of the first current run: runner, browser or executable, declared files and tools. */
  identity?: IdentitySnapshot;
  /** SHA-256 of the declared target identity reading, when one was declared and read. */
  target?: string;
  /** Source hashes of a managed environment. */
  sourceHashes?: Record<string, string>;
}

export function inputsHash(inputs: RepeatInputs): string {
  const identity = (inputs.identity?.entries ?? []).map(entry => [entry.role, entry.realPath ?? entry.path ?? entry.requested, entry.sha256 ?? entry.error ?? 'unavailable']);
  const sources = Object.entries(inputs.sourceHashes ?? {}).sort(([a], [b]) => a.localeCompare(b));
  return createHash('sha256').update(JSON.stringify({ version: 1, specHash: inputs.specHash, identity, target: inputs.target ?? null, sources })).digest('hex');
}

const maxSiblings = 200;
const maxProofBytes = 64 * 1024 * 1024;

/** The newest sibling run folder (same parent) whose proof.json has the same inputsHash. */
export function findRepeat(outDir: string, hash: string): { directory: string; verifiedAt: string; verdict: string } | undefined {
  const parent = dirname(resolve(outDir)), self = basename(resolve(outDir));
  let names: string[];
  try { names = readdirSync(parent, { withFileTypes: true }).filter(entry => entry.isDirectory() && entry.name !== self).map(entry => entry.name); }
  catch { return undefined; }
  const candidates = names.flatMap(name => {
    const file = join(parent, name, 'proof.json');
    try { const info = statSync(file); return info.isFile() && info.size <= maxProofBytes ? [{ name, file, mtime: info.mtimeMs }] : []; }
    catch { return []; }
  }).sort((a, b) => b.mtime - a.mtime).slice(0, maxSiblings);
  let found: { directory: string; verifiedAt: string; verdict: string } | undefined;
  for (const candidate of candidates) {
    try {
      const proof = JSON.parse(readFileSync(candidate.file, 'utf8')) as { inputsHash?: unknown; verifiedAt?: unknown; verdict?: unknown };
      if (proof.inputsHash !== hash || typeof proof.verifiedAt !== 'string') continue;
      if (!found || proof.verifiedAt > found.verifiedAt) found = { directory: join(parent, candidate.name), verifiedAt: proof.verifiedAt, verdict: String(proof.verdict) };
    } catch { /* An unreadable earlier run is not a repeat. */ }
  }
  return found;
}

/** `repeatOf` is the earlier run's folder (an output path); the note never contains it. */
export function repeatFields(outDir: string, hash: string): { repeatOf?: string; repeatNote?: string } {
  const earlier = findRepeat(outDir, hash);
  if (!earlier) return {};
  return { repeatOf: earlier.directory, repeatNote: `Same declaration and declared inputs as an earlier run (${earlier.verdict}, ${earlier.verifiedAt}): this run proves nothing new about a change. Add a check that exercises the change, or declare a target so a changed app is told apart.` };
}

export function repeatLine(result: { repeatOf?: string; repeatNote?: string }): string | undefined {
  return result.repeatNote ? `Repeat: ${result.repeatNote}${result.repeatOf ? ` Earlier run: ${result.repeatOf}` : ''}` : undefined;
}
