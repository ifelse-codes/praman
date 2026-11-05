import { expect, test } from 'vitest';
import { summarizeResources, resourceConfigSchema } from '../src/eval/resources.js';

test('resource endpoint trends preserve growth, release and measured-time units without inferring a leak', () => {
  expect(summarizeResources([{ elapsedMs: 100, rssKiB: 1000, cpuPercent: 2 }, { elapsedMs: 600, rssKiB: 1600, cpuPercent: 40 }, { elapsedMs: 1100, rssKiB: 1200, cpuPercent: 1 }])).toEqual({ peakRssKiB: 1600, rssDeltaKiB: 200, rssSlopeKiBPerSecond: 200, peakReportedCpuPercent: 40 });
  expect(summarizeResources([{ elapsedMs: 0, rssKiB: 2000, cpuPercent: 1 }, { elapsedMs: 2000, rssKiB: 1000, cpuPercent: 2 }]).rssSlopeKiBPerSecond).toBe(-500);
});
test('absent or zero-span observations cannot manufacture a resource trend', () => {
  expect(summarizeResources([])).toEqual({});
  expect(summarizeResources([{ elapsedMs: 1, rssKiB: 0, cpuPercent: 0 }])).toEqual({});
  expect(summarizeResources([{ elapsedMs: 1, rssKiB: 0, cpuPercent: 0 }, { elapsedMs: 1, rssKiB: 2, cpuPercent: 0 }])).toEqual({});
});
test('sampling rejects unbounded or ambiguous observation declarations', () => {
  for (const input of [{ intervalMs: 0, maxSamples: 10 }, { intervalMs: 100, maxSamples: 1 }, { intervalMs: 100, maxSamples: 1001 }, { intervalMs: 10001, maxSamples: 10 }, { intervalMs: 100, maxSamples: 10, shell: true }]) expect(resourceConfigSchema.safeParse(input).success).toBe(false);
});
