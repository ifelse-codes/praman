import { execFileSync } from 'node:child_process';
import { closeSync, openSync, readSync } from 'node:fs';
import sharp from 'sharp';
import { z } from 'zod';

const dimension = z.number().int().positive();
const duration = z.object({ min: z.number().nonnegative(), max: z.number().positive() }).strict().refine(value => value.max >= value.min, 'Duration maximum must not precede minimum');
const artifact = { id: z.string().min(1), source: z.literal('artifact'), path: z.string().min(1) };
export const mediaAssertion = z.discriminatedUnion('operator', [
  z.object({ ...artifact, operator: z.literal('image'), value: z.object({ format: z.enum(['png', 'jpeg', 'webp', 'gif', 'tiff', 'avif']), width: dimension.optional(), height: dimension.optional(), frames: dimension.optional() }).strict() }).strict(),
  z.object({ ...artifact, operator: z.literal('audio'), value: z.object({ format: z.enum(['wav', 'mp3', 'flac', 'ogg']), sampleRate: dimension.optional(), channels: dimension.optional(), durationMs: duration.optional() }).strict() }).strict(),
  z.object({ ...artifact, operator: z.literal('video'), value: z.object({ format: z.enum(['mp4', 'webm']), width: dimension.optional(), height: dimension.optional(), frames: dimension.optional(), durationMs: duration.optional() }).strict() }).strict(),
]);
type MediaAssertion = z.infer<typeof mediaAssertion>;
interface Inspection { verdict: 'passed' | 'failed' | 'insufficient_evidence'; reason: string; expected: unknown; observed: unknown; }
const probeSchema = z.object({
  streams: z.array(z.object({ index: z.number().int().nonnegative(), codec_type: z.string(), width: dimension.optional(), height: dimension.optional(),
    sample_rate: z.string().optional(), channels: dimension.optional(), avg_frame_rate: z.string().optional(), disposition: z.object({ attached_pic: z.number().optional() }).optional() })),
  format: z.object({ format_name: z.string(), duration: z.string().optional(), tags: z.object({ major_brand: z.string().optional() }).optional() }),
});
const maxPixels = 40_000_000;

