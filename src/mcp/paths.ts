import path from 'node:path';

// MCP path policy. By default relative path arguments resolve against the server's
// working directory. A server started outside the caller's project (for example from an
// installed plugin directory) sets PRAMAN_RELATIVE_PATHS=reject so a relative path is
// refused instead of silently reading or writing inside the server's own directory.

export type RelativePathPolicy = 'cwd' | 'reject';

export function relativePathPolicy(env: NodeJS.ProcessEnv = process.env): RelativePathPolicy {
  const value = env.PRAMAN_RELATIVE_PATHS;
  if (value === undefined || value === '') return 'cwd';
  if (value === 'reject') return 'reject';
  throw new Error('PRAMAN_RELATIVE_PATHS must be "reject" or unset');
}

const PATH_ARGUMENTS = ['specPath', 'planPath', 'tracePath', 'outDir', 'baseDir'] as const;

const isRelative = (value: unknown): value is string => typeof value === 'string' && value !== '' && !path.isAbsolute(value);
const hasSeparator = (value: string) => value.includes('/') || value.includes(path.sep);

type Record_ = Record<string, unknown>;
const asRecord = (value: unknown): Record_ | undefined => (value && typeof value === 'object' && !Array.isArray(value) ? value as Record_ : undefined);
const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

/** Names (never values) of relative path arguments in a tool's parsed input. */
export function relativePathArguments(input: Record_): string[] {
  const names: string[] = PATH_ARGUMENTS.filter(name => isRelative(input[name]));
  const scenario = asRecord(input.scenario);
  if (scenario) {
    asArray(scenario.steps).forEach((step, index) => {
      const record = asRecord(step);
      if (record?.action === 'upload' && isRelative(record.path)) names.push(`scenario.steps[${index}].path`);
    });
    if (isRelative(scenario.diffPath)) names.push('scenario.diffPath');
    const identity = asRecord(scenario.identity);
    asArray(identity?.files).forEach((file, index) => {
      if (isRelative(asRecord(file)?.path)) names.push(`scenario.identity.files[${index}].path`);
    });
    asArray(identity?.tools).forEach((tool, index) => {
      const executable = asRecord(tool)?.executable;
      if (isRelative(executable) && hasSeparator(executable)) names.push(`scenario.identity.tools[${index}].executable`);
    });
  }
  return names;
}

export function relativePathRefusal(names: string[]) {
  const payload = {
    verdict: 'insufficient_evidence',
    reason: 'Relative paths are refused because this PRAMAN MCP server runs with PRAMAN_RELATIVE_PATHS=reject: '
      + 'they would resolve inside the server\'s own directory, not your project. Pass absolute paths. '
      + 'Nothing was executed or written.',
    arguments: names,
  };
  return { content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }], isError: true };
}
