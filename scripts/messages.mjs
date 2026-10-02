// The comment the workflow leaves on each proposal. Pure text: no API calls.
//
// Anything that came from an issue is untrusted. It is shown in code spans, with
// backticks stripped, so a crafted value cannot ping people or inject markdown.
import { formatOptionLabel } from './form.mjs';

export const MARKER = '<!-- eng-cop-status';
export const marker = (kind) => `${MARKER}:${kind} -->`;

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function niceDate(iso) {
  const d = new Date(`${iso}T12:00:00Z`);
  return `${DOW[d.getUTCDay()]} ${MON[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

const code = (s) => `\`${String(s).replace(/[`\r\n]/g, ' ').slice(0, 80)}\``;
const label = (config, key) => (config.formats[key] ? formatOptionLabel(config.formats[key]) : key);

const nextOpen = (config, list) => (list?.length
  ? `Next open slots: ${list.map((n) => `${niceDate(n.date)} (${label(config, n.format)})`).join('; ')}.`
  : 'No open slot of that format is listed right now; check the schedule or ask an admin.');

const FIX = 'Edit the issue body (the **Session date** and **Format** fields) and this re-runs automatically.';

/**
 * @param {object} result one entry from compileSchedule().results
 * @param {object} config
 * @param {object} issue  { number, presenter? } for wording only
 * @returns {{ kind: string, body: string, needsReschedule: boolean }}
 */
export function statusMessage(result, config) {
  const day = result.date ? niceDate(result.date) : '';
  const fmt = result.format ? label(config, result.format) : '';

  if (result.status === 'pending') {
    return {
      kind: 'pending', needsReschedule: false,
      body: `**Slot held.** Your ${fmt} on ${day} is reserved while an admin reviews it. ` +
        'Once an admin adds the `approved` label it joins the agenda. If something needs to change, ' +
        'edit this issue and the schedule follows.'
    };
  }
  if (result.status === 'scheduled') {
    return {
      kind: 'scheduled', needsReschedule: false,
      body: `**Approved.** Your ${fmt} is on the schedule for ${day}. Edit this issue any time to update the title or abstract.`
    };
  }
  if (result.status === 'past') {
    return {
      kind: 'past', needsReschedule: true,
      body: `**That date has already passed.** ${code(result.date)} is before today, so there is no slot to hold. ` +
        'Pick an upcoming date on the schedule site and edit the **Session date** field here.'
    };
  }

  const d = result.detail ?? {};
  let lead;
  switch (result.reason) {
    case 'invalid-fields':
      return {
        kind: 'invalid-fields', needsReschedule: true,
        body: `**This proposal can't be scheduled yet.**\n\n${d.problems.map((p) => `- ${String(p).replace(/[`\r\n]/g, ' ')}`).join('\n')}\n\n` +
          'Edit the issue body to fix this and the workflow re-runs automatically. Labelled `needs-reschedule` until then.'
      };
    case 'unknown-date':
      lead = `${code(result.date)} is not one of the session dates. Upcoming dates: ${d.dates.map(niceDate).join('; ') || 'none listed'}.`;
      break;
    case 'cancelled':
      lead = `The session on ${day} is cancelled (${code(d.reason)}), so this talk no longer has a slot.`;
      break;
    case 'format-unavailable':
      lead = `The session on ${day} does not offer ${fmt}. It offers: ${d.offered.map((k) => label(config, k)).join('; ')}.`;
      break;
    case 'collision':
      lead = `The ${fmt} slot on ${day} is already held by #${d.takenBy}.`;
      break;
    default:
      lead = 'This proposal could not be placed on the schedule.';
  }
  return {
    kind: result.reason, needsReschedule: true,
    body: `**This talk needs a new slot.** ${lead}\n\n${nextOpen(config, d.nextOpen)}\n\n${FIX} Labelled \`needs-reschedule\` until then.`
  };
}
