import { loadConfig, parseSessions } from '../scripts/sessions.mjs';
import { loadForm, formatOptionLabel } from '../scripts/form.mjs';

export const config = loadConfig();
export const form = loadForm();
export const TODAY = '2026-10-01';

/** Sessions covering every layout, a cancelled date, and one in the past. */
export const sessions = parseSessions(`sessions:
  - date: 2026-09-17
  - date: 2026-10-08
  - date: 2026-10-22
    layout: presentation
  - date: 2026-11-05
    layout: lightning
  - date: 2026-11-19
    layout: full
  - date: 2026-12-03
    cancelled: Holiday week
  - date: 2026-12-17
`, config);

/** An issue body as GitHub renders the issue form: "### Label" headings with answers. */
export function body(values = {}) {
  const v = {
    'session-date': '2026-10-08',
    presenter: 'j-okafor',
    'talk-title': 'Load-testing a FHIR endpoint',
    'talk-format': formatOptionLabel(config.formats.lightning),
    abstract: '_No response_',
    ...values
  };
  return form.fields.map((f) => `### ${f.label}\n\n${v[f.id]}`).join('\n\n');
}

export function issue(number, values = {}, { labels = ['talk'], state = 'open' } = {}) {
  const v = { ...values };
  // Tests write `format: 'lightning'` as shorthand for the form's talk-format answer.
  if (v.format) { v['talk-format'] = formatOptionLabel(config.formats[v.format] ?? { label: v.format, minutes: 0 }); delete v.format; }
  return { number, title: `[Talk] ${v['talk-title'] ?? 'x'}`, body: body(v), labels, state };
}

export const slot = (schedule, date, format) => schedule.sessions
  .find((s) => s.date === date).slots.find((s) => s.kind === 'talk' && s.format === format);
