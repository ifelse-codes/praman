import { describe, expect, it } from 'vitest';
import { classifyError, describeDiagnosis, diagnosisNextAction } from '../src/review/classify.js';

// Real Playwright/PRAMAN messages captured on 2026-11-09 (spec agent-diagnostics task 1); selectors and URLs replaced.
const dim = (text: string) => `\u001b[2m${text}\u001b[22m`;
const captured = {
  ambiguousStep: `locator.click: Error: strict mode violation: locator('.private-selector') resolved to 12 elements:\n    1) <button class="private-selector">One</button> aka getByRole('button', { name: 'One' })\n\nCall log:\n${dim("  - waiting for locator('.private-selector')")}\n`,
  ambiguousCheck: `locator.waitFor: Error: strict mode violation: locator('.private-selector') resolved to 3 elements:\n    1) <button>One</button>\n\nCall log:\n${dim("  - waiting for locator('.private-selector')")}\n`,
  waitForVisible: `locator.waitFor: Timeout 15000ms exceeded.\nCall log:\n${dim("  - waiting for locator('#private-panel') to be visible")}\n${dim('    34 × locator resolved to hidden <div id="private-panel">Later</div>')}\n`,
  clickMissing: `locator.click: Timeout 3000ms exceeded.\nCall log:\n${dim("  - waiting for locator('#private-absent')")}\n`,
  checkMissing: `locator.waitFor: Timeout 1500ms exceeded.\nCall log:\n${dim("  - waiting for locator('#private-absent')")}\n`,
  gotoStatus: 'Step 1 navigation failed',
  initialStatus: 'App navigation returned 404',
  offOrigin: 'Workflow navigation left the app origin',
  offOriginStopped: 'Navigation left the app origin: PRAMAN stopped a new tab or window going to https://private.example/ before the request was sent; 1 top-level navigation stopped.',
  refused: `page.goto: net::ERR_CONNECTION_REFUSED at http://127.0.0.1:9/private\nCall log:\n${dim('  - navigating to "http://127.0.0.1:9/private", waiting until "networkidle"')}\n`,
  initialTimeout: `page.goto: Timeout 10000ms exceeded.\nCall log:\n${dim('  - navigating to "http://127.0.0.1:1/", waiting until "networkidle"')}\n`,
  waitForURL: 'page.waitForURL: Timeout 15000ms exceeded.\n=========================== logs ===========================\nwaiting for navigation to "http://127.0.0.1:1/private" until "load"\n============================================================',
  closed: 'locator.click: Target page, context or browser has been closed',
  crashed: 'locator.click: Target crashed ',
  runtime: 'Unasserted app runtime errors: private application failure',
};

describe('classifyError on captured messages', () => {
  it.each([
    ['ambiguousStep', 'locator_ambiguous', { matched: 12 }],
    ['ambiguousCheck', 'locator_ambiguous', { matched: 3 }],
    ['waitForVisible', 'locator_timeout', { timeoutMs: 15000, state: 'visible' }],
    ['clickMissing', 'locator_timeout', { timeoutMs: 3000 }],
    ['checkMissing', 'locator_timeout', { timeoutMs: 1500 }],
    ['gotoStatus', 'navigation_failed', {}],
    ['initialStatus', 'navigation_failed', {}],
    ['offOrigin', 'navigation_failed', {}],
    ['offOriginStopped', 'navigation_failed', {}],
    ['refused', 'navigation_failed', {}],
    ['initialTimeout', 'navigation_failed', {}],
    ['waitForURL', 'navigation_failed', {}],
    ['closed', 'browser_closed', {}],
    ['crashed', 'browser_closed', {}],
    ['runtime', 'unknown', {}],
  ] as const)('%s -> %s', (name, kind, facts) => {
    expect(classifyError(captured[name])).toEqual({ kind, facts });
  });

  it('prefers a closed page over a navigation or timeout pattern', () => {
    expect(classifyError('page.goto: Target page, context or browser has been closed').kind).toBe('browser_closed');
  });

  it('keeps only fixed kinds, numbers and enum states; never selector, URL or application text', () => {
    for (const message of Object.values(captured)) {
      const diagnosis = classifyError(message);
      const shown = JSON.stringify(diagnosis) + describeDiagnosis(diagnosis) + (diagnosisNextAction(diagnosis) ?? '');
      for (const text of ['private', '127.0.0.1', 'One', 'button', 'Later', 'locator(']) expect(shown).not.toContain(text);
    }
  });

  it('labels and next actions name the class and safe counts; unknown keeps the generic action', () => {
    expect(describeDiagnosis(classifyError(captured.ambiguousStep))).toBe('locator_ambiguous (12 elements)');
    expect(describeDiagnosis(classifyError(captured.waitForVisible))).toBe('locator_timeout (visible, 15000 ms)');
    expect(describeDiagnosis(classifyError(captured.clickMissing))).toBe('locator_timeout (3000 ms)');
    expect(diagnosisNextAction(classifyError(captured.ambiguousStep))).toMatch(/matched 12 elements; make it match exactly one/);
    expect(diagnosisNextAction(classifyError(captured.waitForVisible))).toMatch(/became visible within 15000 ms/);
    expect(diagnosisNextAction(classifyError(captured.runtime))).toBeUndefined();
  });
});
