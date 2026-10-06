/** A line starting with `*` would be parsed as a new org heading. */
function escapeBodyLine(line: string): string {
  return /^\*+(\s|$)/.test(line) ? ` ${line}` : line;
}

/**
 * Renders one memo as a blank line followed by `memo: <text>`, matching the
 * existing `note:` entries in the file. Extra lines are kept verbatim.
 */
export function formatEntry(memo: string): string {
  const [first = '', ...rest] = memo.replace(/\r\n?/g, '\n').trim().split('\n');

  return ['', `memo: ${first}`, ...rest.map(escapeBodyLine)].join('\n') + '\n';
}

/**
 * Appends the entry, leaving exactly one blank line before it however the file
 * happened to end - trailing blank lines are common in org files and would
 * otherwise stack up.
 */
export function appendEntry(existing: string, entry: string): string {
  const base = existing.replace(/\s+$/, '');
  if (base === '') return entry.replace(/^\n/, '');

  return `${base}\n${entry}`;
}

/** `memo: ...` / `note: ...` */
const ENTRY = /^(memo|note):[ \t]*(.*)$/;

/** A bullet or an org heading starts a new subject, which ends the tail. */
const SUBJECT = /^(?:\s*[-+]\s|\*+\s)/;

export type Entry = { kind: 'memo' | 'note'; text: string };

/**
 * Collects the `memo:`/`note:` lines at the end of the file, walking backwards
 * and stopping at the first bullet or heading above them.
 */
export function recentEntries(content: string): Entry[] {
  const lines = content.replace(/\r\n?/g, '\n').split('\n');
  const found: Entry[] = [];

  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i];
    if (!line.trim()) continue;

    const entry = ENTRY.exec(line);
    if (entry) {
      found.push({ kind: entry[1] as Entry['kind'], text: entry[2].trim() });
      continue;
    }

    if (SUBJECT.test(line)) break;
  }

  return found.reverse();
}
