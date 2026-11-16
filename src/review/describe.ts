/**
 * One plain line per declared check, built only from its kind, source and operator: never a
 * selector, path, expected value or application text. Shown next to the authored check id.
 */
const browserLines: Record<string, string> = {
  text: 'element text equals', value: 'input value equals', visible: 'element visibility equals', attribute: 'element attribute equals',
  class: 'element class token presence equals', json: 'same-origin JSON field equals', pageErrors: 'no page runtime errors',
  image: 'image loads with real dimensions', count: 'element count equals', network: 'matching network request count equals',
};

export function describeBrowserCheck(check: { kind: string; state?: string }): string {
  if (check.kind === 'state') return `element ${check.state ?? 'state'} state equals`;
  return browserLines[check.kind] ?? check.kind;
}

export function describeCommandCheck(check: { source: string; operator: string } | '$exit'): string {
  if (check === '$exit') return 'exit code equals';
  if (['image', 'audio', 'video'].includes(check.operator)) return `artifact ${check.operator} format and properties`;
  return `${check.source} ${check.operator}`;
}
