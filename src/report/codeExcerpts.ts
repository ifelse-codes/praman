import type { CodeStory } from '../case/change.js';

type Focus = NonNullable<CodeStory['excerpts']>;
interface SourceLine { file: string; old?: number; current?: number; code: string; kind: 'context' | 'removed' | 'added' }
export interface CodeExcerpt {
  file: string; side: 'before' | 'after'; label: string;
  lines: Array<{ number: number | null; code: string; changed: boolean }>;
}

/** Select real, numbered source from the supplied diff, never reconstructed file contents. */
export function selectCodeExcerpts(source: string, focus?: Focus): CodeExcerpt[] {
  const rows: SourceLine[] = [];
  let file = '', old = 0, current = 0, oldLeft = 0, currentLeft = 0;
  for (const line of source.split('\n')) {
    const hunk = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (hunk) {
      if (oldLeft || currentLeft) throw new Error('The supplied diff has an incomplete source hunk.');
      old = Number(hunk[1]); oldLeft = Number(hunk[2] ?? 1);
      current = Number(hunk[3]); currentLeft = Number(hunk[4] ?? 1);
      continue;
    }
    if (oldLeft || currentLeft) {
      if (line.startsWith('-')) { rows.push({ file, old: old++, code: line.slice(1), kind: 'removed' }); oldLeft--; }
      else if (line.startsWith('+')) { rows.push({ file, current: current++, code: line.slice(1), kind: 'added' }); currentLeft--; }
      else if (line.startsWith(' ')) { rows.push({ file, old: old++, current: current++, code: line.slice(1), kind: 'context' }); oldLeft--; currentLeft--; }
      else if (!line.startsWith('\\ No newline')) throw new Error('The supplied diff has an incomplete source hunk.');
      if (oldLeft < 0 || currentLeft < 0 || !file) throw new Error('The supplied diff has invalid source hunk counts or file headers.');
    } else if (line.startsWith('+++ ')) file = line.slice(4).replace(/^b\//, '').split('\t')[0];
  }
  if (oldLeft || currentLeft) throw new Error('The supplied diff has an incomplete source hunk.');
  if (!rows.some(row => row.kind !== 'context')) throw new Error('The supplied diff contains no source changes to present.');
  const numbered = (row: SourceLine, side: 'before' | 'after') => side === 'before' ? row.old : row.current;
  if (focus) return focus.map(excerpt => {
    const lines = rows.filter(row => row.file === excerpt.file && numbered(row, excerpt.side) !== undefined
      && numbered(row, excerpt.side)! >= excerpt.from && numbered(row, excerpt.side)! <= excerpt.to);
    const numbers = lines.map(row => numbered(row, excerpt.side)!);
    if (numbers.length !== excerpt.to - excerpt.from + 1 || numbers.some((n, i) => n !== excerpt.from + i)) {
      throw new Error(`Code excerpt is not fully present in the supplied diff: ${excerpt.file} (${excerpt.side} ${excerpt.from}–${excerpt.to}).`);
    }
    return { ...excerpt, lines: lines.map(row => ({ number: numbered(row, excerpt.side)!, code: row.code, changed: row.kind !== 'context' })) };
  });
  // A short selection by default; an authored focus can include the surrounding explanation.
  const firstFile = rows.find(row => row.kind !== 'context')!.file;
  return (['before', 'after'] as const).flatMap(side => {
    const changed = rows.filter(row => row.file === firstFile && row.kind === (side === 'before' ? 'removed' : 'added')).slice(0, 10);
    if (!changed.length) return [];
    const lines: CodeExcerpt['lines'] = [];
    for (const row of changed) {
      const number = numbered(row, side)!;
      const previous = lines.at(-1)?.number;
      if (previous !== undefined && previous !== null && number !== previous + 1) lines.push({ number: null, code: '… omitted lines …', changed: false });
      lines.push({ number, code: row.code, changed: true });
    }
    return [{ file: firstFile, side, label: side === 'before' ? 'Removed' : 'Added', lines }];
  });
}
