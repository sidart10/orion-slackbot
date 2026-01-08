#!/bin/bash
# lib/check-status.sh
# Helper to parse sprint-status.yaml and check story status

SPRINT_STATUS="${SPRINT_STATUS:-docs/sprint-status.yaml}"

# Get story status from sprint-status.yaml
get_story_status() {
  local story_id="$1"

  if [ ! -f "$SPRINT_STATUS" ]; then
    echo "ERROR: sprint-status.yaml not found at $SPRINT_STATUS" >&2
    return 1
  fi

  yq ".development_status[\"$story_id\"]" "$SPRINT_STATUS"
}

# Find next backlog story (top-to-bottom order)
get_next_backlog_story() {
  if [ ! -f "$SPRINT_STATUS" ]; then
    echo "ERROR: sprint-status.yaml not found at $SPRINT_STATUS" >&2
    return 1
  fi

  yq '.development_status | to_entries[] |
    select(.key | test("^[0-9]+-[0-9]+-")) |
    select(.value == "backlog") | .key' "$SPRINT_STATUS" | head -1
}

# Find next epic in backlog
get_next_backlog_epic() {
  if [ ! -f "$SPRINT_STATUS" ]; then
    echo "ERROR: sprint-status.yaml not found at $SPRINT_STATUS" >&2
    return 1
  fi

  yq '.development_status | to_entries[] |
    select(.key | test("^epic-[0-9]+$")) |
    select(.value == "backlog") | .key' "$SPRINT_STATUS" | head -1
}

# Count remaining stories in epic
count_epic_stories() {
  local epic_num="$1"

  if [ ! -f "$SPRINT_STATUS" ]; then
    echo "ERROR: sprint-status.yaml not found at $SPRINT_STATUS" >&2
    return 1
  fi

  yq ".development_status | to_entries[] |
    select(.key | test(\"^${epic_num}-[0-9]+-\")) |
    select(.value == \"backlog\") | .key" "$SPRINT_STATUS" | wc -l | tr -d ' '
}
