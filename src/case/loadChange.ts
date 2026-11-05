import { readFileSync } from 'node:fs';
import path from 'node:path';
import { changeSpecSchema } from './change.js';
import { normalizeIdentity } from '../eval/identity.js';

export function loadChangeSpec(file: string) {
  const scenarioPath = path.resolve(file);
  const spec = changeSpecSchema.parse(JSON.parse(readFileSync(scenarioPath, 'utf8')));
  normalizeIdentity(spec.identity, path.dirname(scenarioPath));
  if (spec.diffPath) spec.diffPath = path.resolve(path.dirname(scenarioPath), spec.diffPath);
  for (const step of spec.steps) if (step.action === 'upload') step.path = path.resolve(path.dirname(scenarioPath), step.path);
  return spec;
}
