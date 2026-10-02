# Admin guide

How to run the Engineering CoP schedule. You do two things: **approve proposals** (with a label) and
**edit the calendar** (one file, `sessions.yml`). Everything else is automatic.

Changes show up on the site about two minutes after you make them. A bot comments on each
proposal so you and the speaker can see what happened.

## What you will see

| On the site | What it means | Label on the issue |
| --- | --- | --- |
| Open | Nobody has claimed it | none |
| Pending | Someone proposed it and it's held. Not approved yet | `talk` |
| Talk | Approved and on the agenda | `talk` + `approved` |
| Skipped | The date is cancelled | none |

`needs-reschedule` means a proposal has no slot right now (the date was cancelled, the slot is taken,
or the date or format is wrong). The bot's comment says why and lists the next open slots.

## One-time setup for each admin

- You need **triage** access to the repository. Only people with triage or higher can add the `approved` label.
- Click **Watch → Custom → Issues** on the repo so you hear about new proposals.

## Proposals

### Approve a proposal
1. Open the new issue (titled `[Talk] …`).
2. Check the date, format, and title look reasonable. The default answer is yes.
3. Add the **`approved`** label. The talk is on the agenda in about two minutes and the bot confirms.

### Something needs to change before approving
Comment on the issue. The speaker edits their issue (the **⋯** menu on the first post → **Edit**) and
the schedule follows. Approve once it's right.

### A speaker wants a different format or date (before or after approval)
They edit their own issue: change the answer under **Format** or **Session date**.
- Format answers can be written like `Lightning talk (20 min)`, `Lightning talk`, or `lightning`.
- Dates are written `YYYY-MM-DD` and must be a date with an open slot of that format.

If the new slot is free, the talk moves and **stays approved**. You don't need to do anything. If you
want to re-check it, remove `approved`, then add it back when you're happy.
If the new slot is taken or the date is cancelled, the issue gets `needs-reschedule` and the bot
suggests other dates.

### A speaker backs out
Close the issue (the speaker or an admin can). The slot reopens on the site in about two minutes.
Reopening the issue puts the talk back, if the slot is still free.

### Take an approved talk back to pending
Remove the `approved` label. The slot stays held but shows as pending. To free the slot, close the issue.

### Two people want the same slot
The earlier issue keeps it. The later one gets `needs-reschedule` and the bot lists other open
slots. They edit their issue to pick one. If you'd rather the later talk go first, close the earlier issue.

### Someone doesn't have a GitHub account
They email **opensource@cms.hhs.gov**. You create a new issue from **Propose a talk**, put **their name**
in the username field, fill in the rest, and add `approved`. The issue is yours; the presenter shown
on the site is them.

### A proposal that shouldn't be there
Comment briefly and close it. Proposals appear on the site as pending (title and presenter, not the
abstract) as soon as they're created, so close spam quickly.

### A proposal nobody approved
Nothing to do. It disappears from the site when its session date passes.

## The calendar (`sessions.yml`)

**To edit:** open `sessions.yml` on GitHub → pencil icon → change → **Commit changes**. If you make a
typo, the update fails and the site keeps the previous schedule; the error in the Actions tab names the line.
If the `main` branch requires pull requests, make the change as a one-line PR instead.

### Add dates
Add `- date: YYYY-MM-DD` lines. Keep the next four or five dates listed. Past dates drop off the site by themselves.

### Cancel a date
Add a `cancelled:` line with a reason:

```yaml
  - date: 2026-11-27
    cancelled: Day after Thanksgiving
```

The site shows it as skipped. Any talk on that date (approved or pending) gets `needs-reschedule`
and a comment with the next open slots, so the speaker can pick a new date. Nothing disappears silently.

### Bring a cancelled date back
Delete the `cancelled:` line. Talks that were flagged for that date go back to normal on their own.

### Change what a date looks like
Add a `layout:` line:

| Layout | Talk slots after the 10-minute round robin | Rest of the hour |
| --- | --- | --- |
| `default` (if you write nothing) | Lightning talk (20 min), then presentation (30 min) | none |
| `lightning` | Lightning talk (20 min) | open discussion |
| `presentation` | Presentation (30 min) | open discussion |
| `full` | One 50-minute session | none |

```yaml
  - date: 2026-12-11
    layout: full
```

If the new layout no longer has a slot for an existing talk, it gets `needs-reschedule` like a cancellation.

### Move a date
Change the date in `sessions.yml`. Talks on the old date get `needs-reschedule`, and speakers update their issues.

## Settings (`config.yml`)

Edit the same way as `sessions.yml`.
- `cadence`: the line of text under the page title (for example "Every other Friday, 12:00-1:00 pm ET").
- `ospoEmail`: the address shown to people without a GitHub account.

Changing formats (names, lengths, new ones) or the layout definitions changes the issue form too, so ask a developer to do it.

## Admins and access

- **Add an admin:** repo **Settings → Collaborators and teams** → add them with the **Triage** role. Update `CODEOWNERS` to match.
- **Remove an admin:** remove their access there and in `CODEOWNERS`.

## If something looks wrong

| Problem | Try this |
| --- | --- |
| The site didn't change after an edit | Actions tab → **Schedule**. If the latest run is red, open it: the error names the file and line. Fix the file and commit again. |
| No bot comment on a proposal | Wait two minutes. Make sure the issue has the `talk` label (it comes from the form). Issues made without the form aren't picked up. |
| `needs-reschedule` won't clear | The issue still points at a taken or cancelled slot. Have the speaker edit the date or format. It clears on the next run. |
| A green run but the site is old | Clear your browser cache, or wait a few minutes. If it persists, Actions → **Schedule** → **Run workflow**. |
| You want to force a rebuild | Actions → **Schedule** → **Run workflow**. It also runs on its own every night. |
