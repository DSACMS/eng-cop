# Engineering CoP talk schedule

The schedule for the OHTP Engineering Community of Practice, at
**https://dsacms.github.io/eng-cop/**. It shows what's on for each session and which dates still
need a speaker, and it lets people claim an open slot themselves.

The meeting itself is a recurring Outlook series. This site doesn't create or manage calendar events.

The CoP is reserved for feds. To be added, reach out on **#cms-ospo**.

## Propose a talk

1. Open the site and click **Take this slot** on an open date (or **Propose a talk**).
2. Enter your GitHub username, a title, and an abstract, then click **Continue to GitHub**.
3. A prefilled issue opens on GitHub. Click **Create**.

Your slot shows as **pending** within a couple of minutes. Once an admin approves it, it joins the agenda.

- **Change something later** (title, abstract, format, date): edit your issue and the schedule follows.
- **Back out:** close your issue and the slot reopens.
- **No GitHub account?** Email opensource@cms.hhs.gov and an admin will file it for you.

Everything you enter is public on GitHub. Use a GitHub username only, never an email address.

## Run it (admins)

See **[ADMIN.md](ADMIN.md)**. In short: approve proposals by adding the `approved` label, and
cancel or change dates by editing `sessions.yml`.

## How it works

Proposals are GitHub issues. A GitHub Actions workflow reads them, builds `docs/data/schedule.json`,
and the site (GitHub Pages) displays it. There is no server, no database, and no stored credentials.

| File | What it is |
| --- | --- |
| `sessions.yml` | The session dates, layouts, and cancellations (edited by admins) |
| `config.yml` | Cadence text, contact email, formats and layouts (edited by admins) |
| `docs/form.json` | The proposal form fields |
| `.github/ISSUE_TEMPLATE/talk.yml` | The GitHub issue form (generated from `form.json`; don't edit) |
| `docs/data/schedule.json` | What the site displays (generated; don't edit) |
| `docs/index.html` | The site |
| `.github/workflows/schedule.yml` | The workflow that rebuilds the schedule |

## Develop

Requires Node 20 or newer.

```sh
npm ci
npm test               # run the tests
npm run dev            # preview the site at http://127.0.0.1:4173/
npm run dev:fixture    # same, with sample data showing every slot state
npm run validate       # check sessions.yml and config.yml
npm run gen:template   # after editing form.json or config.yml, regenerate the issue template
```

## Support

Best-effort. See [CONTRIBUTING.md](CONTRIBUTING.md).
