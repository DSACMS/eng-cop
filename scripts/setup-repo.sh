#!/usr/bin/env bash
# One-time repository setup (Build plan, Task 1). Read it, then run it with an account
# that can administer the repository. Nothing here runs automatically.
#
#   scripts/setup-repo.sh DSACMS eng-cop [extra-admin-username ...]
#
# The creator of an org repo already has admin. Any usernames after REPO are granted triage,
# which is what lets them apply the 'approved' label.
set -euo pipefail

ORG=${1:?usage: setup-repo.sh ORG REPO [extra-admin-username ...]}
REPO=${2:?usage: setup-repo.sh ORG REPO [extra-admin-username ...]}
shift 2
FULL="$ORG/$REPO"

echo "Labels"
gh label create talk             --repo "$FULL" --force --color 0071BC --description "A talk proposal (applied by the issue form)"
gh label create approved         --repo "$FULL" --force --color 1F6B3A --description "Admin-only: puts the talk on the schedule"
gh label create needs-reschedule --repo "$FULL" --force --color F2B65A --description "No slot: the date is taken, cancelled, or does not offer this format"
gh label create withdrawn        --repo "$FULL" --force --color 7A8691 --description "The presenter withdrew; frees the slot"

echo "GitHub Pages: serve /docs from the default branch"
gh api -X POST "repos/$FULL/pages" -f 'source[branch]=main' -f 'source[path]=/docs' \
  || gh api -X PUT "repos/$FULL/pages" -f 'source[branch]=main' -f 'source[path]=/docs'

for USER in "$@"; do
  echo "Admins: grant $USER triage so they can apply 'approved'"
  gh api -X PUT "repos/$FULL/collaborators/$USER" -f permission=triage
done

cat <<MSG

Still to do by hand:
  - If main requires pull requests, allow admins (or this workflow) to bypass the rule for
    sessions.yml and docs/data/schedule.json; see ADMIN.md.
  - Confirm a non-member cannot add a label to a test issue (Task 1 'done when').
  - Run: npm run check:launch
MSG
