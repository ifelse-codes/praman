import { expect, test } from 'vitest';
import { createServer, type ServerResponse } from 'node:http';
import { once } from 'node:events';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runAgentCampaign } from '../src/core/agentCampaign.js';

async function fixture(run: (dir: string) => Promise<void>) {
  const dir = mkdtempSync(join(tmpdir(), 'praman-agent-'));
  try { await run(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
}
async function control(handler: (request: URL, response: ServerResponse) => void) {
  const instance = createServer((request, response) => handler(new URL(request.url!, 'http://localhost'), response)).listen(0, '127.0.0.1');
  await once(instance, 'listening'); const address = instance.address();
  if (!address || typeof address === 'string') throw new Error('No control address');
  return { url: `http://127.0.0.1:${address.port}/`, async close() { instance.closeAllConnections(); await new Promise<void>(resolve => instance.close(() => resolve())); } };
}
function inputs(dir: string, options: { selector?: string; appUrl?: string; selectorUrl?: string; objectives?: string[]; rounds?: number; requiredCases?: number[]; badCase?: number; agent?: object; cases?: string[] } = {}) {
  for (let index = 0; index < 2; index++) {
    const workflow = { version: 1, applicationState: { kind: 'stateless' }, command: {
      mode: 'acceptance', title: `private-title-${index}`, requirement: 'private-requirement', current: {
        executable: process.execPath, args: ['--input-type=module', '-e', `import fs from 'node:fs';const count=fs.existsSync('counter')?Number(fs.readFileSync('counter','utf8'))+1:1;fs.writeFileSync('counter',String(count));fs.appendFileSync(${JSON.stringify(join(dir, 'apps.txt'))},'${index}\\n');await(await fetch('{{serviceUrl}}/work')).text();${options.appUrl ? `await(await fetch(${JSON.stringify(options.appUrl)})).text();` : ''}console.log('${options.badCase === index ? 'wrong' : 'green'}:'+count);`], cwd: '{{runDir}}', deadlineMs: 5000,
      }, checks: [{ id: 'private-check', source: 'stdout', operator: 'equals', value: 'green:1\n' }],
    }, dependency: { version: 1, repeats: 2, start: { kind: 'initial' }, service: { version: 1, initial: 'ready', states: { ready: [{ method: 'GET', path: '/work', next: 'ready', response: { status: 200, body: { ok: true } } }] } },
      steps: [{ method: 'GET', path: '/work', expect: { status: 200, body: { kind: 'json', value: { ok: true } } } }], final: { state: 'ready', requests: 1 } } };
    writeFileSync(join(dir, `workflow-${index}.json`), JSON.stringify(workflow));
  }
  const selector = `import fs from 'node:fs';const prompt=fs.readFileSync(0,'utf8');const context=JSON.parse(prompt.slice(prompt.indexOf('\\n\\n')+2));fs.appendFileSync(${JSON.stringify(join(dir, 'selectors.txt'))},'called\\n');${options.selectorUrl ? `await(await fetch(${JSON.stringify(options.selectorUrl)}+'?tester='+context.testerIndex+'&round='+context.round)).text();` : ''}${options.selector ?? `const previous=context.observations.find(row=>row.testerIndex===context.testerIndex);const caseIndex=previous?1-previous.caseIndex:context.testerIndex%2;fs.writeFileSync(process.argv[1],JSON.stringify({caseIndex,reason:'private-model-reason'}),{mode:0o644});console.log('private-selector-stdout');console.error('private-selector-stderr');`}`;
  const input = join(dir, 'input.json');
  writeFileSync(input, JSON.stringify({ version: 1, cases: options.cases ?? ['workflow-0.json', 'workflow-1.json'], objectives: options.objectives ?? ['private-goal-a', 'private-goal-b'], rounds: options.rounds ?? 2,
    requiredCases: options.requiredCases ?? [0, 1], agent: { executable: process.execPath, args: ['--input-type=module', '-e', selector, '{{proposalPath}}'], cwd: '{{testerDir}}', stdin: '{{prompt}}', deadlineMs: 5000, ...options.agent } }));
  return input;
}
function lines(file: string) { return existsSync(file) ? readFileSync(file, 'utf8').trim().split('\n') : []; }

test('parallel selectors use real previous outcomes while isolated applications and private evidence remain independent', async () => {
  await fixture(async dir => {
    const held = new Map<number, ServerResponse>();
    const coordinator = await control((url, response) => {
      if (url.searchParams.get('round') !== '1') { response.end(); return; }
      held.set(Number(url.searchParams.get('tester')), response);
      if (held.size === 2) for (const item of held.values()) item.end();
    });
    try {
      const input = inputs(dir, { selectorUrl: coordinator.url });
      const original = readFileSync(join(dir, 'workflow-0.json'), 'utf8');
      const result = await runAgentCampaign(input, join(dir, 'out'));
      expect(result.verdict).toBe('passed'); expect(result.coverage).toEqual({ requiredCases: [0, 1], completedCases: [0, 1], missingRequired: [] });
      expect(result.selections.map(row => [row.testerIndex, row.round, row.caseIndex, row.verdict])).toEqual([[0, 1, 0, 'passed'], [0, 2, 1, 'passed'], [1, 1, 1, 'passed'], [1, 2, 0, 'passed']]);
      expect(held.size).toBe(2); expect(result.peakConcurrency).toBe(2); expect(lines(join(dir, 'apps.txt')).sort()).toEqual(['0', '0', '0', '0', '1', '1', '1', '1']);
      expect(readFileSync(join(dir, 'workflow-0.json'), 'utf8')).toBe(original);
      const rendered = JSON.stringify(result) + readFileSync(result.report, 'utf8');
      for (const value of ['private-title', 'private-requirement', 'private-check', 'private-model-reason', 'private-goal', 'private-selector']) expect(rendered).not.toContain(value);
      const artifact = join(dir, 'out/tester-0/round-1/producer/artifact-0');
      expect(readFileSync(artifact, 'utf8')).toContain('private-model-reason'); expect(statSync(artifact).mode & 0o777).toBe(0o600);
      expect(statSync(join(dir, 'out/tester-0/round-1/agent/proposal.json')).mode & 0o777).toBe(0o644);
      expect(statSync(join(dir, 'out')).mode & 0o777).toBe(0o700);
      await expect(runAgentCampaign(input, join(dir, 'out'))).rejects.toThrow();
      expect(lines(join(dir, 'apps.txt')).sort()).toEqual(['0', '0', '0', '0', '1', '1', '1', '1']);
    } finally { for (const response of held.values()) response.end(); await coordinator.close(); }
  });
});

test('invalid, injected or unavailable proposals never execute a target or gain correctness from model claims', async () => {
  await fixture(async dir => {
    const variants = [
      `fs.writeFileSync(process.argv[1],JSON.stringify({caseIndex:99,reason:'passed'}));`,
      `fs.writeFileSync(process.argv[1],JSON.stringify({caseIndex:0,reason:'passed',command:'arbitrary generated command'}));`,
      `fs.writeFileSync(process.argv[1],JSON.stringify({caseIndex:0,reason:'passed'}));process.exit(17);`,
      `console.log(JSON.stringify({caseIndex:0,reason:'stdout is not the declared artifact'}));`,
      `fs.writeFileSync(process.argv[1],'not json');`,
    ];
    for (const [index, selector] of variants.entries()) {
      const result = await runAgentCampaign(inputs(dir, { selector, objectives: ['bounded'], rounds: 1 }), join(dir, `out-${index}`));
      expect(result.verdict).toBe('insufficient_evidence'); expect(result.counts.executed).toBe(0); expect(existsSync(join(dir, 'apps.txt'))).toBe(false);
    }
    const missing = await runAgentCampaign(inputs(dir, { objectives: ['bounded'], rounds: 1, agent: { executable: join(dir, 'missing-executable') } }), join(dir, 'unavailable'));
    expect(missing.verdict).toBe('insufficient_evidence'); expect(existsSync(join(dir, 'apps.txt'))).toBe(false);
  });
});

test('catalog validation and required-case bounds happen before any potentially metered selector command', async () => {
  await fixture(async dir => {
    for (const [index, options] of [{ cases: ['workflow-0.json', 'missing.json'] }, { requiredCases: [2] }, { requiredCases: [0, 0] }, { agent: { cwd: dir } }, { agent: { stdin: '' } }].entries()) {
      const result = await runAgentCampaign(inputs(dir, options), join(dir, `out-${index}`));
      expect(result.verdict).toBe('insufficient_evidence'); expect(existsSync(join(dir, 'selectors.txt'))).toBe(false); expect(existsSync(join(dir, 'apps.txt'))).toBe(false);
    }
  });
});

test('a passing subset is insufficient, and a later passing selection cannot erase an observed failure', async () => {
  await fixture(async dir => {
    const subset = await runAgentCampaign(inputs(dir, { objectives: ['bounded'], rounds: 1 }), join(dir, 'subset'));
    expect(subset.verdict).toBe('insufficient_evidence'); expect(subset.coverage.missingRequired).toEqual([1]); expect(subset.selections[0].verdict).toBe('passed');
    const selector = `const previous=context.observations.find(row=>row.testerIndex===context.testerIndex);if(previous&&previous.verdict!=='failed')throw new Error('Expected real failing feedback');fs.writeFileSync(process.argv[1],JSON.stringify({caseIndex:previous?0:1,reason:'choose from observed feedback'}));`;
    const failed = await runAgentCampaign(inputs(dir, { objectives: ['bounded'], badCase: 1, selector }), join(dir, 'failed'));
    expect(failed.verdict).toBe('failed'); expect(failed.coverage.missingRequired).toEqual([]); expect(failed.selections.map(row => row.verdict)).toEqual(['failed', 'passed']);
  });
});

test('cancellation drains the admitted workflow repeats but admits no further selector or target', async () => {
  await fixture(async dir => {
    const stop = new AbortController(); let calls = 0;
    const coordinator = await control((_, response) => { calls++; stop.abort(); response.end(); });
    try {
      const result = await runAgentCampaign(inputs(dir, { objectives: ['bounded'], appUrl: coordinator.url, requiredCases: [0] }), join(dir, 'out'), stop.signal);
      expect(result.verdict).toBe('insufficient_evidence'); expect(result.interrupted).toBe(true); expect(calls).toBe(2);
      expect(lines(join(dir, 'selectors.txt'))).toEqual(['called']); expect(result.selections.map(row => row.verdict)).toEqual(['passed']);
      const before = lines(join(dir, 'apps.txt'));
      const preAborted = await runAgentCampaign(inputs(dir), join(dir, 'pre-aborted'), AbortSignal.abort());
      expect(preAborted.verdict).toBe('insufficient_evidence'); expect(lines(join(dir, 'apps.txt'))).toEqual(before); expect(lines(join(dir, 'selectors.txt'))).toEqual(['called']);
    } finally { await coordinator.close(); }
  });
});

test('captured oracle tampering fails closed, while editing the original declaration cannot rewrite captured expectations', async () => {
  await fixture(async dir => {
    const captured = join(dir, 'out/case-0.json');
    const selector = `fs.writeFileSync(${JSON.stringify(captured)},'{}');fs.writeFileSync(process.argv[1],JSON.stringify({caseIndex:0,reason:'claim success after oracle edit'}));`;
    const refused = await runAgentCampaign(inputs(dir, { selector, objectives: ['bounded'], rounds: 1, requiredCases: [0] }), join(dir, 'out'));
    expect(refused.verdict).toBe('insufficient_evidence'); expect(existsSync(join(dir, 'apps.txt'))).toBe(false);
    const coordinator = await control((_, response) => { writeFileSync(join(dir, 'workflow-0.json'), '{}'); response.end(); });
    try {
      const capturedResult = await runAgentCampaign(inputs(dir, { selectorUrl: coordinator.url, objectives: ['literal {{proposalPath}} remains objective data'], rounds: 1, requiredCases: [0] }), join(dir, 'original-edited'));
      expect(capturedResult.verdict).toBe('passed'); expect(lines(join(dir, 'apps.txt'))).toEqual(['0', '0']); expect(readFileSync(join(dir, 'workflow-0.json'), 'utf8')).toBe('{}');
    } finally { await coordinator.close(); }
  });
});
