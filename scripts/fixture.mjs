// Builds a schedule that exercises every slot state, all four layouts, a partly
// booked session and a cancelled date. Dates are relative to `today`, so the
// fixture never goes stale. Used by `npm run dev:fixture` and the tests.
import { loadConfig, parseSessions } from './sessions.mjs';
import { loadForm, formatOptionLabel } from './form.mjs';
import { compileSchedule } from './build-schedule.mjs';

const addDays = (iso, n) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export function buildFixture(today, config = loadConfig(), form = loadForm()) {
  const day = (n) => addDays(today, n);
  const sessions = parseSessions(`sessions:
  - date: ${day(6)}
  - date: ${day(20)}
    layout: presentation
  - date: ${day(34)}
  - date: ${day(48)}
    layout: full
  - date: ${day(62)}
    cancelled: Holiday week. The series skips this date.
  - date: ${day(76)}
    layout: lightning
  - date: ${day(90)}
  - date: ${day(104)}
`, config);

  const body = (v) => form.fields.map((f) => `### ${f.label}\n\n${v[f.id] ?? '_No response_'}`).join('\n\n');
  let n = 40;
  const issue = (date, format, presenter, title, approved) => ({
    number: ++n,
    state: 'open',
    labels: approved ? ['talk', 'approved'] : ['talk'],
    body: body({ 'session-date': date, presenter, 'talk-title': title, 'talk-format': formatOptionLabel(config.formats[format]), abstract: 'An abstract for the agenda.' })
  });

  const issues = [
    issue(day(6), 'lightning', 'j-okafor', 'Load-testing a FHIR endpoint before launch', true),     // partly booked
    issue(day(20), 'presentation', 'm-chen', 'Reading Actions logs without losing the thread', true),
    issue(day(34), 'lightning', 'r-lin', 'FHIR bulk export at scale', false),                       // pending + open
    issue(day(90), 'lightning', 'd-alvarez', 'Pairing on accessibility fixes, live', true),         // fully booked
    issue(day(90), 'presentation', 'sachin-panayil', 'Generating code.json in CI without the busywork', true),
    issue(day(104), 'lightning', 'a-kim', 'Notes from the on-call rotation', false),               // fully pending
    issue(day(104), 'presentation', 'Jane Doe (filed by an admin)', 'A talk filed on someone\'s behalf', false)
  ];
  return compileSchedule({ config, sessions, issues, form, today }).schedule;
}
