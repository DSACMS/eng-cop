import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compileSchedule, sameSchedule } from '../scripts/build-schedule.mjs';
import { config, form, sessions, TODAY, issue, slot } from './helpers.mjs';

const compile = (issues = []) => compileSchedule({
  config, sessions, issues, form, today: TODAY, now: new Date('2026-10-01T04:00:00Z')
});
const result = (results, n) => results.find((r) => r.number === n);

test('no issues: every talk slot is open, past sessions are dropped', () => {
  const { schedule, results } = compile();
  assert.deepEqual(schedule.sessions.map((s) => s.date),
    ['2026-10-08', '2026-10-22', '2026-11-05', '2026-11-19', '2026-12-03', '2026-12-17']);
  const states = schedule.sessions.flatMap((s) => (s.slots ?? []).filter((x) => x.kind === 'talk').map((x) => x.state));
  assert.ok(states.length > 0 && states.every((s) => s === 'open'));
  assert.deepEqual(results, []);
});

test('the output carries the contract fields', () => {
  const { schedule } = compile();
  assert.equal(schedule.generatedAt, '2026-10-01T04:00:00Z');
  assert.equal(schedule.cadence, config.cadence);
  assert.equal(schedule.ospoEmail, config.ospoEmail);
  assert.equal(schedule.repo, config.repo);
  assert.deepEqual(Object.keys(schedule.formats), ['lightning', 'presentation', 'full']);
});

test('state: approved issue is scheduled, unapproved is pending, no issue is open', () => {
  const { schedule, results } = compile([
    issue(41, { 'talk-title': 'Approved one', abstract: 'About FHIR.' }, { labels: ['talk', 'approved'] }),
    issue(42, { format: 'presentation', presenter: 'r-lin', 'talk-title': 'Pending one', abstract: 'Hidden until approved.' })
  ]);
  const a = slot(schedule, '2026-10-08', 'lightning');
  assert.deepEqual(a, {
    kind: 'talk', format: 'lightning', from: 10, to: 30, state: 'scheduled', issue: 41,
    presenter: 'j-okafor', title: 'Approved one', abstract: 'About FHIR.',
    url: `https://github.com/${config.repo}/issues/41`
  });
  const p = slot(schedule, '2026-10-08', 'presentation');
  assert.equal(p.state, 'pending');
  assert.equal(p.presenter, 'r-lin');
  assert.ok(!('abstract' in p), 'a pending hold does not publish the abstract');
  assert.equal(slot(schedule, '2026-10-22', 'presentation').state, 'open');
  assert.equal(result(results, 41).status, 'scheduled');
  assert.equal(result(results, 42).status, 'pending');
});

test('a session can be partly booked', () => {
  const { schedule } = compile([issue(1, {}, { labels: ['talk', 'approved'] })]);
  assert.equal(slot(schedule, '2026-10-08', 'lightning').state, 'scheduled');
  assert.equal(slot(schedule, '2026-10-08', 'presentation').state, 'open');
});

test('all four layouts accept a claim on the right slot', () => {
  const { schedule, results } = compile([
    issue(1, { 'session-date': '2026-10-08', format: 'presentation' }),
    issue(2, { 'session-date': '2026-10-22', format: 'presentation' }),
    issue(3, { 'session-date': '2026-11-05', format: 'lightning' }),
    issue(4, { 'session-date': '2026-11-19', format: 'full' })
  ]);
  assert.deepEqual(results.map((r) => r.status), ['pending', 'pending', 'pending', 'pending']);
  assert.equal(slot(schedule, '2026-10-08', 'presentation').from, 30);
  assert.equal(slot(schedule, '2026-10-22', 'presentation').to, 40);
  assert.equal(slot(schedule, '2026-11-19', 'full').to, 60);
  // Leftover time stays open discussion, never a slot.
  const disc = schedule.sessions.find((s) => s.date === '2026-10-22').slots.at(-1);
  assert.equal(disc.kind, 'discussion');
});

