# Admin runbook

For people on the admin team (triage permission). You never need to edit code for routine work.

## Approve a proposal

1. A new issue titled `[Talk] …` appears with the `talk` label. A bot comment says the slot is held.
2. Read the five fields: **Session date**, **GitHub username**, **Talk title**, **Format**, **Abstract**.
3. If it looks fine, add the **`approved`** label (right sidebar → Labels). Within about two minutes
   the talk appears on the site as scheduled and the bot comments to confirm.

Approval is a judgement about fit and logistics, not a quality review. **The default answer is yes.**
If something is wrong (wrong date, duplicate topic, needs a longer slot) comment on the issue instead.
The proposer edits their issue and the schedule follows.

To take a talk off the schedule: remove `approved` (the slot stays held as pending) or close the
issue (the slot reopens).

## Cancel a date or change its layout

1. Open `sessions.yml` on GitHub and click the pencil icon.
2. To cancel: add a `cancelled:` line with a reason under the date. To change the shape of the
   session: add or change `layout:` (`default`, `lightning`, `presentation`, `full`).

   ```yaml
   sessions:
     - date: 2026-11-27
       cancelled: Day after Thanksgiving
     - date: 2026-12-11
       layout: full
   ```
3. Commit. The site follows within a minute or two. A typo fails the run and the site keeps the previous schedule; the error names the line.
4. Any talk that was on that date (approved or pending) is labelled `needs-reschedule` and the author
   is told the next open slots. Nothing disappears silently.

If `main` requires pull requests, each change is a one-line PR unless admins may bypass the rule for this file.

## Add dates

Add `- date: YYYY-MM-DD` lines to `sessions.yml`. Keep the next four or five dates listed. There is
no recurrence rule on purpose: Outlook series drift with holidays and leave.

## File a proposal for someone without a GitHub account

They email opensource@cms.hhs.gov. Open **New issue → Propose a talk**, put **their name** in the username
field, fill the rest from their email, create the issue, then add `approved` in the same sitting.
The issue author is you; the presenter is them. There is no separate code path.

## Resolve a collision

If two people claimed the same slot, the earlier issue keeps it and the later one is labelled
`needs-reschedule` with suggested dates. If you would rather the later talk won, close the earlier issue. The slot frees up on the next run.

## When something looks wrong

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Site did not change after an edit | The workflow run failed | Actions tab → **Schedule** → open the red run; the error names the file and line |
| Proposal has no bot comment | Run still queued, or the issue lacks the `talk` label | Wait two minutes; make sure it was created from the form |
| Site shows old data after a green run | Pages did not redeploy | Re-run **Schedule** (Actions → Run workflow); check Settings → Pages |
| `needs-reschedule` will not clear | The issue still points at a taken/cancelled date | Edit the issue's date/format; it clears on the next run |

## Before the first meeting (dry run)

1. `npm run check:launch` passes (no placeholders left).
2. File three proposals end to end: one as an admin, one as a non-admin colleague, one on behalf of
   a fictional person with no account. Approve two. Leave one pending overnight and confirm it still
   holds its date the next morning.
3. Cancel one date and switch another to a single-talk layout. Confirm both reach the site and flag any talk they strand.
4. Confirm a non-admin cannot add a label to a test issue.
5. Drop the site link in chat at the close of meeting one.
