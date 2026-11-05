import { it, expect } from 'vitest';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { changeSpecSchema } from '../src/case/change.js';
import { executeScenario } from '../src/eval/change.js';
import { commandProofSchema, executeCommand } from '../src/eval/command.js';

it('observes attribute absence, exact class tokens and DOM states without treating missing nodes as absent attributes', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'praman-state-'));
  const server = createServer((_, res) => { res.setHeader('content-type', 'text/html'); res.end('<button id="b" class="ready-now" aria-expanded="false" disabled>B</button><input id="c" type="checkbox" checked><div id="h" hidden>H</div>'); });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  try {
    const address = server.address() as { port: number };
    const spec = changeSpecSchema.parse({ mode: 'acceptance', title: 'States', change: 'States', afterUrl: `http://127.0.0.1:${address.port}`, steps: [{ action: 'waitFor', selector: '#b', note: 'Ready' }], checks: [
      { id: 'aria', kind: 'attribute', selector: '#b', name: 'aria-expanded', equals: 'false' },
      { id: 'absent', kind: 'attribute', selector: '#b', name: 'title', equals: null },
      { id: 'token', kind: 'class', selector: '#b', token: 'ready', equals: false },
      { id: 'disabled', kind: 'state', selector: '#b', state: 'enabled', equals: false },
      { id: 'checked', kind: 'state', selector: '#c', state: 'checked', equals: true },
      { id: 'hidden', kind: 'state', selector: '#h', state: 'hidden', equals: true },
      { id: 'mismatch', kind: 'attribute', selector: '#b', name: 'aria-expanded', equals: 'true' },
      { id: 'missing', kind: 'attribute', selector: '#missing', name: 'title', equals: null },
    ] });
    const run = await executeScenario(spec, spec.afterUrl, dir);
    expect(run.checks.map(row => row.verdict)).toEqual(['passed', 'passed', 'passed', 'passed', 'passed', 'passed', 'failed', 'insufficient_evidence']);
    expect(run.checks.slice(0, 6).map(row => row.observed)).toEqual(['false', null, false, false, true, true]);
  } finally { server.close(); await once(server, 'close'); rmSync(dir, { recursive: true, force: true }); }
}, 90000);

it.each(['png', 'jpeg'] as const)('fully decodes %s artifacts and distinguishes wrong dimensions, truncation and missing evidence', async format => {
  const dir = mkdtempSync(join(tmpdir(), 'praman-media-'));
  try {
    const script = `import sharp from 'sharp'; import {writeFileSync} from 'node:fs'; const data=await sharp({create:{width:7,height:5,channels:3,background:'red'}}).${format}().toBuffer(); writeFileSync('valid',data); writeFileSync('broken',data.subarray(0,Math.floor(data.length/2)));`;
    const cwd = process.cwd();
    const paths = [join(dir, 'valid'), join(dir, 'broken'), join(dir, 'missing')];
    const spec = commandProofSchema.parse({ mode: 'acceptance', title: 'Media', requirement: 'Decode images', current: { executable: process.execPath, cwd, args: ['--input-type=module', '-e', script.replaceAll("'valid'", JSON.stringify(paths[0])).replaceAll("'broken'", JSON.stringify(paths[1]))], deadlineMs: 10000 }, checks: [
      { id: 'valid', source: 'artifact', path: paths[0], operator: 'image', value: { format, width: 7, height: 5 } },
      { id: 'size', source: 'artifact', path: paths[0], operator: 'image', value: { format, width: 8 } },
      { id: 'format', source: 'artifact', path: paths[0], operator: 'image', value: { format: format === 'png' ? 'jpeg' : 'png' } },
      { id: 'broken', source: 'artifact', path: paths[1], operator: 'image', value: { format } },
      { id: 'missing', source: 'artifact', path: paths[2], operator: 'image', value: { format } },
    ] });
    const run = await executeCommand(spec, spec.current, join(dir, 'run'));
    expect(run.checks.map(row => row.verdict)).toEqual(['passed', 'passed', 'failed', 'failed', 'failed', 'insufficient_evidence']);
    expect(run.checks[1].observed).toEqual({ decoded: true, format, width: 7, height: 5 });
    expect(run.checks[4].observed).toEqual({ decoded: false });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