test('a cancelled date has no slots and rejects any issue on it', () => {
  const { schedule, results } = compile([issue(5, { 'session-date': '2026-12-03' })]);
  const s = schedule.sessions.find((x) => x.date === '2026-12-03');
  assert.deepEqual(s, { date: '2026-12-03', cancelled: 'Holiday week' });
  const r = result(results, 5);
  assert.equal(r.status, 'rejected');
  assert.equal(r.reason, 'cancelled');
  assert.equal(r.detail.reason, 'Holiday week');
  assert.ok(r.detail.nextOpen.length > 0 && r.detail.nextOpen.every((n) => n.format === 'lightning'));
});

test('collision: the earliest issue number wins, the later one is reported with next open slots', () => {
  const { schedule, results } = compile([
    issue(60, { 'talk-title': 'Late' }),
    issue(50, { 'talk-title': 'Early' })
  ]);
  assert.equal(slot(schedule, '2026-10-08', 'lightning').issue, 50);
  const r = result(results, 60);
  assert.equal(r.reason, 'collision');
  assert.equal(r.detail.takenBy, 50);
  assert.deepEqual(r.detail.nextOpen.map((n) => n.date), ['2026-11-05', '2026-12-17']);
  assert.ok(r.detail.nextOpen.every((n) => n.format === 'lightning'));
});

test('a format the date does not offer is reported', () => {
  const { schedule, results } = compile([issue(7, { 'session-date': '2026-11-19', format: 'lightning' })]);
  const r = result(results, 7);
  assert.equal(r.reason, 'format-unavailable');
  assert.deepEqual(r.detail.offered, ['full']);
  assert.equal(slot(schedule, '2026-11-19', 'full').state, 'open');
});

test('a talk stranded by a layout change or a cancellation is reported, never silently dropped', () => {
  const issues = [
    issue(10, { 'session-date': '2026-10-22', format: 'presentation' }, { labels: ['talk', 'approved'] })
  ];
  assert.equal(compile(issues).results[0].status, 'scheduled');

  // Admin switches 10-22 to a lightning-only layout: the approved presentation has no slot.
  const reshaped = sessions.map((s) => (s.date === '2026-10-22'
    ? { ...s, slots: s.slots.filter((x) => x.format !== 'presentation') } : s));
  const out = compileSchedule({ config, sessions: reshaped, issues, form, today: TODAY });
  assert.equal(out.results[0].reason, 'format-unavailable');

  // Admin cancels the date.
  const cancelled = sessions.map((s) => (s.date === '2026-10-22' ? { date: s.date, cancelled: 'All-hands' } : s));
  const out2 = compileSchedule({ config, sessions: cancelled, issues, form, today: TODAY });
  assert.equal(out2.results[0].reason, 'cancelled');

  // Admin removes the date from sessions.yml entirely.
  const removed = sessions.filter((s) => s.date !== '2026-10-22');
  const out3 = compileSchedule({ config, sessions: removed, issues, form, today: TODAY });
  assert.equal(out3.results[0].reason, 'unknown-date');
});

test('a date that was never a session is reported with the upcoming dates', () => {
  const r = compile([issue(8, { 'session-date': '2026-10-09' })]).results[0];
  assert.equal(r.reason, 'unknown-date');
  assert.ok(r.detail.dates.includes('2026-10-08'));
  assert.ok(!r.detail.dates.includes('2026-12-03'), 'cancelled dates are not offered');
});

test('a date in the past is excluded from the schedule and not reported as a problem', () => {
  const { schedule, results } = compile([issue(9, { 'session-date': '2026-09-17' })]);
  assert.ok(!schedule.sessions.some((s) => s.date === '2026-09-17'));
  assert.equal(results[0].status, 'past');
});

test('today still counts as upcoming', () => {
  const { schedule } = compileSchedule({ config, sessions, issues: [], form, today: '2026-10-08' });
  assert.equal(schedule.sessions[0].date, '2026-10-08');
});

