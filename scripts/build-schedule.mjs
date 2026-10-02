// Compiles sessions + issues into docs/data/schedule.json (the contract between
// the workflow and the site). Pure: no network, no clock unless passed in.
//
//   node scripts/build-schedule.mjs [--issues issues.json] [--results results.json]
//                                   [--out docs/data/schedule.json] [--today YYYY-MM-DD]
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import {
  ROOT, ConfigError, loadConfig, loadSessions, isRealDate, todayIn
} from './sessions.mjs';
import { loadForm, formatOptionLabel } from './form.mjs';
import { parseIssueBody, formatKeyFromLabel } from './parse-issue.mjs';

export const LABELS = { talk: 'talk', approved: 'approved', withdrawn: 'withdrawn', reschedule: 'needs-reschedule' };
const NEXT_OPEN = 3;

const clean = (s) => String(s ?? '').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim();
const oneLine = (s) => clean(s).replace(/\s+/g, ' ');

/** Turn one issue into a proposal, or a list of problems a human can fix by editing the issue. */
function toProposal(issue, form, config) {
  const { fields, missing } = parseIssueBody(issue.body, form);
  const problems = [];
  const max = (id, fallback) => form.fields.find((f) => f.id === id).maxLength ?? fallback;
  const labelOf = (id) => form.fields.find((f) => f.id === id).label;
  for (const f of form.fields.filter((x) => x.required)) {
    if (missing.includes(f.id) || !clean(fields[f.id])) problems.push(`"${f.label}" is empty`);
  }
  if (problems.length) return { problems };

  const date = oneLine(fields['session-date']);
  if (!isRealDate(date)) problems.push(`"${labelOf('session-date')}" must be a real date written YYYY-MM-DD, not "${date.slice(0, 40)}"`);

  const format = formatKeyFromLabel(oneLine(fields['talk-format']), config);
  if (!format) problems.push(`"${labelOf('talk-format')}" must be one of: ${Object.values(config.formats).map(formatOptionLabel).join(' / ')}`);

  const presenter = oneLine(fields.presenter).replace(/^@/, '');
  if (presenter.includes('@')) problems.push('the presenter looks like an email address; use a GitHub username only');
  else if (presenter.length > max('presenter', 60)) problems.push(`the presenter is longer than ${max('presenter', 60)} characters`);

  const title = oneLine(fields['talk-title']);
  if (title.length > max('talk-title', 120)) problems.push(`the talk title is longer than ${max('talk-title', 120)} characters`);

  const abstract = clean(fields.abstract);
  if (abstract.length > max('abstract', 2000)) problems.push(`the abstract is longer than ${max('abstract', 2000)} characters`);

  if (problems.length) return { problems };
  return { date, format, presenter, title, abstract };
}

/**
 * @param {object} input
 * @param {object} input.config     parsed config.yml
 * @param {object[]} input.sessions parsed sessions.yml (expanded, see sessions.mjs)
 * @param {object[]} input.issues   [{ number, title, body, labels: string[], state: 'open'|'closed' }]
 * @param {object} input.form       parsed docs/form.json
 * @param {string} input.today      YYYY-MM-DD in config.timezone
 * @param {Date}   [input.now]
 * @returns {{ schedule: object, results: object[] }}
 *   results has one entry per talk issue: { number, status, ... } where status is
 *   scheduled | pending | rejected | past. Rejected ones carry a reason and detail.
 */
