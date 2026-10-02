import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runSync } from '../scripts/github-sync.mjs';
import { statusMessage, MARKER } from '../scripts/messages.mjs';
import { config, form, sessions, TODAY, body } from './helpers.mjs';
import { formatOptionLabel } from '../scripts/form.mjs';

/** Just enough of octokit to run the workflow logic, recording every write. */
function fakeGithub() {
  const issues = [];
  const comments = new Map();
  const writes = [];
  let nextComment = 1000;
  const api = {
    paginate: async (fn, params) => fn(params),
    rest: {
      issues: {
        listForRepo: async () => issues.filter((i) => i.state === 'open' && i.labels.some((l) => l.name === 'talk')),
        listComments: async ({ issue_number }) => comments.get(issue_number) ?? [],
        createComment: async ({ issue_number, body: b }) => {
          writes.push(['comment', issue_number]);
          const list = comments.get(issue_number) ?? [];
          list.push({ id: nextComment++, body: b, user: { login: 'github-actions[bot]' } });
          comments.set(issue_number, list);
        },
        updateComment: async ({ comment_id, body: b }) => {
          writes.push(['update', comment_id]);
          for (const list of comments.values()) { const c = list.find((x) => x.id === comment_id); if (c) c.body = b; }
        },
        addLabels: async ({ issue_number, labels }) => {
          writes.push(['label+', issue_number, labels[0]]);
          issues.find((i) => i.number === issue_number).labels.push({ name: labels[0] });
        },
        removeLabel: async ({ issue_number, name }) => {
          writes.push(['label-', issue_number, name]);
          const i = issues.find((x) => x.number === issue_number);
          i.labels = i.labels.filter((l) => l.name !== name);
        }
      }
    }
  };
  return {
    api, issues, comments, writes,
    open(number, values = {}, labels = ['talk']) {
      const v = { format: formatOptionLabel(config.formats.lightning), ...values };
      issues.push({ number, title: 't', body: body(v), state: 'open', labels: labels.map((name) => ({ name })) });
    },
    has: (n, name) => issues.find((i) => i.number === n).labels.some((l) => l.name === name),
    lastComment: (n) => (comments.get(n) ?? []).at(-1)?.body,
    count: (n) => (comments.get(n) ?? []).length
  };
}

const out = join(mkdtempSync(join(tmpdir(), 'eng-cop-')), 'schedule.json');
const run = (gh, trigger = {}, over = {}) => runSync({
  github: gh.api, owner: 'o', repo: 'r', trigger,
  inputs: { config, sessions, form, today: TODAY, out, ...over }
});
const schedule = () => JSON.parse(readFileSync(out, 'utf8'));
const lightning = (date) => schedule().sessions.find((s) => s.date === date).slots.find((s) => s.format === 'lightning');

test('open → pending with a comment; approve → scheduled; unapprove → pending again', async () => {
  const gh = fakeGithub();
  gh.open(11);
  await run(gh, { number: 11, action: 'opened' });
  assert.equal(lightning('2026-10-08').state, 'pending');
  assert.match(gh.lastComment(11), /Slot held/);

  gh.issues[0].labels.push({ name: 'approved' });
  await run(gh, { number: 11, action: 'labeled' });
  assert.equal(lightning('2026-10-08').state, 'scheduled');
  assert.match(gh.lastComment(11), /Approved/);

  gh.issues[0].labels = gh.issues[0].labels.filter((l) => l.name !== 'approved');
  await run(gh, { number: 11, action: 'unlabeled' });
  assert.equal(lightning('2026-10-08').state, 'pending');
  assert.match(gh.lastComment(11), /Slot held/);
});

