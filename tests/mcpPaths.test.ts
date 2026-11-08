import { describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js';
import { missingPathArguments, relativePathArguments, relativePathPolicy, relativePathRefusal } from '../src/mcp/paths.js';

describe('MCP relative path policy', () => {
  it('defaults to cwd resolution, accepts reject, and refuses any other value', () => {
    expect(relativePathPolicy({})).toBe('cwd');
    expect(relativePathPolicy({ PRAMAN_RELATIVE_PATHS: '' })).toBe('cwd');
    expect(relativePathPolicy({ PRAMAN_RELATIVE_PATHS: 'reject' })).toBe('reject');
    expect(() => relativePathPolicy({ PRAMAN_RELATIVE_PATHS: 'allow' })).toThrow('PRAMAN_RELATIVE_PATHS must be "reject" or unset');
  });

  it('names every relative path argument and ignores absolute paths and bare tool names', () => {
    expect(relativePathArguments({ specPath: 'a.json', outDir: '/abs/out', planPath: 'p.json', tracePath: '/t', baseDir: 'base', cut: 'short' }))
      .toEqual(['specPath', 'planPath', 'baseDir']);
    const scenario = {
      steps: [
        { action: 'click', selector: '#a', note: 'n' },
        { action: 'goto', path: '/relative-looking-but-url-path', note: 'n' },
        { action: 'upload', selector: '#f', path: 'fixtures/file.txt', note: 'n' },
        { action: 'upload', selector: '#g', path: '/abs/file.txt', note: 'n' },
      ],
      diffPath: 'change.diff',
      identity: {
        files: [{ role: 'input', path: 'input.json' }, { role: 'input', path: '/abs/input.json' }],
        tools: [{ role: 'tool', executable: 'curl' }, { role: 'tool', executable: './bin/tool' }, { role: 'browser', executable: '/abs/chrome' }],
      },
    };
    expect(relativePathArguments({ scenario, outDir: 'out' })).toEqual([
      'outDir', 'scenario.steps[2].path', 'scenario.diffPath', 'scenario.identity.files[0].path', 'scenario.identity.tools[1].executable',
    ]);
    expect(relativePathArguments({ specPath: '/a.json', outDir: '/out' })).toEqual([]);
  });

  it('requires praman_environment baseDir in reject mode, because its default is relative', () => {
    expect(missingPathArguments('praman_environment', { action: 'observe', id: 'abcdefabcdef' })).toEqual(['baseDir']);
    expect(missingPathArguments('praman_environment', { action: 'observe', baseDir: '' })).toEqual(['baseDir']);
    expect(missingPathArguments('praman_environment', { action: 'observe', baseDir: '/abs/envs' })).toEqual([]);
    expect(missingPathArguments('praman_command_verify', { specPath: '/a', outDir: '/b' })).toEqual([]);
    const payload = JSON.parse(relativePathRefusal([], ['baseDir']).content[0].text);
    expect(payload).toMatchObject({ verdict: 'insufficient_evidence', arguments: [], missing: ['baseDir'] });
    expect(payload.reason).toContain('Supply baseDir as an absolute path');
  });

  it('refuses as not proven, naming arguments without their values', () => {
    const result = relativePathRefusal(['specPath']);
    expect(result.isError).toBe(true);
    const payload = JSON.parse(result.content[0].text);
    expect(payload).toMatchObject({ verdict: 'insufficient_evidence', arguments: ['specPath'] });
    expect(payload.reason).toContain('Pass absolute paths');
  });
});

const root = fileURLToPath(new URL('..', import.meta.url));
const distCli = join(root, 'dist', 'cli.js');
const hasBuild = existsSync(distCli);

const declaration = {
  mode: 'acceptance', title: 'Path policy fixture', requirement: 'Print the declared sum',
  current: { executable: process.execPath, args: ['-e', 'console.log(2+3)'], cwd: '.', deadlineMs: 5000 },
  expectedExit: 0, checks: [{ id: 'sum', source: 'stdout', operator: 'equals', value: '5\n' }], repeats: 2,
};

async function withServer<T>(serverDirectory: string, env: Record<string, string>, use: (client: Client) => Promise<T>) {
  const client = new Client({ name: 'praman-path-policy-test', version: '0.0.0' });
  const transport = new StdioClientTransport({ command: process.execPath, args: [distCli, 'mcp'], cwd: serverDirectory, env, stderr: 'pipe' });
  try {
    await client.connect(transport);
    return await use(client);
  } finally {
    await client.close().catch(() => {});
  }
}

async function verify(client: Client, specPath: string, outDir: string) {
  const result = CallToolResultSchema.parse(await client.callTool({ name: 'praman_command_verify', arguments: { specPath, outDir } }));
  const text = result.content.find(item => item.type === 'text');
  if (!text || text.type !== 'text') throw new Error('expected a text result');
  return { isError: result.isError, payload: JSON.parse(text.text) as { verdict: string; arguments?: string[]; reason?: string } };
}

describe.skipIf(!hasBuild)('MCP server path policy (requires npm run build)', () => {
  it('with reject: refuses relative paths before running or writing, and still passes absolute paths', async () => {
    // serverDirectory stands in for an installed plugin directory; project is the caller's project.
    const serverDirectory = await mkdtemp(join(tmpdir(), 'praman-installed-'));
    const project = await mkdtemp(join(tmpdir(), 'praman-project-'));
    try {
      await writeFile(join(serverDirectory, 'decl.json'), JSON.stringify(declaration));
      await writeFile(join(project, 'decl.json'), JSON.stringify(declaration));
      const before = (await readdir(serverDirectory)).sort();
      await withServer(serverDirectory, { PRAMAN_RELATIVE_PATHS: 'reject' }, async client => {
        // A relative spec that exists in the server directory must still be refused, not run.
        const relativeSpec = await verify(client, 'decl.json', 'out-relative');
        expect(relativeSpec.isError).toBe(true);
        expect(relativeSpec.payload.verdict).toBe('insufficient_evidence');
        expect(relativeSpec.payload.arguments).toEqual(['specPath', 'outDir']);
        expect(JSON.stringify(relativeSpec.payload)).not.toContain('decl.json');

        const relativeOut = await verify(client, join(project, 'decl.json'), 'evidence');
        expect(relativeOut.isError).toBe(true);
        expect(relativeOut.payload.arguments).toEqual(['outDir']);

        const absolute = await verify(client, join(project, 'decl.json'), join(project, 'proof'));
        expect(absolute.isError).toBe(false);
        expect(absolute.payload.verdict).toBe('passed');
      });
      expect((await readdir(serverDirectory)).sort()).toEqual(before);
      expect(existsSync(join(project, 'proof', 'proof.json'))).toBe(true);
    } finally {
      await rm(serverDirectory, { recursive: true, force: true });
      await rm(project, { recursive: true, force: true });
    }
  });

  it('with reject: refuses praman_environment without baseDir instead of using a default inside the server directory', async () => {
    const serverDirectory = await mkdtemp(join(tmpdir(), 'praman-installed-'));
    try {
      await withServer(serverDirectory, { PRAMAN_RELATIVE_PATHS: 'reject' }, async client => {
        const result = CallToolResultSchema.parse(await client.callTool({ name: 'praman_environment', arguments: { action: 'observe', id: 'abcdefabcdef' } }));
        expect(result.isError).toBe(true);
        const text = result.content.find(item => item.type === 'text');
        if (!text || text.type !== 'text') throw new Error('expected a text result');
        const payload = JSON.parse(text.text);
        expect(payload).toMatchObject({ verdict: 'insufficient_evidence', missing: ['baseDir'] });
        expect(text.text).not.toContain('.praman/environments');
      });
      expect(await readdir(serverDirectory)).toEqual([]);
    } finally {
      await rm(serverDirectory, { recursive: true, force: true });
    }
  });

  it('without the variable: relative paths still resolve against the server cwd (unchanged)', async () => {
    const serverDirectory = await mkdtemp(join(tmpdir(), 'praman-workspace-'));
    try {
      await writeFile(join(serverDirectory, 'decl.json'), JSON.stringify(declaration));
      await withServer(serverDirectory, {}, async client => {
        const result = await verify(client, 'decl.json', 'evidence');
        expect(result.isError).toBe(false);
        expect(result.payload.verdict).toBe('passed');
      });
      // This is the behavior that made the Power write inside its own directory.
      expect(existsSync(join(serverDirectory, 'evidence', 'proof.json'))).toBe(true);
    } finally {
      await rm(serverDirectory, { recursive: true, force: true });
    }
  });

  it('fails visibly at startup on an invalid PRAMAN_RELATIVE_PATHS value', async () => {
    const run = await new Promise<{ code: number | null; stderr: string }>((resolve, reject) => {
      const child = spawn(process.execPath, [distCli, 'mcp'], { cwd: root, env: { ...process.env, PRAMAN_RELATIVE_PATHS: 'allow' }, stdio: ['pipe', 'ignore', 'pipe'] });
      let stderr = '';
      const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('server did not exit')); }, 20000);
      child.stderr.on('data', chunk => { stderr += String(chunk); });
      child.on('error', reject);
      child.on('close', code => { clearTimeout(timer); resolve({ code, stderr }); });
    });
    expect(run.code).not.toBe(0);
    expect(run.stderr).toContain('PRAMAN_RELATIVE_PATHS must be "reject" or unset');
  });
});
