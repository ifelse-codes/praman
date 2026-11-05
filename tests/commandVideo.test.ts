import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { appendFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { z } from 'zod';
import { commandReplayGate, demonstrateCommands } from '../src/core/commandDemonstrate.js';
import { commandInvocationSchema, commandProofSchema, loadCommandSpec, proveCommands } from '../src/eval/command.js';
import { commandVideoPlanSchema, preflightCommandWalkthrough } from '../src/report/commandVideo.js';

let root: string;
beforeEach(() => { root = mkdtempSync(path.join(tmpdir(), 'praman-video-gate-')); });
afterEach(() => { rmSync(root, { recursive: true, force: true }); });
const invocation = (code: string) => ({ executable: process.execPath, args: ['-e', code], cwd: '.', deadlineMs: 2000 });
type Invocation = z.input<typeof commandInvocationSchema>;
type CommandCheck = z.input<typeof commandProofSchema>['checks'][number];
async function prepare(current: Invocation = invocation('console.log("correct")'), checks: CommandCheck[] = [{ id: 'result', source: 'stdout', operator: 'contains', value: 'correct' }], before: Invocation = invocation('console.log("wrong")')) {
  const file = path.join(root, 'commands.json');
  writeFileSync(file, JSON.stringify({ mode: 'repair', baselineKind: 'historical', title: 'Parser result', requirement: 'Return the correct value', before, current, checks, regressionCheck: 'result', repeats: 2 }));
  const proof = await proveCommands(file, path.join(root, 'proof'));
  return { file, proof, spec: loadCommandSpec(file) };
}
function plan(commandsPath: string) {
  const beat = { text: 'The original command loses the value; the repaired command keeps it.', stream: 'stdout', from: 1, to: 1 };
  return { commandsPath, walkthrough: { before: [beat], code: { text: 'Author-supplied explanation; no source comparison is claimed.' }, after: [beat] } };
}

describe('command video proof and replay gates', () => {
  it('reexecutes both versions and retains matching old failure and current success', async () => {
    const { spec, proof } = await prepare();
    const replay = commandReplayGate(spec, proof.proofPath, root);
    const old = await replay('before'), fixed = await replay('current');
    expect(old.run.checks.find(c => c.id === 'result')?.verdict).toBe('failed');
    expect(fixed.run.verdict).toBe('passed');
    expect(readFileSync(fixed.run.stdout, 'utf8')).toBe('correct\n');
    expect(fixed.run.resultPath).not.toBe(fixed.reference.resultPath);
    await expect(replay('current')).rejects.toThrow('exactly once');
  });
  it('rejects changed output even when all declared replay assertions still pass', async () => {
    const { spec, proof } = await prepare(invocation('const f=require("fs");let n=0;try{n=+f.readFileSync("counter")}catch{};f.writeFileSync("counter",String(++n));console.log("correct "+n)'));
    expect(proof.verdict).toBe('passed');
    await expect(commandReplayGate(spec, proof.proofPath, root)('current')).rejects.toThrow('diverged');
  });
  it('compares artifact bytes, not just their broad passing assertion', async () => {
    const { spec, proof } = await prepare(invocation('const f=require("fs");let n=0;try{n=+f.readFileSync("counter")}catch{};f.writeFileSync("counter",String(++n));f.writeFileSync("artifact", "correct "+n)'), [{ id: 'result', source: 'artifact', path: 'artifact', operator: 'contains', value: 'correct' }], invocation('require("fs").writeFileSync("artifact","wrong")'));
    expect(proof.verdict).toBe('passed');
    await expect(commandReplayGate(spec, proof.proofPath, root)('current')).rejects.toThrow('diverged');
  });
  it('blocks an executable changed after proof without executing the changed file', async () => {
    const binary = path.join(root, 'echo');
    writeFileSync(binary, "#!/bin/sh\nprintf '%s\\n' \"$1\"\n", { mode: 0o700 });
    const file = path.join(root, 'commands.json');
    writeFileSync(file, JSON.stringify({ mode: 'repair', baselineKind: 'historical', title: 'Echo', requirement: 'Echo correct', before: { executable: binary, args: ['wrong'], cwd: '.', deadlineMs: 2000 }, current: { executable: binary, args: ['correct'], cwd: '.', deadlineMs: 2000 }, checks: [{ id: 'result', source: 'stdout', operator: 'equals', value: 'correct\n' }], regressionCheck: 'result' }));
    const proof = await proveCommands(file, path.join(root, 'proof'));
    const replay = commandReplayGate(loadCommandSpec(file), proof.proofPath, root);
    appendFileSync(binary, 'changed');
    await expect(replay('current')).rejects.toThrow('changed');
    expect(existsSync(path.join(root, 'replay-current'))).toBe(false);
  });
  it('rejects retained evidence changed after recording authorization', async () => {
    const { spec, proof } = await prepare();
    const replay = commandReplayGate(spec, proof.proofPath, root);
    writeFileSync(path.join(root, 'proof/current-1/stdout.txt'), 'correct but altered\n');
    await expect(replay('current')).rejects.toThrow('changed');
  });
  it('keeps failed acceptance separate and never attempts movie delivery', async () => {
    const { file } = await prepare(invocation('console.log("wrong")'));
    const story = path.join(root, 'video.json'); writeFileSync(story, JSON.stringify(plan(file)));
    const result = await demonstrateCommands(story, path.join(root, 'delivery'));
    expect(result.proofVerdict).toBe('failed'); expect(result.verdict).toBe('failed');
    expect(result.demoVideo).toBeUndefined(); expect(existsSync(path.join(root, 'delivery/demo.mp4'))).toBe(false);
  });
  it('preserves passed proof when narration is unavailable without leaking raw failure details', async () => {
    const { file } = await prepare();
    const story = path.join(root, 'video.json'); writeFileSync(story, JSON.stringify(plan(file)));
    const previous = process.env.PRAMAN_VATRA;
    const privateHelper = path.join(root, 'private-helper-name');
    process.env.PRAMAN_VATRA = privateHelper;
    try {
      const result = await demonstrateCommands(story, path.join(root, 'delivery'));
      expect(result.proofVerdict).toBe('passed');
      expect(result.verdict).toBe('insufficient_evidence');
      expect(result.demoVideo).toBeUndefined();
      expect(JSON.stringify(result)).not.toContain(privateHelper);
      expect(existsSync(path.join(root, 'delivery/demo.mp4'))).toBe(false);
    } finally {
      if (previous === undefined) delete process.env.PRAMAN_VATRA;
      else process.env.PRAMAN_VATRA = previous;
    }
  });
  it('rejects a source story whose focus is absent rather than claiming source evidence', () => {
    const story = plan('commands.json');
    expect(commandVideoPlanSchema.safeParse({ ...story, diffPath: 'change.diff' }).success).toBe(false);
  });
});

describe('command story preflight', () => {
  it('executes and frames the story without consuming either final proof replay', async () => {
    const { spec, proof, file } = await prepare();
    const story = commandVideoPlanSchema.parse(plan(file));
    const receipt = await preflightCommandWalkthrough(story, spec, path.join(root, 'preflight'));
    const result = JSON.parse(readFileSync(receipt, 'utf8'));
    expect(result).toMatchObject({ kind: 'story-preflight', proof: false, status: 'passed' });
    expect(result.scenes.map((scene: { focus: { selector: string } }) => scene.focus.selector)).toEqual(['[data-terminal-line="1"]', '#surface', '[data-terminal-line="1"]']);
    const replay = commandReplayGate(spec, proof.proofPath, root);
    expect((await replay('before')).run.verdict).toBe('failed');
    expect((await replay('current')).run.verdict).toBe('passed');
    await expect(replay('current')).rejects.toThrow('exactly once');
  }, 90000);

  it('blocks an absent terminal row before speech and keeps proof passed', async () => {
    const { file } = await prepare();
    const story = plan(file); story.walkthrough.after[0] = { ...story.walkthrough.after[0], to: 2 };
    const storyFile = path.join(root, 'bad-story.json'); writeFileSync(storyFile, JSON.stringify(story));
    const helper = path.join(root, 'speech-helper'), marker = path.join(root, 'speech-called');
    writeFileSync(helper, `#!/bin/sh\ntouch '${marker}'\nexit 1\n`, { mode: 0o700 });
    const previous = process.env.PRAMAN_VATRA; process.env.PRAMAN_VATRA = helper;
    try {
      const result = await demonstrateCommands(storyFile, path.join(root, 'bad-delivery'));
      expect(result).toMatchObject({ proofVerdict: 'passed', verdict: 'insufficient_evidence' });
      expect(existsSync(marker)).toBe(false);
      expect(existsSync(path.join(root, 'bad-delivery/demo.mp4'))).toBe(false);
      expect(JSON.parse(readFileSync(path.join(root, 'bad-delivery/video/preflight/preflight.json'), 'utf8'))).toMatchObject({
        proof: false, status: 'blocked', position: { stage: 'current', beat: 0 },
      });
    } finally {
      if (previous === undefined) delete process.env.PRAMAN_VATRA; else process.env.PRAMAN_VATRA = previous;
    }
  }, 90000);

  it('rejects source overflow in the shared renderer without generating speech', async () => {
    const { file, spec } = await prepare();
    const patch = path.join(root, 'change.diff');
    writeFileSync(patch, `--- a/file.ts\n+++ b/file.ts\n@@ -1 +1 @@\n-old\n+${'long source '.repeat(400)}\n`);
    const story = commandVideoPlanSchema.parse({ ...plan(file), diffPath: patch, walkthrough: {
      ...plan(file).walkthrough, code: { text: 'The supplied source.', excerpts: [{ file: 'file.ts', side: 'after', from: 1, to: 1, label: 'Current' }],
        beats: [{ text: 'Read this line.', focus: { file: 'file.ts', side: 'after', from: 1, to: 1 } }] },
    } });
    await expect(preflightCommandWalkthrough(story, spec, path.join(root, 'source'))).rejects.toThrow('does not fit');
    expect(JSON.parse(readFileSync(path.join(root, 'source/preflight.json'), 'utf8'))).toMatchObject({ proof: false, status: 'blocked', position: { stage: 'code', beat: 0 } });
  }, 90000);
});
