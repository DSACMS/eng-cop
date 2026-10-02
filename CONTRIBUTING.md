# Contributing

This repository runs the Engineering CoP talk schedule. It is maintained on a **best-effort basis**
by the OHTP engineering team: issues and pull requests are welcome, but there is no guaranteed
response time or support commitment.

## Proposing a talk

Use the schedule site, or open an issue with the **Propose a talk** form. Issues that are not talk
proposals may be closed. Everything you write is public and permanent; never include email
addresses, credentials, or non-public information.

## Changing the tool

1. `npm ci && npm test` before you start.
2. If you edit `docs/form.json` or `config.yml`, run `npm run gen:template` and commit the result.
3. Never hand-edit `docs/data/schedule.json` or `.github/ISSUE_TEMPLATE/talk.yml`; both are generated.
4. Keep the constraints in mind: static hosting only, no stored credentials, no GitHub App, no secrets.

If this repository gets noisy, maintainers may enable GitHub interaction limits.
