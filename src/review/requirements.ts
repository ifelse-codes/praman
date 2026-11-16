import { resolve } from 'node:path';
import { z } from 'zod';
import type { Diagnostic } from './diagnostics.js';

/**
 * Declared requirements and the checks that exercise them. Optional and without a default,
 * so a declaration without the list parses and hashes exactly as before.
 */
export const requirementsSchema = z.array(z.object({
  id: z.string().regex(/^[A-Za-z0-9._-]{1,64}$/, 'Requirement ids use letters, digits, ".", "-" and "_" (at most 64)'),
  text: z.string().trim().min(1),
  checks: z.array(z.string().min(1)).max(100),
}).strict()).min(1).max(100);
export type Requirements = z.infer<typeof requirementsSchema>;

export type RequirementStatus = 'passed' | 'failed' | 'insufficient_evidence' | 'untested';
export interface RequirementCoverage {
  /** False when the declaration has no requirement list: coverage is unknown, not complete. */
  declared: boolean;
  total: number;
  /** Requirements that name at least one check. */
  checked: number;
  untested: string[];
  requirements: Array<{ id: string; checks: string[]; status: RequirementStatus }>;
  /** One plain line for summaries and reports; ids and counts only, never requirement text. */
  summary: string;
}

/** Schema issues for duplicate requirement ids and check ids that are unknown or ambiguous. */
export function checkRequirementRefs(requirements: Requirements | undefined, known: { checks: string[]; invariants?: string[] }, ctx: z.RefinementCtx): void {
  if (!requirements) return;
  const checks = new Set(known.checks), invariants = new Set(known.invariants ?? []);
  const seen = new Set<string>();
  for (const [i, requirement] of requirements.entries()) {
    if (seen.has(requirement.id)) ctx.addIssue({ code: 'custom', path: ['requirements', i, 'id'], message: `Duplicate requirement id "${requirement.id}"` });
    seen.add(requirement.id);
    for (const [j, id] of requirement.checks.entries()) {
      if (checks.has(id) && invariants.has(id)) ctx.addIssue({ code: 'custom', path: ['requirements', i, 'checks', j], message: `"${id}" is both a check id and an invariant id; rename one` });
      else if (!checks.has(id) && !invariants.has(id)) ctx.addIssue({ code: 'custom', path: ['requirements', i, 'checks', j], message: `requirements[${i}] refers to unknown check id "${id}"` });
    }
  }
}

function combine(values: Array<string | undefined>): Exclude<RequirementStatus, 'untested'> {
  if (!values.length || values.some(value => value !== 'passed' && value !== 'failed')) return 'insufficient_evidence';
  return values.includes('failed') ? 'failed' : 'passed';
}

/**
 * Per requirement: `untested` without a check, otherwise the combined verdict of its checks
 * over every current run (a missing row is `insufficient_evidence`).
 */
export function assessRequirements(requirements: Requirements | undefined, verdictsOf: (checkId: string) => Array<string | undefined>): RequirementCoverage {
  if (!requirements) return { declared: false, total: 0, checked: 0, untested: [], requirements: [], summary: 'Requirements: not declared. This verdict covers only the declared checks, not the requirements they were meant to cover.' };
  const rows = requirements.map(requirement => ({ id: requirement.id, checks: [...requirement.checks],
    status: requirement.checks.length ? combine(requirement.checks.flatMap(verdictsOf)) : 'untested' as RequirementStatus }));
  const untested = rows.filter(row => row.status === 'untested').map(row => row.id);
  const count = (status: RequirementStatus) => rows.filter(row => row.status === status).length;
  const parts = (['passed', 'failed', 'insufficient_evidence'] as const).filter(status => count(status)).map(status => `${count(status)} ${status === 'insufficient_evidence' ? 'not proven' : status}`);
  const summary = `Requirements: ${rows.length - untested.length} of ${rows.length} have a check${parts.length ? ` (${parts.join(', ')})` : ''}.`
    + (untested.length ? ` No check: ${untested.join(', ')}.` : '');
  return { declared: true, total: rows.length, checked: rows.length - untested.length, untested, requirements: rows, summary };
}

/** A requirement without a check means the claim is incomplete: a would-be pass becomes not proven. */
export function applyCoverage<V extends string>(verdict: V, reason: string, coverage: RequirementCoverage): { verdict: V | 'insufficient_evidence'; reason: string } {
  if (verdict !== 'passed' || !coverage.untested.length) return { verdict, reason };
  return { verdict: 'insufficient_evidence', reason: `Every declared check passed, but ${coverage.untested.length} of ${coverage.total} declared requirements have no check (${coverage.untested.join(', ')}); not proven.` };
}

/** One diagnostic per requirement without a check, pointing at its declaration entry. */
export function requirementDiagnostics(coverage: RequirementCoverage, declarationFile: string): Diagnostic[] {
  return coverage.requirements.flatMap((row, index) => row.status !== 'untested' ? [] : [{
    category: 'requirement_untested' as const, requirementId: row.id,
    references: [{ path: resolve(declarationFile), pointer: `/requirements/${index}`, private: true as const }],
    nextAction: 'Add a check that exercises this requirement, or ask the user whether it is out of scope; then rerun in a fresh output folder. A requirement with no check is not passed.',
  }]);
}

/** Markdown rows for reports: requirement id, its check ids and its status. */
export function requirementRows(coverage: RequirementCoverage): string[][] {
  return coverage.requirements.map(row => [row.id, row.checks.join(', ') || 'none', row.status]);
}