/** Decode actual captured artifacts, never infer format from their filename. */
export async function inspectMedia(check: MediaAssertion, file: string): Promise<Inspection> {
  let observed: Record<string, unknown> = { decoded: false };
  let limited = false;
  try {
    if (check.operator === 'image') {
      const image = sharp(file, { failOn: 'warning', limitInputPixels: false, animated: true }).timeout({ seconds: 15 });
      const metadata = await image.metadata();
      const frames = metadata.pages ?? 1;
      const height = metadata.pageHeight ?? metadata.height ?? 0;
      if ((metadata.width ?? 0) * height * frames > maxPixels) { limited = true; throw new Error('Image decode pixel limit'); }
      const format = metadata.format === 'heif' && metadata.compression === 'av1' ? 'avif' : metadata.format;
      if (!['png', 'jpeg', 'webp', 'gif', 'tiff', 'avif'].includes(format ?? '')) throw new Error('Unsupported image format');
      const { info } = await image.raw().toBuffer({ resolveWithObject: true });
      if (info.width * info.height > maxPixels) { limited = true; throw new Error('Image decode pixel limit'); }
      observed = { decoded: true, format, width: info.width, height: info.pageHeight ?? info.height / frames,
        ...(check.value.frames !== undefined || frames > 1 ? { frames } : {}) };
      const passed = format === check.value.format && (check.value.width === undefined || check.value.width === observed.width)
        && (check.value.height === undefined || check.value.height === observed.height) && (check.value.frames === undefined || check.value.frames === frames);
      return { verdict: passed ? 'passed' : 'failed', reason: passed ? 'Declared image properties satisfied.' : 'Image properties differ; inspect private evidence.', expected: check.value, observed };
    }

    // Probe before decoding to bound work; only local-file containers are accepted.
    const options = { encoding: 'utf8' as const, stdio: 'pipe' as const, timeout: 15000, maxBuffer: 1024 * 1024, windowsHide: true };
    const input = ['-protocol_whitelist', 'file,pipe', '-threads', '1', file];
    const probe = probeSchema.parse(JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', ...input], options)));
    const seconds = Number(probe.format.duration);
    if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 60 || probe.streams.length > 16) { limited = true; throw new Error('Finite media duration up to 60 seconds and at most 16 streams required'); }
    const video = probe.streams.filter(stream => stream.codec_type === 'video' && !stream.disposition?.attached_pic);
    const audio = probe.streams.filter(stream => stream.codec_type === 'audio');
    let pixels = 0;
    for (const stream of video) {
      const [numerator, denominator] = (stream.avg_frame_rate ?? '0/1').split('/').map(Number);
      const rate = numerator / denominator;
      if (!stream.width || !stream.height || !Number.isFinite(rate) || rate <= 0) { limited = true; throw new Error('Video pixel budget unavailable'); }
      pixels += stream.width * stream.height * Math.ceil(rate * seconds + 1);
    }
    if (pixels > maxPixels || audio.reduce((total, stream) => total + Number(stream.sample_rate) * (stream.channels ?? 0) * seconds, 0) > 100_000_000
      || audio.some(stream => !Number(stream.sample_rate) || !stream.channels)) { limited = true; throw new Error('Media decode budget unavailable or exceeded'); }
    const name = probe.format.format_name;
    let format: string | undefined;
    if (['wav', 'mp3', 'flac', 'ogg'].includes(name)) format = name;
    else if (name.split(',').includes('mp4') && /^(iso\w|mp4\w|avc1|dash|M4V )$/.test(probe.format.tags?.major_brand ?? '')) format = 'mp4';
    else if (name === 'matroska,webm') {
      // ffprobe groups Matroska and WebM. Require the EBML DocType to say WebM.
      const header = Buffer.alloc(4096);
      const fd = openSync(file, 'r');
      try { readSync(fd, header, 0, header.length, 0); } finally { closeSync(fd); }
      if (header.readUInt32BE(0) === 0x1a45dfa3) {
        // EBML header size is a variable-length integer, followed by header elements.
        let offset = 4;
        let sizeLength = 1;
        while (sizeLength <= 8 && !(header[offset] & (0x80 >> (sizeLength - 1)))) sizeLength++;
        if (sizeLength > 8) throw new Error('Invalid EBML header');
        let size = header[offset] & ((0x80 >> (sizeLength - 1)) - 1);
        for (let i = 1; i < sizeLength; i++) size = size * 256 + header[offset + i];
        offset += sizeLength;
        const end = offset + size;
        if (end > header.length) throw new Error('Unsupported EBML header size');
        while (offset < end) {
          const first = header[offset++];
          const idLength = first & 0x80 ? 1 : first & 0x40 ? 2 : first & 0x20 ? 3 : 4;
          let id = first;
          for (let i = 1; i < idLength; i++) id = id * 256 + header[offset++];
          const sizeByte = header[offset++];
          // Header fields are small; reject unsupported encodings, never guess a DocType.
          if (!(sizeByte & 0x80)) throw new Error('Unsupported EBML element size');
          const length = sizeByte & 0x7f;
          if (offset + length > end) throw new Error('Invalid EBML element');
          if (id === 0x4282 && header.toString('utf8', offset, offset + length) === 'webm') format = 'webm';
          offset += length;
        }
      }
    }
    const primary = check.operator === 'video' ? video[0] : audio[0];
    if (!primary || !format) throw new Error('Required media stream or supported container unavailable');
    // -xerror makes decoding corruption fatal; progress proves samples/frames were emitted.
    const progress = execFileSync('ffmpeg', ['-v', 'error', '-nostdin', '-xerror', '-err_detect', 'explode', '-protocol_whitelist', 'file,pipe', '-threads', '1', '-i', file,
      ...[...video, ...audio].flatMap(stream => ['-map', `0:${stream.index}`]), '-threads', '1', '-progress', 'pipe:1', '-nostats', '-f', 'null', '-'], options);
    const times = [...progress.matchAll(/^out_time_us=(\d+)$/gm)].map(match => Number(match[1]));
    if (!times.some(time => time > 0)) throw new Error('No decoded media samples');
    const decodedMs = Math.max(...times) / 1000;
    if (decodedMs < seconds * 1000 - 100) throw new Error('Decoded stream ends before its declared duration');
    let frames: number | undefined;
    if (check.operator === 'video') {
      frames = Math.max(0, ...[...progress.matchAll(/^frame=(\d+)$/gm)].map(match => Number(match[1])));
      if (!Number.isInteger(frames) || frames <= 0) throw new Error('No decoded video frames');
      if (frames * primary.width! * primary.height! > maxPixels) { limited = true; throw new Error('Video decoded pixel budget exceeded'); }
    }
    observed = { decoded: true, format, durationMs: seconds * 1000,
      ...(check.operator === 'audio' ? { sampleRate: Number(primary.sample_rate), channels: primary.channels } : { width: primary.width, height: primary.height, frames }) };
    const expectedDuration = check.value.durationMs;
    let passed = format === check.value.format && (!expectedDuration || seconds * 1000 >= expectedDuration.min && seconds * 1000 <= expectedDuration.max);
    if (check.operator === 'audio') passed &&= (check.value.channels === undefined || check.value.channels === primary.channels) && (check.value.sampleRate === undefined || check.value.sampleRate === Number(primary.sample_rate));
    else passed &&= (check.value.width === undefined || check.value.width === primary.width) && (check.value.height === undefined || check.value.height === primary.height) && (check.value.frames === undefined || check.value.frames === frames);
    return { verdict: passed ? 'passed' : 'failed', reason: passed ? 'Declared media properties satisfied after full decode.' : 'Media properties differ; inspect private evidence.', expected: check.value, observed };
  } catch (error) {
    const failure = error as NodeJS.ErrnoException & { stderr?: string };
    const unavailable = limited || ['ENOENT', 'EACCES', 'ETIMEDOUT', 'ENOBUFS'].includes(failure.code ?? '') || /timeout|Unknown decoder|Decoder .*not found|Decoding requested, but no decoder found/i.test(`${failure.message} ${failure.stderr ?? ''}`);
    return { verdict: unavailable ? 'insufficient_evidence' : 'failed', reason: unavailable ? 'Media decoder unavailable or evidence exceeds decode limits.' : 'Media decode failed; inspect private artifact.', expected: check.value, observed };
  }
}
