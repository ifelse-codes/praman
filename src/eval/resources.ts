import { execFile } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { promisify } from 'node:util';
import { z } from 'zod';

export const resourceConfigSchema = z.object({
  intervalMs: z.number().int().min(100).max(10000),
  maxSamples: z.number().int().min(2).max(1000),
}).strict();
export type ResourceConfig = z.infer<typeof resourceConfigSchema>;
export interface ResourceSample { elapsedMs: number; rssKiB: number; cpuPercent: number }
export interface ResourceObservation {
  status: 'complete' | 'insufficient_evidence';
  scope: string; samples: ResourceSample[]; limitReached: boolean;
  peakRssKiB?: number; rssDeltaKiB?: number; rssSlopeKiBPerSecond?: number;
  peakReportedCpuPercent?: number; error?: string;
}
const run = promisify(execFile);

/** Descriptive endpoint trend, not statistical leak detection or an acceptance threshold. */
export function summarizeResources(samples: ResourceSample[]) {
  if (samples.length < 2) return {};
  const first = samples[0], last = samples[samples.length - 1];
  const span = last.elapsedMs - first.elapsedMs;
  if (span <= 0) return {};
  const rssDeltaKiB = last.rssKiB - first.rssKiB;
  return { peakRssKiB: Math.max(...samples.map(sample => sample.rssKiB)), rssDeltaKiB,
    rssSlopeKiBPerSecond: rssDeltaKiB * 1000 / span,
    peakReportedCpuPercent: Math.max(...samples.map(sample => sample.cpuPercent)) };
}

/** Observe only the owned root process; never enumerate unrelated processes or descendants. */
export function observeResources(pid: number, input: ResourceConfig) {
  const config = resourceConfigSchema.parse(input);
  const samples: ResourceSample[] = [];
  const started = performance.now();
  let closed = false, limitReached = false, error: string | undefined;
  let timer: NodeJS.Timeout | undefined;
  let pending: Promise<void>;
  async function sample() {
    if (closed) return;
    if (samples.length >= config.maxSamples) { limitReached = true; return; }
    try {
      const result = await run('/bin/ps', ['-o', 'rss=,pcpu=', '-p', String(pid)], {
        timeout: 1000, maxBuffer: 4096, env: { ...process.env, LC_ALL: 'C' },
      });
      const fields = result.stdout.trim().split(/\s+/).map(Number);
      if (fields.length !== 2 || fields.some(value => !Number.isFinite(value) || value < 0)) throw new Error('Invalid process resource observation');
      samples.push({ elapsedMs: performance.now() - started, rssKiB: fields[0], cpuPercent: fields[1] });
    } catch (failure) { if (!closed) error = String(failure); }
    if (!closed && !error) timer = setTimeout(() => { pending = sample(); }, config.intervalMs);
  }
  pending = sample();
  return {
    async stop(): Promise<ResourceObservation> {
      closed = true;
      clearTimeout(timer);
      await pending;
      const summary = summarizeResources(samples);
      return { status: !error && !limitReached && summary.rssDeltaKiB !== undefined ? 'complete' : 'insufficient_evidence',
        scope: 'Sampled root application process RSS (KiB) and ps-reported CPU percentage; excludes descendants, reset commands, PRAMAN, simulator, system totals and post-exit peaks. CPU semantics are platform-defined. Endpoint slope is descriptive, not leak diagnosis or a resource budget check.',
        samples, limitReached, ...summary, error };
    },
  };
}
