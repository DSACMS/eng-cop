// The part of the workflow that talks to GitHub. Called from actions/github-script
// with the default GITHUB_TOKEN; no other credential exists anywhere in the system.
//
// Every run rebuilds from scratch: list all open `talk` issues, compile the schedule,
// write docs/data/schedule.json, then bring labels and status comments in line.
// Running it twice in a row changes nothing the second time.
import { loadConfig, loadSessions, todayIn } from './sessions.mjs';
import { loadForm } from './form.mjs';
import { compileSchedule, writeScheduleIfChanged, DEFAULT_OUT, LABELS } from './build-schedule.mjs';
import { statusMessage, marker, MARKER } from './messages.mjs';

const BOT = 'github-actions[bot]';
// A proposal's author gets feedback when they open or edit it; stale dates are otherwise ignored.
const FEEDBACK_ACTIONS = ['opened', 'edited'];

/**
 * @param {object} args
 * @param {object} args.github   octokit client from actions/github-script
 * @param {string} args.owner
 * @param {string} args.repo
 * @param {{ number?: number, action?: string }} [args.trigger]  the issue event that started this run, if any
 * @param {object} [args.inputs]  test seams: { config, sessions, form, today, out }
 * @returns {Promise<{ changed: boolean, results: object[] }>}
 */
export async function runSync({ github, owner, repo, trigger = {}, inputs = {}, log = () => {} }) {
  const config = inputs.config ?? loadConfig();
  const sessions = inputs.sessions ?? loadSessions(config);
  const form = inputs.form ?? loadForm();

  const raw = await github.paginate(github.rest.issues.listForRepo, {
    owner, repo, state: 'open', labels: LABELS.talk, per_page: 100
  });
  const issues = raw.filter((i) => !i.pull_request).map((i) => ({
    number: i.number,
    title: i.title,
    body: i.body ?? '',
    labels: i.labels.map((l) => (typeof l === 'string' ? l : l.name)),
    state: i.state
  }));

  const { schedule, results } = compileSchedule({ config, sessions, issues, form, today: inputs.today ?? todayIn(config.timezone) });
  const changed = writeScheduleIfChanged(inputs.out ?? DEFAULT_OUT, schedule);
  log(`${changed ? 'Updated' : 'No change to'} schedule.json; ${results.length} proposals evaluated.`);

  for (const r of results) {
    const isTrigger = trigger.number === r.number && FEEDBACK_ACTIONS.includes(trigger.action);
    if (r.status === 'past' && !isTrigger) continue;

    const issue = issues.find((i) => i.number === r.number);
    const msg = statusMessage(r, config);

    // Label: needs-reschedule tracks whether the proposal currently has no slot.
    const flagged = issue.labels.includes(LABELS.reschedule);
    if (msg.needsReschedule && !flagged) {
      await github.rest.issues.addLabels({ owner, repo, issue_number: r.number, labels: [LABELS.reschedule] });
      log(`#${r.number}: labelled ${LABELS.reschedule} (${r.reason ?? r.status})`);
    } else if (!msg.needsReschedule && flagged) {
      await github.rest.issues.removeLabel({ owner, repo, issue_number: r.number, name: LABELS.reschedule });
      log(`#${r.number}: removed ${LABELS.reschedule}`);
    }

    // Comment: one status comment per issue. A new kind of outcome gets a new comment
    // (so the author is notified); a changed detail within the same kind edits in place.
    const body = `${marker(msg.kind)}\n${msg.body}`;
    const comments = await github.paginate(github.rest.issues.listComments, {
      owner, repo, issue_number: r.number, per_page: 100
    });
    const last = comments.filter((c) => c.user?.login === BOT && c.body?.startsWith(MARKER)).at(-1);
    if (last?.body === body) continue;
    if (last?.body.startsWith(marker(msg.kind))) {
      await github.rest.issues.updateComment({ owner, repo, comment_id: last.id, body });
      log(`#${r.number}: updated status comment (${msg.kind})`);
    } else {
      await github.rest.issues.createComment({ owner, repo, issue_number: r.number, body });
      log(`#${r.number}: commented (${msg.kind})`);
    }
  }
  return { changed, results };
}
