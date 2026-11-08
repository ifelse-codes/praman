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

// Optional path arguments whose omission falls back to a relative default inside the
// server's directory. In reject mode they must be supplied (as absolute paths).
const REQUIRED_IN_REJECT_MODE: Record<string, readonly string[]> = {
  praman_environment: ['baseDir'],
};

/** Names of path arguments that reject mode requires but the input omits. */
export function missingPathArguments(toolName: string, input: Record_): string[] {
  return (REQUIRED_IN_REJECT_MODE[toolName] ?? []).filter(name => input[name] === undefined || input[name] === '');
}

export function relativePathRefusal(names: string[], missing: string[] = []) {
  const payload = {
    verdict: 'insufficient_evidence',
    reason: 'This PRAMAN MCP server runs with PRAMAN_RELATIVE_PATHS=reject, so relative or defaulted paths '
      + 'would resolve inside the server\'s own directory, not your project. '
      + (missing.length ? `Supply ${missing.join(', ')} as an absolute path. ` : '')
      + 'Pass absolute paths. Nothing was executed or written.',
    arguments: names,
    ...(missing.length ? { missing } : {}),
  };
  return { content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }], isError: true };
}
