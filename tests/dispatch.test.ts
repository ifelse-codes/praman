import { describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js';

// Dispatch smoke tests exercise the compiled entry points: the stdio MCP server and
// the CLI's argument parsing. They need a build first, so the suite skips cleanly on a
// fresh checkout (CI runs npm run build before npm test).
const root = fileURLToPath(new URL('..', import.meta.url));
const distCli = join(root, 'dist', 'cli.js');
const hasBuild = existsSync(distCli);

// Pinned public surface: src/mcp/server.ts registers exactly these 14 tools.
const expectedTools = [
  'praman_agent_campaign',
  'praman_campaign_resume',
  'praman_case_from_trace',
  'praman_command_demonstrate',
  'praman_command_preview',
  'praman_command_verify',
  'praman_coverage_review',
  'praman_demonstrate',
  'praman_environment',
  'praman_preview',
  'praman_scenario_verify',
  'praman_service_replay',
  'praman_workflow_campaign',
  'praman_workflow_replay',
].sort();

interface CliRun { code: number | null; signal: NodeJS.Signals | null; stdout: string; stderr: string }

function runCli(args: string[]): Promise<CliRun> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [distCli, ...args], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`CLI dispatch did not exit within 20s: praman ${args.join(' ')}`));
    }, 90000);
    child.stdout.on('data', chunk => { stdout += String(chunk); });
    child.stderr.on('data', chunk => { stderr += String(chunk); });
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('close', (code, signal) => { clearTimeout(timer); resolve({ code, signal, stdout, stderr }); });
  });
}

describe.skipIf(!hasBuild)('dispatch smoke (requires npm run build: dist/cli.js)', () => {
  it('serves exactly the 14 public MCP tools over stdio and executes praman_command_verify', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'praman-dispatch-mcp-'));
    const client = new Client({ name: 'praman-dispatch-smoke', version: '0.0.0' });
    const transport = new StdioClientTransport({ command: process.execPath, args: [distCli, 'mcp'], cwd: root, stderr: 'pipe' });
    let serverStderr = '';
    transport.stderr?.on('data', chunk => { serverStderr += String(chunk); });
    try {
      await client.connect(transport);
      const listed = await client.listTools();
      expect(listed.tools.map(tool => tool.name).sort()).toEqual(expectedTools);

      const declaration = {
        mode: 'acceptance',
        title: 'Dispatch smoke sum',
        requirement: 'Print the declared sum',
        current: { executable: process.execPath, args: ['-e', 'console.log(2+3)'], cwd: '.', deadlineMs: 5000 },
        expectedExit: 0,
        checks: [{ id: 'sum', source: 'stdout', operator: 'equals', value: '5\n' }],
        repeats: 2,
      };
      const specPath = join(directory, 'declaration.json');
      await writeFile(specPath, JSON.stringify(declaration, null, 2));
      // Validate the standard result shape instead of the SDK's compatibility union.
      const result = CallToolResultSchema.parse(await client.callTool({ name: 'praman_command_verify', arguments: { specPath, outDir: join(directory, 'proof') } }));
      expect(result.isError).toBe(false);
      const textBlock = result.content.find(item => item.type === 'text');
      if (!textBlock || textBlock.type !== 'text') throw new Error(`Expected a text tool result, got ${JSON.stringify(result.content)}`);
      const payload = JSON.parse(textBlock.text) as { verdict?: string; feedback?: { mode?: string } };
      expect(payload.verdict).toBe('passed');
      expect(payload.feedback?.mode).toBe('acceptance');
      expect(serverStderr).toBe('');
    } finally {
      await client.close().catch(() => {});
      await rm(directory, { recursive: true, force: true });
    }
  }, 90000);

  it('dispatches CLI --version, --help and a missing required argument', async () => {
    const version = await runCli(['--version']);
    expect(version.code).toBe(0);
    expect(version.stdout.trim()).toBe('0.1.0');

    const help = await runCli(['--help']);
    expect(help.code).toBe(0);
    expect(help.stdout).toContain('scenario-verify');
    expect(help.stdout).toContain('command-verify');

    const missing = await runCli(['command-verify']);
    expect(missing.code).toBe(1);
    expect(missing.stdout).toBe('');
    expect(missing.stderr).toContain("missing required argument 'declaration'");
  }, 90000);
});