test('invalid fields are reported with what to fix', () => {
  const cases = [
    [{ 'talk-title': '_No response_' }, /"Talk title" is empty/],
    [{ 'session-date': 'next Thursday' }, /real date written YYYY-MM-DD/],
    [{ presenter: 'me@cms.hhs.gov' }, /email address/],
    [{ 'talk-title': 'x'.repeat(121) }, /longer than 120/]
  ];
  for (const [values, pattern] of cases) {
    const r = compile([issue(3, values)]).results[0];
    assert.equal(r.reason, 'invalid-fields');
    assert.match(r.detail.problems.join(' '), pattern);
  }
  const noBody = compile([{ number: 4, title: 't', body: null, labels: ['talk'], state: 'open' }]).results[0];
  assert.equal(noBody.reason, 'invalid-fields');
});

test('an unknown format label is reported', () => {
  const bad = issue(6);
  bad.body = bad.body.replace('Lightning talk (20 min)', 'Keynote (90 min)');
  const problems = compile([bad]).results[0].detail.problems.join(' ');
  assert.match(problems, /Format/);
  assert.match(problems, /Lightning talk \(20 min\) \/ Presentation \(30 min\) \/ Full session \(50 min\)/, 'lists the exact options to type');
});

test('changing the format of an approved talk by editing the issue moves it to the new slot, keeping approval', () => {
  const approved = issue(5, { format: 'lightning' }, { labels: ['talk', 'approved'] });
  assert.equal(slot(compile([approved]).schedule, '2026-10-08', 'lightning').state, 'scheduled');
  const edited = { ...approved, body: approved.body.replace('Lightning talk (20 min)', 'Presentation') };
  const { schedule } = compile([edited]);
  assert.equal(slot(schedule, '2026-10-08', 'lightning').state, 'open', 'old slot is freed');
  assert.equal(slot(schedule, '2026-10-08', 'presentation').state, 'scheduled');
  assert.equal(slot(schedule, '2026-10-08', 'presentation').issue, 5);
});

test('only open issues labelled talk count; closed and withdrawn free the slot', () => {
  const { schedule, results } = compile([
    issue(1, {}, { labels: ['talk'], state: 'closed' }),
    issue(2, {}, { labels: ['talk', 'withdrawn'] }),
    issue(3, {}, { labels: ['bug'] }),
    issue(4, { 'talk-title': 'Keeper' })
  ]);
  assert.equal(slot(schedule, '2026-10-08', 'lightning').issue, 4);
  assert.deepEqual(results.map((r) => r.number), [4]);
});

test('issue content is data: markup in a title or abstract passes through as plain text for the site to escape', () => {
  const { schedule } = compile([issue(1, { 'talk-title': '<img src=x onerror=alert(1)>', abstract: '<script>x</script>' }, { labels: ['talk', 'approved'] })]);
  assert.equal(slot(schedule, '2026-10-08', 'lightning').title, '<img src=x onerror=alert(1)>');
});

test('a fake "### Format" heading inside the abstract does not override the real field', () => {
  const i = issue(1, { abstract: 'Intro\n\n### Format\n\nFull session (50 min)' });
  const { schedule } = compile([i]);
  assert.equal(slot(schedule, '2026-10-08', 'lightning').state, 'pending');
});

test('sameSchedule ignores generatedAt only', () => {
  const a = compile().schedule;
  const b = { ...a, generatedAt: '2030-01-01T00:00:00Z' };
  assert.ok(sameSchedule(a, b));
  assert.ok(!sameSchedule(a, { ...b, cadence: 'changed' }));
});

test('compiling twice from the same input gives identical output and does not mutate its input', () => {
  const before = JSON.stringify(sessions);
  const x = compile([issue(1)]);
  const y = compile([issue(1)]);
  assert.deepEqual(x, y);
  assert.equal(JSON.stringify(sessions), before);
});
