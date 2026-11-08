/**
 * Classify a private browser execution error into a fixed kind plus safe facts.
 * Only the kind, counts, timeouts and an enum state leave private evidence; the raw
 * message (selectors, URLs, application text) never does.
 */
export type DiagnosisKind = 'locator_ambiguous' | 'locator_timeout' | 'navigation_failed' | 'browser_closed' | 'unknown';
export type AwaitedState = 'visible' | 'hidden' | 'attached' | 'detached';
export interface Diagnosis {
  kind: DiagnosisKind;
  facts: { matched?: number; timeoutMs?: number; state?: AwaitedState };
}

const ansi = /\u001b\[[0-9;]*m/g;

export function classifyError(message: string): Diagnosis {
  const text = message.replace(ansi, '');
  // First match wins; a page closed mid-navigation is a closed page, not a navigation failure.
  if (/Target page, context or browser has been closed|Target crashed|Page crashed|Browser has been closed|browser has disconnected/i.test(text)) {
    return { kind: 'browser_closed', facts: {} };
  }
  if (/strict mode violation/.test(text)) {
    const count = /resolved to (\d+) elements/.exec(text);
    return { kind: 'locator_ambiguous', facts: count ? { matched: Number(count[1]) } : {} };
  }
  const timeout = /Timeout (\d+)ms exceeded/.exec(text);
  if (timeout && /waiting for (?:locator|getBy)/.test(text)) {
    const state = /waiting for .* to be (visible|hidden|attached|detached)\s*$/m.exec(text)?.[1] as AwaitedState | undefined;
    return { kind: 'locator_timeout', facts: { timeoutMs: Number(timeout[1]), ...(state ? { state } : {}) } };
  }
  if (/^page\.(?:goto|waitForURL)\b|net::ERR_|navigation (?:failed|returned|left the app origin)/im.test(text)) {
    return { kind: 'navigation_failed', facts: {} };
  }
  return { kind: 'unknown', facts: {} };
}

/** Short label for summaries and tables, for example `locator_ambiguous (3 elements)`. */
export function describeDiagnosis(diagnosis: Diagnosis): string {
  const { matched, timeoutMs, state } = diagnosis.facts;
  if (diagnosis.kind === 'locator_ambiguous' && matched !== undefined) return `locator_ambiguous (${matched} elements)`;
  if (diagnosis.kind === 'locator_timeout' && timeoutMs !== undefined) return `locator_timeout (${state ? `${state}, ` : ''}${timeoutMs} ms)`;
  return diagnosis.kind;
}

/** Class-specific next action; `undefined` keeps the caller's generic action (kind `unknown`). */
export function diagnosisNextAction(diagnosis: Diagnosis): string | undefined {
  const { matched, timeoutMs, state } = diagnosis.facts;
  switch (diagnosis.kind) {
    case 'locator_ambiguous':
      return `The selector matched ${matched ?? 'more than one'} elements; make it match exactly one (scope it to a container or use a unique attribute), then rerun in a fresh directory.`;
    case 'locator_timeout':
      return `No element matching the selector ${state ? `became ${state}` : 'was ready'}${timeoutMs === undefined ? '' : ` within ${timeoutMs} ms`}; check the selector and that the page reaches that point in time, then rerun in a fresh directory.`;
    case 'navigation_failed':
      return 'Navigation failed, timed out or left the app origin; check that the app runs at the declared URL and that the path is same-origin and returns 2xx, then rerun in a fresh directory.';
    case 'browser_closed':
      return 'The page, context or browser closed or crashed during the run; check whether the app closes the window or crashes the tab at this point, then rerun in a fresh directory.';
    default:
      return undefined;
  }
}
