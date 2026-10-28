#!/usr/bin/env bash
# Keep the one open issue a drift report owns, found by its exact title and the
# `schema` label: open or update it while the report stands, close it once the
# report no longer does.
#
#   drift-issue.sh open  <title> <body-file>
#   drift-issue.sh close <title> <comment>
#
# Needs GH_TOKEN with issues: write.

set -euo pipefail

action=$1
title=$2

number=$(
  TITLE=$title gh issue list --state open --label schema --limit 100 --json number,title \
    --jq 'map(select(.title == env.TITLE)) | .[0].number // empty'
)

case "$action" in
  open)
    body_file=$3
    if [ -z "$number" ]; then
      gh issue create --title "$title" --label schema --body-file "$body_file"
    elif [ "$(gh issue view "$number" --json body --jq .body)" != "$(cat "$body_file")" ]; then
      gh issue edit "$number" --body-file "$body_file"
    else
      echo "#$number is up to date"
    fi
    ;;
  close)
    comment=$3
    if [ -n "$number" ]; then
      gh issue close "$number" --comment "$comment"
    fi
    ;;
  *)
    echo "usage: drift-issue.sh <open|close> <title> <body-file|comment>" >&2
    exit 2
    ;;
esac
