import { it, expect } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { commandProofSchema, executeCommand } from '../src/eval/command.js';

async function checkArtifact(dir: string, source: string, checks: Array<{ operator: string; value: unknown }>) {
  const output = join(dir, 'output');
  const spec = commandProofSchema.parse({ mode: 'acceptance', title: 'Binary properties', requirement: 'Decode captured content',
    current: { executable: process.execPath, cwd: dir, args: ['-e', 'require("node:fs").copyFileSync(process.argv[1],process.argv[2])', source, output], deadlineMs: 10000 },
    checks: checks.map((check, index) => ({ id: `check-${index}`, source: 'artifact', path: output, ...check })),
  });
  return executeCommand(spec, spec.current, join(dir, `run-${crypto.randomUUID()}`));
}

it.each(['webp', 'gif', 'tiff', 'avif'] as const)('decodes %s content independently of extension and rejects wrong properties and truncated pixels', async format => {
  const dir = mkdtempSync(join(tmpdir(), 'praman-image-extra-'));
  try {
    const source = join(dir, 'no-extension');
    const data = await sharp({ create: { width: 7, height: 5, channels: 3, background: 'red' } }).toFormat(format).toBuffer();
    writeFileSync(source, data);
    const run = await checkArtifact(dir, source, [
      { operator: 'image', value: { format, width: 7, height: 5, frames: 1 } },
      { operator: 'image', value: { format, width: 8 } },
      { operator: 'image', value: { format: 'png' } },
    ]);
    expect(run.checks.slice(1).map(row => row.verdict)).toEqual(['passed', 'failed', 'failed']);
    expect(run.checks[1].observed).toEqual({ decoded: true, format, width: 7, height: 5, frames: 1 });
    writeFileSync(source, data.subarray(0, Math.floor(data.length / 2)));
    const broken = await checkArtifact(dir, source, [{ operator: 'image', value: { format } }]);
    expect(broken.checks[1].verdict).toBe('failed');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

it.each(['gif', 'webp', 'tiff'] as const)('decodes every %s page and reports per-frame dimensions and frame-count mismatches', async format => {
  const dir = mkdtempSync(join(tmpdir(), 'praman-animated-'));
  try {
    const source = join(dir, 'frames');
    const pixels = Buffer.concat([Buffer.alloc(7 * 5 * 3, 0), Buffer.alloc(7 * 5 * 3, 255)]);
    const data = await sharp(pixels, { raw: { width: 7, height: 10, channels: 3, pageHeight: 5 } }).toFormat(format).toBuffer();
    writeFileSync(source, data);
    const run = await checkArtifact(dir, source, [{ operator: 'image', value: { format, width: 7, height: 5, frames: 2 } }, { operator: 'image', value: { format, frames: 1 } }]);
    expect(run.checks.slice(1).map(row => row.verdict)).toEqual(['passed', 'failed']);
    expect(run.checks[1].observed).toEqual({ decoded: true, format, width: 7, height: 5, frames: 2 });
    writeFileSync(source, data.subarray(0, Math.floor(data.length * 0.8)));
    const broken = await checkArtifact(dir, source, [{ operator: 'image', value: { format, frames: 2 } }]);
    expect(broken.checks[1].verdict).toBe('failed');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

const decodersAvailable = spawnSync('ffmpeg', ['-version']).status === 0 && spawnSync('ffprobe', ['-version']).status === 0;
it.skipIf(!decodersAvailable).each(['wav', 'mp3', 'flac', 'ogg'] as const)('fully decodes %s audio and distinguishes property mismatches, corruption and unavailable decoders', async format => {
  const dir = mkdtempSync(join(tmpdir(), 'praman-audio-'));
  try {
    const source = join(dir, `source.${format}`);
    execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=16000:duration=1', '-ac', '1', '-threads', '1', source]);
    const run = await checkArtifact(dir, source, [
      { operator: 'audio', value: { format, channels: 1, sampleRate: 16000, durationMs: { min: 900, max: 1300 } } },
      { operator: 'audio', value: { format, channels: 2 } },
      { operator: 'audio', value: { format, durationMs: { min: 2000, max: 3000 } } },
      { operator: 'audio', value: { format: format === 'wav' ? 'mp3' : 'wav' } },
    ]);
    expect(run.checks.slice(1).map(row => row.verdict)).toEqual(['passed', 'failed', 'failed', 'failed']);
    expect(run.checks[1].observed).toMatchObject({ decoded: true, format, channels: 1, sampleRate: 16000 });
    const originalPath = process.env.PATH;
    try {
      process.env.PATH = '';
      const unavailable = await checkArtifact(dir, source, [{ operator: 'audio', value: { format } }]);
      expect(unavailable.checks[1].verdict).toBe('insufficient_evidence');
    } finally { if (originalPath === undefined) delete process.env.PATH; else process.env.PATH = originalPath; }
    const data = readFileSync(source); writeFileSync(source, data.subarray(0, Math.floor(data.length / 2)));
    const broken = await checkArtifact(dir, source, [{ operator: 'audio', value: { format, durationMs: { min: 900, max: 1300 } } }]);
    expect(broken.checks[1].verdict).toBe('failed');
  } finally { rmSync(dir, { recursive: true, force: true }); }
}, 90000);

it.skipIf(!decodersAvailable).each(['mp4', 'webm'] as const)('fully decodes %s video frames and rejects wrong dimensions, frame counts and truncated streams', async format => {
  const dir = mkdtempSync(join(tmpdir(), 'praman-video-'));
  try {
    const source = join(dir, `source.${format}`);
    execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=red:s=32x24:r=4:d=1', '-c:v', format === 'mp4' ? 'mpeg4' : 'libvpx-vp9', '-threads', '1', source]);
    const run = await checkArtifact(dir, source, [
      { operator: 'video', value: { format, width: 32, height: 24, frames: 4, durationMs: { min: 900, max: 1100 } } },
      { operator: 'video', value: { format, width: 33 } }, { operator: 'video', value: { format, frames: 3 } },
      { operator: 'video', value: { format: format === 'mp4' ? 'webm' : 'mp4' } },
    ]);
    expect(run.checks.slice(1).map(row => row.verdict)).toEqual(['passed', 'failed', 'failed', 'failed']);
    expect(run.checks[1].observed).toMatchObject({ decoded: true, format, width: 32, height: 24, frames: 4 });
    const data = readFileSync(source); writeFileSync(source, data.subarray(0, Math.floor(data.length / 2)));
    const broken = await checkArtifact(dir, source, [{ operator: 'video', value: { format } }]);
    expect(broken.checks[1].verdict).toBe('failed');
  } finally { rmSync(dir, { recursive: true, force: true }); }
}, 90000);

it('keeps absent and stale binary evidence insufficient and rejects inverted duration ranges', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'praman-media-evidence-'));
  try {
    writeFileSync(join(dir, 'stale'), 'old');
    const declaration = { mode: 'acceptance', title: 'Evidence', requirement: 'Fresh file', current: { executable: process.execPath, cwd: dir, args: ['-e', ''], deadlineMs: 1000 }, checks: [
      { id: 'missing', source: 'artifact', path: 'missing', operator: 'audio', value: { format: 'wav' } },
      { id: 'stale', source: 'artifact', path: 'stale', operator: 'video', value: { format: 'mp4' } },
    ] };
    const spec = commandProofSchema.parse(declaration);
    const run = await executeCommand(spec, spec.current, join(dir, 'run'));
    expect(run.checks.slice(1).map(row => row.verdict)).toEqual(['insufficient_evidence', 'insufficient_evidence']);
    expect(commandProofSchema.safeParse({ ...declaration, checks: [{ ...declaration.checks[0], value: { format: 'wav', durationMs: { min: 20, max: 10 } } }] }).success).toBe(false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