export function compileSchedule({ config, sessions, issues, form, today, now = new Date() }) {
  const upcoming = JSON.parse(JSON.stringify(sessions.filter((s) => s.date >= today)));
  const byDate = new Map(sessions.map((s) => [s.date, s]));
  const upcomingByDate = new Map(upcoming.map((s) => [s.date, s]));
  const repoUrl = `https://github.com/${config.repo}`;

  const live = issues
    .filter((i) => i.state === 'open'
      && i.labels.includes(LABELS.talk)
      && !i.labels.includes(LABELS.withdrawn))
    .sort((a, b) => a.number - b.number);

  const results = [];
  const rejected = (issue, reason, detail = {}, extra = {}) => results.push({ number: issue.number, status: 'rejected', reason, detail, ...extra });
  const claims = []; // accepted proposals, in issue order

  for (const issue of live) {
    const p = toProposal(issue, form, config);
    if (p.problems) { rejected(issue, 'invalid-fields', { problems: p.problems }); continue; }
    const base = { date: p.date, format: p.format };
    const session = byDate.get(p.date);

    if (p.date < today) { results.push({ number: issue.number, status: 'past', ...base }); continue; }
    if (!session) { rejected(issue, 'unknown-date', { dates: upcoming.filter((s) => !s.cancelled).map((s) => s.date) }, base); continue; }
    if (session.cancelled) { rejected(issue, 'cancelled', { reason: session.cancelled }, base); continue; }
    if (!session.slots.some((s) => s.kind === 'talk' && s.format === p.format)) {
      const offered = [...new Set(session.slots.filter((s) => s.kind === 'talk').map((s) => s.format))];
      rejected(issue, 'format-unavailable', { offered }, base);
      continue;
    }
    claims.push({ issue, ...p });
  }

  // Assign in issue order: the earliest issue for a date + format keeps the slot.
  const claimedBy = new Map(); // `${date}|${format}` -> issue numbers, for collision messages
  for (const c of claims) {
    const session = upcomingByDate.get(c.date);
    const slot = session.slots.find((s) => s.kind === 'talk' && s.format === c.format && s.state === 'open');
    const key = `${c.date}|${c.format}`;
    if (!slot) {
      rejected(c.issue, 'collision', { takenBy: claimedBy.get(key)[0] }, { date: c.date, format: c.format });
      continue;
    }
    claimedBy.set(key, [...(claimedBy.get(key) ?? []), c.issue.number]);
    const approved = c.issue.labels.includes(LABELS.approved);
    Object.assign(slot, {
      state: approved ? 'scheduled' : 'pending',
      issue: c.issue.number,
      presenter: c.presenter,
      title: c.title,
      // An unapproved proposal is a hold, not agenda content: its abstract is not published.
      ...(approved && c.abstract ? { abstract: c.abstract } : {}),
      url: `${repoUrl}/issues/${c.issue.number}`
    });
    results.push({ number: c.issue.number, status: approved ? 'scheduled' : 'pending', date: c.date, format: c.format });
  }

  // Offer the next open slots of the same format to everyone who has to move.
  const nextOpen = (format) => upcoming
    .filter((s) => !s.cancelled)
    .flatMap((s) => s.slots.filter((x) => x.kind === 'talk' && x.format === format && x.state === 'open')
      .map((x) => ({ date: s.date, format, from: x.from, to: x.to })))
    .slice(0, NEXT_OPEN);
  for (const r of results) {
    if (r.status === 'rejected' && r.format) r.detail.nextOpen = nextOpen(r.format);
  }

  results.sort((a, b) => a.number - b.number);
  const schedule = {
    generatedAt: now.toISOString().replace(/\.\d+Z$/, 'Z'),
    cadence: config.cadence,
    timezone: config.timezone,
    repo: config.repo,
    ospoEmail: config.ospoEmail,
    formats: config.formats,
    sessions: upcoming
  };
  return { schedule, results };
}

/** Same schedule apart from the timestamp? Then there is nothing to commit. */
export function sameSchedule(a, b) {
  const strip = ({ generatedAt, ...rest }) => JSON.stringify(rest);
  return strip(a) === strip(b);
}

export const DEFAULT_OUT = join(ROOT, 'docs/data/schedule.json');

/** Writes the schedule unless only its timestamp would change. Returns true if it wrote. */
export function writeScheduleIfChanged(path, schedule) {
  const previous = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null;
  if (previous && sameSchedule(previous, schedule)) return false;
  writeFileSync(path, `${JSON.stringify(schedule, null, 2)}\n`);
  return true;
}

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? null : process.argv[i + 1];
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const config = loadConfig();
    const sessions = loadSessions(config);
    const issuesFile = arg('issues');
    const issues = issuesFile ? JSON.parse(readFileSync(issuesFile, 'utf8')) : [];
    const today = arg('today') ?? todayIn(config.timezone);
    const { schedule, results } = compileSchedule({ config, sessions, issues, form: loadForm(), today });

    const out = arg('out') ?? DEFAULT_OUT;
    const changed = writeScheduleIfChanged(out, schedule);
    console.log(changed ? `Wrote ${out} (${schedule.sessions.length} upcoming sessions).` : `${out} is up to date (${schedule.sessions.length} upcoming sessions).`);
    if (arg('results')) writeFileSync(arg('results'), `${JSON.stringify(results, null, 2)}\n`);
  } catch (err) {
    if (!(err instanceof ConfigError)) throw err;
    console.error(process.env.GITHUB_ACTIONS ? `::error::${err.message}` : err.message);
    process.exit(1);
  }
}
