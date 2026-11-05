import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { accessSync, chmodSync, constants, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { delimiter, join, resolve } from 'node:path';
import { z } from 'zod';

export type SpeechSettings =
  | { engine: 'vatra'; executable: string; voice: string }
  | { engine: 'say' | 'espeak'; executable: string; rate: number };

/** Preserve the existing provider, voice and generation arguments on both delivery surfaces. */
export function configuredSpeech(): SpeechSettings {
  const vatra = process.env.PRAMAN_VATRA;
  if (vatra) return { engine: 'vatra', executable: vatra, voice: 'af_heart' };
  if (process.platform === 'darwin' && existsSync('/usr/bin/say')) return { engine: 'say', executable: '/usr/bin/say', rate: 175 };
  const executable = ['espeak-ng', 'espeak'].find(bin => spawnSync(bin, ['--version'], { stdio: 'ignore' }).status === 0);
  if (!executable) throw new Error('Narrated delivery requires an available speech engine; configure PRAMAN_VATRA.');
  return { engine: 'espeak', executable, rate: 175 };
}

const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const privateJson = (file: string, value: unknown) => writeFileSync(file, JSON.stringify(value, null, 2), { mode: 0o600, flag: 'wx' });
const manifestSchema = z.object({ kind: z.literal('speech-asset'), proof: z.literal(false), version: z.literal(1), key: z.string().regex(/^[a-f0-9]{64}$/), sha256: z.string().regex(/^[a-f0-9]{64}$/) }).strict();

function executablePath(requested: string, env: NodeJS.ProcessEnv): string {
  const candidates = requested.includes('/') ? [resolve(requested)] : (env.PATH ?? '/usr/bin:/bin').split(delimiter).map(dir => resolve(dir || '.', requested));
  for (const file of candidates) {
    try { accessSync(file, constants.X_OK); if (statSync(file).isFile()) return realpathSync(file); } catch { /* Try the next PATH entry. */ }
  }
  throw new Error('Requested speech helper is unavailable; cached audio cannot replace it.');
}

/** Probe AND fully decode each per-run copy, including hits. Never trust cached timing. */
function measureSpeech(file: string): number {
  if (!statSync(file).isFile() || statSync(file).size === 0) throw new Error('Speech asset must be a nonempty readable regular file.');
  const options = { encoding: 'utf8' as const, stdio: 'pipe' as const, timeout: 60000, maxBuffer: 1024 * 1024 };
  const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-protocol_whitelist', 'file,pipe', '-show_entries', 'format=duration:stream=codec_type', '-of', 'json', file], options));
  const seconds = Number(probe.format?.duration);
  if (!Number.isFinite(seconds) || seconds <= 0 || probe.streams?.length !== 1 || probe.streams[0].codec_type !== 'audio') throw new Error('Speech engine produced no measurable audio-only media.');
  const progress = execFileSync('ffmpeg', ['-v', 'error', '-nostdin', '-xerror', '-err_detect', 'explode', '-protocol_whitelist', 'file,pipe', '-i', file, '-map', '0:a:0', '-progress', 'pipe:1', '-nostats', '-f', 'null', '-'], options);
  const times = [...progress.matchAll(/^out_time_us=(\d+)$/gm)].map(match => Number(match[1]));
  if (!times.some(time => time > 0) || Math.max(...times) / 1e6 < seconds - 0.1) throw new Error('Speech asset did not fully decode to its measured duration.');
  return seconds;
}

/**
 * Audio-only optimization. The key excludes scenes, cuts, beat indexes and proof.
 * Opaque provider internals are not attested: key the helper bytes, exact argv and
 * entire inherited environment conservatively, without persisting environment values.
 */
export function prepareSpeech(text: string, stem: string, settings: SpeechSettings = configuredSpeech(), cacheDirectory = resolve('.praman/speech-cache/v1')) {
  if (!text.trim()) throw new Error('Narration must contain non-whitespace text.');
  const env = { ...process.env };
  const executable = executablePath(settings.executable, env);
  const executableHash = hash(readFileSync(executable));
  const extension = settings.engine === 'say' ? '.aiff' : '.wav';
  const args = (input: string, output: string): string[] => settings.engine === 'vatra'
    ? ['--engine', 'mlx', '--voice', settings.voice, '--file', input, '--out', output, '--join']
    : settings.engine === 'say' ? ['-r', String(settings.rate), '-o', output, '-f', input]
      : ['-s', String(settings.rate), '-w', output, '-f', input];
  const provider = { ...settings, executable, executableHash, arguments: args('<text>', '<audio>'), cwd: process.cwd(),
    environmentHash: hash(JSON.stringify(Object.entries(env).filter((entry): entry is [string, string] => entry[1] !== undefined).sort(([a], [b]) => a.localeCompare(b)))) };
  const key = hash(JSON.stringify({ version: 1, text, provider }));
  const entry = join(cacheDirectory, key), audio = stem + extension, receipt = stem + '.speech.json';
  let pending: string | undefined;
  try {
    writeFileSync(stem + '.txt', text, { mode: 0o600, flag: 'wx' });
    let reused = false;
    let sha256: string;
    if (existsSync(entry)) {
      const manifest = manifestSchema.parse(JSON.parse(readFileSync(join(entry, 'asset.json'), 'utf8')));
      if (manifest.key !== key) throw new Error('Speech cache key mismatch.');
      const cached = join(entry, 'audio' + extension);
      if (!statSync(cached).isFile()) throw new Error('Speech cache audio is not a regular file.');
      copyFileSync(cached, audio, constants.COPYFILE_EXCL); chmodSync(audio, 0o600);
      sha256 = hash(readFileSync(audio));
      if (sha256 !== manifest.sha256) throw new Error('Speech cache audio integrity mismatch.');
      reused = true;
    } else {
      if (existsSync(audio)) throw new Error('Speech output already exists; choose a fresh note destination.');
      execFileSync(executable, args(stem + '.txt', audio), { env, stdio: 'pipe' });
      chmodSync(audio, 0o600);
      sha256 = hash(readFileSync(audio));
    }
    const seconds = measureSpeech(audio);
    if (hash(readFileSync(executable)) !== executableHash) throw new Error('Speech helper changed during narration preparation.');
    if (!reused) {
      mkdirSync(cacheDirectory, { recursive: true, mode: 0o700 });
      pending = mkdtempSync(join(cacheDirectory, '.pending-')); chmodSync(pending, 0o700);
      copyFileSync(audio, join(pending, 'audio' + extension)); chmodSync(join(pending, 'audio' + extension), 0o600);
      privateJson(join(pending, 'asset.json'), { kind: 'speech-asset', proof: false, version: 1, key, sha256 });
      // Concurrent misses may generate twice; publish only complete entries, never overwrite a winner.
      try { renameSync(pending, entry); pending = undefined; }
      catch (error) { if (!['EEXIST', 'ENOTEMPTY'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error; }
    }
    const result = { kind: 'speech-asset' as const, proof: false as const, status: reused ? 'reused' as const : 'generated' as const, key, sha256, audio, seconds, provider, cacheEntry: entry };
    privateJson(receipt, result);
    return result;
  } catch (error) {
    // A broken hit is an explicit recording failure, not silent speech or an unobserved regeneration.
    if (!existsSync(receipt)) privateJson(receipt, { kind: 'speech-asset', proof: false, status: 'blocked', key, error: error instanceof Error ? error.message : String(error) });
    throw error;
  } finally { if (pending) rmSync(pending, { recursive: true, force: true }); }
}
