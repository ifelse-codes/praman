import { afterEach, beforeEach, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { changeSpecSchema } from '../src/case/change.js';
import { composeWalkthrough, compositionManifest, enforceCompositionDuration, shortCompositionSchema, validateShortComposition } from '../src/case/composition.js';
import { previewChange, previewCommands } from '../src/core/preview.js';
import { commandReplayGate, demonstrateCommands } from '../src/core/commandDemonstrate.js';
import { loadCommandSpec, proveCommands } from '../src/eval/command.js';

let root: string, server: Server, origin: string, visits: number;
beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'praman-composition-')); visits = 0;
  server = createServer((_req, res) => { visits++; res.setHeader('Content-Type', 'text/html'); res.end('<style>#result{position:fixed;top:180px;left:90px;width:300px;height:70px}</style><button onclick="document.querySelector(\'#result\').textContent=\'Ready\'">Run</button><div id="result">Waiting</div>'); });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('Missing listener');
  origin = `http://127.0.0.1:${address.port}`;
});
afterEach(async () => { server.close(); await once(server, 'close'); rmSync(root, { recursive: true, force: true }); });
const ref = (stage: 'before' | 'code' | 'after', beat: number) => ({ stage, beat });
function repairStory() {
  return { before: [{ text: 'Context and failure.', shortText: 'The value is lost.', selector: '#result' }, { text: 'Extra diagnosis.' }],
    code: { text: 'Source explanation.', beats: [{ text: 'Original mistake.', focus: { file: 'result.ts', side: 'before', from: 1, to: 1 } }, { text: 'Replacement rule.', focus: { file: 'result.ts', side: 'after', from: 1, to: 1 } }] },
    after: [{ text: 'Fixed result.' }, { text: 'Author credit and declared-case limits.' }, { text: 'Optional detail.' }],
    short: shortCompositionSchema.parse({ context: ref('before', 0), failure: ref('before', 0), cause: ref('code', 0), fix: ref('code', 1), outcome: ref('after', 0), attribution: ref('after', 1), limits: ref('after', 1) }) };
}
it('keeps essential repair roles, original focus and lineage without changing the full story', () => {
  const story = repairStory(), saved = JSON.stringify(story);
  const short = composeWalkthrough(story, 'repair', 'short');
  expect(short.before?.map(b => b.text)).toEqual(['The value is lost.']);
  expect(short.code?.beats?.map(b => b.focus.side)).toEqual(['before', 'after']);
  expect(short.after.map(b => b.text)).toEqual(['Fixed result.', 'Author credit and declared-case limits.']);
  const fullManifest = compositionManifest(story, 'repair', 'full'), shortManifest = compositionManifest(story, 'repair', 'short');
  expect(shortManifest.sourceStoryHash).toBe(fullManifest.sourceStoryHash);
  expect(shortManifest.selectedBeats).toEqual([ref('before', 0), ref('code', 0), ref('code', 1), ref('after', 0), ref('after', 1)]);
  expect(JSON.stringify(story)).toBe(saved);
  expect(composeWalkthrough(story, 'repair').before?.map(b => b.text)).toEqual(['Context and failure.', 'Extra diagnosis.']);
});
it('refuses missing essential evidence and repair claims in comparison or acceptance', () => {
  const story = repairStory(); story.short.fix = ref('code', 99);
  expect(() => composeWalkthrough(story, 'repair', 'short')).toThrow('missing');
  expect(() => composeWalkthrough(repairStory(), 'comparison', 'short')).toThrow('Only repair');
  const after = ref('after', 0), before = ref('before', 0);
  const comparison = { before: [{ text: 'Synthetic control, not a historical defect.' }], after: [{ text: 'Current result; supplied by its author; only this case.' }], short: shortCompositionSchema.parse({ context: before, baseline: before, outcome: after, attribution: after, limits: after }) };
  expect(composeWalkthrough(comparison, 'comparison', 'short').before?.[0].text).toBe('Synthetic control, not a historical defect.');
  expect(() => validateShortComposition(comparison, 'acceptance')).toThrow('current-only');
  expect(() => composeWalkthrough({ after: [{ text: 'Current.' }] }, 'acceptance', 'short')).toThrow('requires');
});
it('blocks measured overflow instead of speeding up or truncating essential speech', () => {
  const story = repairStory();
  enforceCompositionDuration(story, 'repair', 'short', 60);
  for (const seconds of [60.001, Infinity, NaN, 0]) expect(() => enforceCompositionDuration(story, 'repair', 'short', seconds)).toThrow('duration budget');
  expect(shortCompositionSchema.safeParse({ ...story.short, maxDurationSeconds: 61 }).success).toBe(false);
});
it('executes uncut browser actions/checks while previewing only selected current beats', async () => {
  const after = ref('after', 1);
  const spec = changeSpecSchema.parse({ mode: 'acceptance', title: 'Result', change: 'Show result', afterUrl: origin,
    steps: [{ action: 'click', selector: 'button', note: 'Run' }], checks: [{ id: 'ready', kind: 'text', selector: '#result', equals: 'Ready' }],
    walkthrough: { startStep: 0, after: [{ step: 0, text: 'Extra detail.', selector: '#result' }, { step: 0, text: 'Full current result, author and limits.', shortText: 'Current result; author supplied; this case only.', selector: '#result' }], short: { context: after, outcome: after, attribution: after, limits: after } } });
  const full = await previewChange(spec, join(root, 'full'));
  const short = await previewChange(spec, join(root, 'short'), 'short');
  expect(full.scenes).toHaveLength(2); expect(short.scenes).toHaveLength(1);
  const receipt = JSON.parse(readFileSync(short.receiptPath, 'utf8'));
  expect(receipt).toMatchObject({ proof: false, composition: { cut: 'short', selectedBeats: [after] } });
  expect(short.scenes[0].beat).toBe(1);
  const missingFocus = changeSpecSchema.parse({ ...spec, walkthrough: { ...spec.walkthrough, after: spec.walkthrough!.after.map(beat => ({ ...beat, selector: '#unavailable' })) } });
  const blocked = await previewChange(missingFocus, join(root, 'selected-missing'), 'short');
  expect(blocked).toMatchObject({ status: 'blocked', diagnostics: [{ stage: 'current', beat: 1 }] });
  const run = JSON.parse(readFileSync(join(root, 'short/preflight/current/result.json'), 'utf8'));
  expect(run.completedSteps).toBe(1); expect(run.checks[0].observed).toBe('Ready'); expect(visits).toBeGreaterThanOrEqual(2);
  expect(changeSpecSchema.safeParse({ ...spec, walkthrough: { ...spec.walkthrough, short: { ...spec.walkthrough!.short, outcome: ref('after', 9) } } }).success).toBe(false);
}, 90000);
it('rejects invalid short command roles before dispatch and preserves existing evidence', async () => {
  const marker = join(root, 'executed');
  const commands = join(root, 'commands.json'); writeFileSync(commands, JSON.stringify({ mode: 'acceptance', title: 'Result', requirement: 'Ready', current: { executable: process.execPath, args: ['-e', `require('fs').writeFileSync(${JSON.stringify(marker)},'yes');console.log('Ready')`], cwd: root, deadlineMs: 2000 }, checks: [{ id: 'ready', source: 'stdout', operator: 'equals', value: 'Ready\n' }] }));
  const story = { after: [{ text: 'Current result.', stream: 'stdout', from: 1, to: 1 }], short: { context: ref('after', 0), outcome: ref('after', 9), attribution: ref('after', 0), limits: ref('after', 0) } };
  const file = join(root, 'plan.json'); writeFileSync(file, JSON.stringify({ commandsPath: commands, walkthrough: story }));
  expect((await previewCommands(file, join(root, 'bad-preview'), 'short')).status).toBe('blocked');
  await expect(demonstrateCommands(file, join(root, 'bad-delivery'), 'short')).rejects.toThrow('missing');
  expect(existsSync(marker)).toBe(false); expect(existsSync(join(root, 'bad-delivery'))).toBe(false);
  writeFileSync(join(root, 'bad-preview/saved-movie'), 'owned evidence');
  await expect(previewCommands(file, join(root, 'bad-preview'), 'short')).rejects.toThrow('fresh');
  expect(readFileSync(join(root, 'bad-preview/saved-movie'), 'utf8')).toBe('owned evidence');
});
it('short command preview neither consumes nor replaces fresh exact replay authority', async () => {
  const script = join(root, 'result.cjs'); writeFileSync(script, 'console.log("Ready")');
  const commands = join(root, 'commands.json'); writeFileSync(commands, JSON.stringify({ mode: 'acceptance', title: 'Result', requirement: 'Ready', current: { executable: process.execPath, args: [script], cwd: root, deadlineMs: 2000, identity: { files: [{ role: 'script', path: script }] } }, checks: [{ id: 'ready', source: 'stdout', operator: 'equals', value: 'Ready\n' }] }));
  const after = ref('after', 0), plan = join(root, 'plan.json'); writeFileSync(plan, JSON.stringify({ commandsPath: commands, walkthrough: { after: [{ text: 'Ready; authored fixture; this case only.', stream: 'stdout', from: 1, to: 1 }], short: { context: after, outcome: after, attribution: after, limits: after } } }));
  const proof = await proveCommands(commands, join(root, 'proof'));
  const preview = await previewCommands(plan, join(root, 'preview'), 'short'); expect(preview.proof).toBe(false);
  const spec = loadCommandSpec(commands), replay = commandReplayGate(spec, proof.proofPath, root);
  expect((await replay('current')).run.verdict).toBe('passed');
  writeFileSync(script, '// changed identity, identical output\nconsole.log("Ready")');
  expect(() => commandReplayGate(spec, proof.proofPath, join(root, 'refused'))).toThrow('identities');
}, 90000);
