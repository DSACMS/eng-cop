# Engineering CoP talk schedule

A static site that shows the OHTP Engineering Community of Practice schedule and lets
participants claim an open speaking slot themselves. No server, no database, no stored credentials.

The meeting is an existing recurring Outlook series. This tool does not create or manage calendar
events: it is an agenda overlay that answers two questions, **what is on a given date**, and
**which upcoming dates still have nobody on them**.

## Propose a talk

1. Open the schedule site and click **Take this slot** on an open date (or **Propose a talk**).
2. Fill in your GitHub username, a title, and an abstract. Click **Continue to GitHub**.
3. A prefilled issue opens on GitHub. Click **Create**. That is the whole process.

Your slot shows as **pending** within a couple of minutes and stays reserved while an admin
confirms it. Once an admin adds the `approved` label, the talk joins the agenda. To change a
title or abstract later, edit your issue and the schedule follows.

**No GitHub account?** Email opensource@cms.hhs.gov with your date, format and title. An admin files the
proposal for you using the same issue form.

Everything is public on GitHub and permanent. Use a GitHub username only; never an email address.

## How it works

```
  browser ──► prefilled issue URL ──► GitHub issue form ──► Actions workflow ──► docs/data/schedule.json ──► Pages
  (no token)   (GitHub signs you in)   (label: talk)         (GITHUB_TOKEN)       (the only interface)
```

GitHub issues are the source of truth. Everything else is configuration an admin edits or a read
model the workflow generates.

| File | Owner | Purpose |
| --- | --- | --- |
| `sessions.yml` | Admins | Every session date, its layout, and any cancellation |
| `config.yml` | Admins | OSPO address, round robin length, formats, layouts |
| `docs/form.json` | Admins | Field definitions for the proposal form (site + issue template + parser) |
| `.github/ISSUE_TEMPLATE/talk.yml` | Generated | The issue form, generated from `form.json`; CI fails if it drifts |
| `docs/data/schedule.json` | Generated | Compiled schedule the site reads. Never hand-edit |
| `docs/index.html` | Developers | The site: schedule view and proposal form |
| `.github/workflows/schedule.yml` | Developers | Validate, parse, rebuild |
| `CODEOWNERS` | Admins | Documents who can approve |

A session is a date plus a layout. Every session opens with a 10-minute round robin; the other 50
minutes follow a layout from `config.yml` (`default`, `lightning`, `presentation`, `full`). Time a
layout does not fill becomes open discussion. See [ADMIN.md](ADMIN.md) for the admin runbook.

### Slot states

`open` (nobody yet) → `pending` (issue exists, no `approved` label: slot held) → `scheduled`
(`approved` label added by an admin). Removing the label, or closing the issue, returns it to open.

### Collisions and changes

If two people claim the same date and format, the earlier issue keeps the slot. The later one gets
the `needs-reschedule` label and a comment listing the next open slots of that format. If an admin
cancels a date or changes a layout that already has a talk, that talk is flagged the same way. A
talk never disappears silently.

## Develop

Node 20 or newer.

```sh
npm ci
npm test                 # unit tests: sessions, compiler, form, workflow logic
npm run validate         # check sessions.yml and config.yml
npm run build            # recompile docs/data/schedule.json from sessions.yml (no issues)
npm run gen:template     # regenerate .github/ISSUE_TEMPLATE/talk.yml after editing form.json or config.yml
npm run dev              # serve docs/ at http://127.0.0.1:4173/
npm run dev:fixture      # same, with a generated schedule that shows every slot state
npm run check:launch     # list placeholders still to fill in before meeting one
```

The site is plain HTML and one JSON fetch pair (`data/schedule.json`, `form.json`): no build step,
no framework, no external requests.

### Security notes

- The browser never calls the GitHub API; there is no token anywhere in the site.
- `approved` is a separate label that only people with triage permission can add. The `talk` label
  arrives automatically with every submission and is a category, not a permission boundary. The
  build step filters on `approved` alone.
- Issue text is untrusted: the site escapes every value, links only to `https://` URLs, and the
  workflow never puts issue text into a shell command.

## Support

Best-effort. See [CONTRIBUTING.md](CONTRIBUTING.md).
