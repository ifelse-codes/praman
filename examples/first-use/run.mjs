// Public, disposable negative controls; these are not historical application defects.
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const cli = join(root, 'dist/cli.js');
const base = resolve(root, '.praman');
await mkdir(base, { recursive: true });
const directory = process.argv[2] ? resolve(process.argv[2]) : await mkdtemp(join(base, 'session2-'));
if (process.argv[2]) await mkdir(directory); // Refuse reused directories.
const save = (path, value) => writeFile(path, JSON.stringify(value, null, 2), { mode: 0o600 });
const server = createServer((request, response) => {
  response.setHeader('Content-Type', 'text/html; charset=utf-8');
  response.end(request.url === '/release.html'
    ? '<!doctype html><title>Release details</title><style>#release-status{text-transform:uppercase}</style><h1>Release details</h1><section id="release-ready"><p>Status: <span id="release-status">Released</span></p></section>'
    : '<!doctype html><title>Release overview</title><h1>Release overview</h1><a id="open-release" href="/release.html">Open release details</a>');
});
const client = new Client({ name: 'praman-public-first-use', version: '1.0.0' });
let transport;
const outcomes = [];
try {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const url = `http://127.0.0.1:${server.address().port}`;
  const command = {
    mode: 'acceptance', title: 'Public JSON input', requirement: 'Print the declared JSON total',
    current: { executable: process.execPath, args: ['-e', 'let s="";process.stdin.setEncoding("utf8");process.stdin.on("data",c=>s+=c);process.stdin.on("end",()=>console.log(JSON.parse(s).values.reduce((a,b)=>a+b,0)));'], cwd: directory, stdin: '{"values":[2,3,5]}', deadlineMs: 5000 },
    expectedExit: 0, checks: [{ id: 'total', source: 'stdout', operator: 'equals', value: '10\n' }], repeats: 2,
  };
  const browser = {
    mode: 'acceptance', title: 'Current release details', change: 'Opening release details shows the rendered release status.', afterUrl: url, repeats: 2,
    steps: [{ action: 'click', selector: '#open-release', note: 'Open release details' }, { action: 'waitForURL', path: '/release.html', note: 'Confirm navigation' }, { action: 'waitFor', selector: '#release-ready', note: 'Wait for release details' }],
    checks: [{ id: 'release-status', kind: 'text', selector: '#release-status', equals: 'RELEASED', afterStep: 2 }, { id: 'runtime', kind: 'pageErrors', equals: 0 }],
  };
  // The SDK's default environment omits custom browser download locations.
  const browserEnv = process.env.PLAYWRIGHT_BROWSERS_PATH === undefined
    ? {} : { PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH };
  transport = new StdioClientTransport({ command: process.execPath, args: [cli, 'mcp'], cwd: root, env: browserEnv, stderr: 'pipe' });
  let mcpStderr = '';
  transport.stderr?.on('data', chunk => { mcpStderr += chunk; });
  await client.connect(transport);
  const tools = await client.listTools();
  assert(tools.tools.some(tool => tool.name === 'praman_command_verify'));
  assert(tools.tools.some(tool => tool.name === 'praman_scenario_verify'));
  for (const [kind, template] of [['command', command], ['browser', browser]]) {
    for (const [name, expectedVerdict, expectedExit] of [['pass', 'passed', 0], ['mismatch', 'failed', 1], ['unavailable', 'insufficient_evidence', 2]]) {
      const spec = structuredClone(template);
      if (name === 'mismatch') {
        if (kind === 'command') spec.checks[0].value = '11\n';
        else spec.checks[0].equals = 'NOT RELEASED';
      }
      if (name === 'unavailable') {
        if (kind === 'command') spec.current.executable = join(directory, 'intentionally-missing-executable');
        else spec.identity = { files: [{ role: 'input', path: join(directory, 'intentionally-missing-input') }] };
      }
      const specPath = join(directory, `${kind}-${name}.json`);
      await save(specPath, spec);
      for (const surface of ['cli', 'mcp']) {
        const outDir = join(directory, `${surface}-${kind}-${name}`);
        let response;
        if (surface === 'cli') {
          const child = spawn(process.execPath, [cli, kind === 'command' ? 'command-verify' : 'scenario-verify', specPath, '-o', outDir, '--summary'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
          let stdout = '', stderr = '';
          child.stdout.on('data', chunk => { stdout += chunk; });
          child.stderr.on('data', chunk => { stderr += chunk; });
          const [code, signal] = await once(child, 'close');
          await save(join(directory, `${surface}-${kind}-${name}-response.json`), { code, signal, stdout, stderr });
          assert.equal(signal, null);
          assert.equal(code, expectedExit, `${surface}/${kind}/${name}: ${stderr}`);
          response = { exit: code };
        } else {
          const result = await client.callTool({ name: kind === 'command' ? 'praman_command_verify' : 'praman_scenario_verify', arguments: kind === 'command' ? { specPath, outDir } : { scenario: spec, outDir } });
          await save(join(directory, `${surface}-${kind}-${name}-response.json`), result);
          assert.equal(Boolean(result.isError), expectedExit !== 0);
          const payload = JSON.parse(result.content.find(item => item.type === 'text').text);
          assert.equal(payload.verdict, expectedVerdict);
          response = { isError: Boolean(result.isError) };
        }
        const proof = JSON.parse(await readFile(join(outDir, 'proof.json'), 'utf8'));
        const feedback = JSON.parse(await readFile(join(outDir, 'feedback.json'), 'utf8'));
        const report = await readFile(join(outDir, 'REPORT.md'), 'utf8');
        assert.equal(proof.verdict, expectedVerdict);
        assert.equal(feedback.verdict, expectedVerdict);
        assert(report.includes(expectedVerdict));
        // Raw observed values, not safe-presentation echoes, establish the controls.
        if (name !== 'unavailable') {
          const runs = kind === 'command' ? proof.current : proof.after;
          assert.equal(runs.length, 2);
          for (const run of runs) {
            const observed = kind === 'command' ? await readFile(run.stdout, 'utf8') : run.checks[0].observed;
            assert.equal(observed, kind === 'command' ? '10\n' : 'RELEASED');
          }
        }
        outcomes.push({ surface, kind, name, verdict: proof.verdict, ...response, outDir });
        console.log(`${surface} ${kind} ${name}: ${proof.verdict}`);
      }
    }
  }
  await writeFile(join(directory, 'mcp-stderr.log'), mcpStderr, { mode: 0o600 });
} finally {
  await client.close();
  if (transport) await transport.close();
  if (server.listening) await new Promise((resolveClose, reject) => server.close(error => error ? reject(error) : resolveClose()));
  await save(join(directory, 'verification.json'), { outcomes, complete: outcomes.length === 12, mcpClosed: true, listenerClosed: !server.listening });
}
console.log(`Private evidence: ${directory}`);