test('a second issue on a taken slot is labelled needs-reschedule and told the next open slots', async () => {
  const gh = fakeGithub();
  gh.open(11);
  gh.open(12, { 'talk-title': 'Second' });
  await run(gh, { number: 12, action: 'opened' });
  assert.ok(gh.has(12, 'needs-reschedule'));
  assert.ok(!gh.has(11, 'needs-reschedule'));
  const msg = gh.lastComment(12);
  assert.match(msg, /already held by #11/);
  assert.match(msg, /Nov 5, 2026/);
  assert.equal(lightning('2026-10-08').issue, 11);
});

test('editing the second issue to a free slot clears the label and posts a new outcome', async () => {
  const gh = fakeGithub();
  gh.open(11);
  gh.open(12, { 'talk-title': 'Second' });
  await run(gh, { number: 12, action: 'opened' });
  gh.issues[1].body = body({ 'talk-title': 'Second', 'session-date': '2026-11-05', format: formatOptionLabel(config.formats.lightning) });
  await run(gh, { number: 12, action: 'edited' });
  assert.ok(!gh.has(12, 'needs-reschedule'));
  assert.match(gh.lastComment(12), /Slot held/);
  assert.equal(gh.count(12), 2, 'a new kind of outcome is a new comment, so the author is notified');
});

test('running again with nothing changed makes no API writes and does not rewrite the file', async () => {
  const gh = fakeGithub();
  gh.open(11);
  gh.open(12, { 'talk-title': 'Second' });
  await run(gh, { number: 12, action: 'opened' });
  gh.writes.length = 0;
  const again = await run(gh);
  assert.deepEqual(gh.writes, []);
  assert.equal(again.changed, false);
});

test('cancelling a date flags the talk on it; it is never dropped silently', async () => {
  const gh = fakeGithub();
  gh.open(11, {}, ['talk', 'approved']);
  await run(gh);
  const cancelled = sessions.map((s) => (s.date === '2026-10-08' ? { date: s.date, cancelled: 'CMS all-hands' } : s));
  await run(gh, {}, { sessions: cancelled });
  assert.ok(gh.has(11, 'needs-reschedule'));
  assert.match(gh.lastComment(11), /cancelled \(`CMS all-hands`\)/);
  assert.deepEqual(schedule().sessions.find((s) => s.date === '2026-10-08'), { date: '2026-10-08', cancelled: 'CMS all-hands' });
});

test('the same detail changing within one outcome edits the comment instead of adding another', async () => {
  const gh = fakeGithub();
  gh.open(11);
  gh.open(12, { 'talk-title': 'Second' });
  await run(gh, { number: 12, action: 'opened' });
  gh.open(13, { 'session-date': '2026-11-05', 'talk-title': 'Takes the next open slot' });
  await run(gh);
  assert.equal(gh.count(12), 1);
  assert.match(gh.lastComment(12), /Dec 17, 2026/);
  assert.ok(!/Nov 5, 2026/.test(gh.lastComment(12).split('Next open slots:')[1]));
});

test('a past date only gets feedback on the issue that was just opened or edited', async () => {
  const gh = fakeGithub();
  gh.open(11, { 'session-date': '2026-09-17' });
  await run(gh);
  assert.equal(gh.count(11), 0);
  assert.ok(!gh.has(11, 'needs-reschedule'));
  await run(gh, { number: 11, action: 'opened' });
  assert.match(gh.lastComment(11), /already passed/);
});

test('closed, withdrawn and non-talk issues are left alone', async () => {
  const gh = fakeGithub();
  gh.open(11, {}, ['talk', 'withdrawn']);
  gh.open(12, {}, ['bug']);
  await run(gh);
  assert.equal(gh.writes.length, 0);
  assert.equal(lightning('2026-10-08').state, 'open');
});

test('a comment that copies the marker but is not from the bot is ignored', async () => {
  const gh = fakeGithub();
  gh.open(11);
  gh.comments.set(11, [{ id: 1, body: `${MARKER}:pending -->\nSlot held.`, user: { login: 'someone-else' } }]);
  await run(gh, { number: 11, action: 'opened' });
  assert.equal(gh.count(11), 2, 'the bot posts its own status comment');
});

test('untrusted text is shown in code spans with backticks stripped, so it cannot ping or inject', () => {
  const m = statusMessage({ status: 'rejected', reason: 'cancelled', number: 1, date: '2026-10-08', format: 'lightning', detail: { reason: '@everyone `boom`', nextOpen: [] } }, config);
  assert.ok(m.body.includes('(`@everyone  boom `)'), m.body);
  const bad = statusMessage({ status: 'rejected', reason: 'invalid-fields', number: 1, detail: { problems: ['`x`\n@team'] } }, config);
  assert.ok(!bad.body.includes('`x`'));
});

test('every outcome has a message, a kind and a needs-reschedule decision', () => {
  const base = { number: 1, date: '2026-10-08', format: 'lightning' };
  const cases = [
    { ...base, status: 'pending' }, { ...base, status: 'scheduled' }, { ...base, status: 'past' },
    { ...base, status: 'rejected', reason: 'invalid-fields', detail: { problems: ['a'] } },
    { ...base, status: 'rejected', reason: 'unknown-date', detail: { dates: ['2026-10-08'] } },
    { ...base, status: 'rejected', reason: 'cancelled', detail: { reason: 'x', nextOpen: [] } },
    { ...base, status: 'rejected', reason: 'format-unavailable', detail: { offered: ['full'], nextOpen: [] } },
    { ...base, status: 'rejected', reason: 'collision', detail: { takenBy: 2, nextOpen: [{ date: '2026-11-05', format: 'lightning' }] } }
  ];
  const kinds = cases.map((c) => statusMessage(c, config));
  assert.equal(new Set(kinds.map((k) => k.kind)).size, cases.length);
  assert.deepEqual(kinds.map((k) => k.needsReschedule), [false, false, true, true, true, true, true, true]);
});
