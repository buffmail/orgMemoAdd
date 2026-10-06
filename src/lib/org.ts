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

/** Only an org heading starts a new subject; bullets are items inside one. */
const SUBJECT = /^\*+(?:\s|$)/;

export type Entry = { kind: 'memo' | 'note'; text: string };

export type Tail = {
  /** The last org heading in the file - the subject being added to. */
  title: string | null;
  /** The `memo:`/`note:` lines under it. */
  entries: Entry[];
  /** Everything under it, verbatim. */
  body: string[];
};

function withoutOuterBlanks(lines: string[]): string[] {
  const out = [...lines];
  while (out.length && !out[0].trim()) out.shift();
  while (out.length && !out[out.length - 1].trim()) out.pop();

  return out;
}

/** Everything below the last org heading in the file. */
export function tailSection(content: string): Tail {
  const lines = content.replace(/\r\n?/g, '\n').split('\n');

  let subject = -1;
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    if (SUBJECT.test(lines[i])) {
      subject = i;
      break;
    }
  }

  const body = withoutOuterBlanks(lines.slice(subject + 1));
  const entries: Entry[] = [];

  for (const line of body) {
    const entry = ENTRY.exec(line);
    if (entry) entries.push({ kind: entry[1] as Entry['kind'], text: entry[2].trim() });
  }

  return { title: subject === -1 ? null : lines[subject].trim(), entries, body };
}
