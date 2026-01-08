#!/bin/bash
# lib/detect-completion.sh
# Helper to detect workflow completion and review outcomes

STORY_FILES_PATH="${STORY_FILES_PATH:-docs/stories}"

# Check if code review approved the story
check_review_approved() {
  local story_id="$1"
  local story_file="$STORY_FILES_PATH/story-${story_id}.md"

  if [ ! -f "$story_file" ]; then
    echo "ERROR: Story file not found: $story_file" >&2
    return 2
  fi

  # Parse code review section for outcome
  local review_outcome=$(grep -A 10 "## Senior Developer Review" "$story_file" | grep "Outcome:" | head -1)

  if [ -z "$review_outcome" ]; then
    echo "PENDING"
    return 1
  fi

  if echo "$review_outcome" | grep -qi "approve"; then
    echo "APPROVED"
    return 0
  elif echo "$review_outcome" | grep -qi "changes"; then
    echo "CHANGES_REQUESTED"
    return 1
  elif echo "$review_outcome" | grep -qi "blocked"; then
    echo "BLOCKED"
    return 1
  else
    echo "UNKNOWN"
    return 1
  fi
}

# Check if story file exists
story_file_exists() {
  local story_id="$1"
  local story_file="$STORY_FILES_PATH/story-${story_id}.md"

  [ -f "$story_file" ]
}

# Check if ATDD checklist exists
atdd_checklist_exists() {
  local story_id="$1"
  local atdd_file="$STORY_FILES_PATH/atdd-checklist-${story_id}.md"

  [ -f "$atdd_file" ]
}

# Check if story context XML exists
story_context_exists() {
  local story_id="$1"
  local context_file="$STORY_FILES_PATH/${story_id}.context.xml"

  [ -f "$context_file" ]
}
