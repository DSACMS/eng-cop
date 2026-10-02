// Reads an issue body back into the fields of docs/form.json.
//
// GitHub renders an issue form as "### <Label>" headings, each followed by the
// answer. This parser compares the body against the form definition instead of
// pattern-matching freeform markdown: only headings that are exactly a field
// label, appearing in form order, start a field. Everything else is answer text.
import { formatOptionLabel } from './form.mjs';

const NO_RESPONSE = '_No response_';

/** @returns {{ fields: Record<string,string>, missing: string[] }} */
export function parseIssueBody(body, form) {
  const lines = String(body ?? '').replace(/\r\n?/g, '\n').split('\n');
  const fields = {};
  let next = 0; // index of the next field heading we will accept
  let current = null;
  let buf = [];

  const flush = () => {
    if (current) {
      const text = buf.join('\n').trim();
      fields[current.id] = text === NO_RESPONSE ? '' : text;
    }
    buf = [];
  };

  for (const line of lines) {
    const heading = line.match(/^### (.+?)\s*$/);
    if (heading) {
      const at = form.fields.findIndex((f, i) => i >= next && f.label === heading[1]);
      if (at !== -1) {
        flush();
        current = form.fields[at];
        next = at + 1;
        continue;
      }
    }
    if (current) buf.push(line);
  }
  flush();

  const missing = form.fields.filter((f) => !(f.id in fields)).map((f) => f.id);
  return { fields, missing };
}

/**
 * Map a format answer back to its key. The issue form gives "Lightning talk (20 min)", but a
 * speaker editing the issue by hand may type "Lightning talk" or "lightning", so accept all
 * three, ignoring case and spacing.
 */
export function formatKeyFromLabel(label, config) {
  const norm = (s) => String(s ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
  const answer = norm(label);
  if (!answer) return null;
  const entry = Object.entries(config.formats).find(([key, f]) =>
    [key, f.label, formatOptionLabel(f)].some((candidate) => norm(candidate) === answer));
  return entry ? entry[0] : null;
}
