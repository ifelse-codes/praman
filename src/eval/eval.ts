export type Verdict = 'passed' | 'failed' | 'not_executed' | 'insufficient_evidence';

export interface EvalResult { caseId: string; run: number; verdict: Verdict; evidence: string; durationMs: number; }

export function summarize(results: EvalResult[]): { verdict: Verdict; passed: number; failed: number; insufficient: number } {
  const passed = results.filter(r => r.verdict === 'passed').length;
  const failed = results.filter(r => r.verdict === 'failed').length;
  const insufficient = results.filter(r => r.verdict === 'insufficient_evidence').length;
  const verdict: Verdict = results.length === 0 ? 'not_executed' : failed > 0 ? 'failed'
    : insufficient > 0 ? 'insufficient_evidence' : passed === results.length ? 'passed' : 'not_executed';
  return { verdict, passed, failed, insufficient };
}
