#!/bin/bash
# bmad-ralph-story.sh
# BMAD Ralph - Story-at-a-Time Loop
# Processes ONE story through YOUR complete 8-step lifecycle

set -e  # Exit on error

# Configuration
SPRINT_STATUS="${SPRINT_STATUS:-docs/sprint-status.yaml}"
STORY_FILES_PATH="${STORY_FILES_PATH:-docs/stories}"
INVOCATION_METHOD="${INVOCATION_METHOD:-stdin}"

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Source helpers
source "$SCRIPT_DIR/lib/log.sh"
source "$SCRIPT_DIR/lib/check-status.sh"
source "$SCRIPT_DIR/lib/invoke-workflow.sh"
source "$SCRIPT_DIR/lib/detect-completion.sh"

# Initialize logging
log_info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
log_info "BMAD Ralph - Story Loop Starting"
log_info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
log_info "Sprint Status: $SPRINT_STATUS"
log_info "Story Files: $STORY_FILES_PATH"
log_info "Invocation Method: $INVOCATION_METHOD"
log_info ""

# Find next backlog story
log_info "Finding next backlog story..."
NEXT_STORY=$(get_next_backlog_story)

if [ -z "$NEXT_STORY" ]; then
  log_info "No stories in backlog!"
  log_info "All stories complete or no sprint-status.yaml found."
  exit 0
fi

log_success "Found story: $NEXT_STORY"
echo ""

# ============================================================================
# YOUR 8-STEP WORKFLOW
# ============================================================================

# Step 1/8: SM create-story
log_step "1/8" "SM creating story..."
invoke_workflow "SM" "create-story" ""
if [ $? -ne 0 ]; then
  log_error "Step 1 failed: create-story"
  exit 1
fi

# Verify story file was created
if ! story_file_exists "$NEXT_STORY"; then
  log_error "Story file was not created: $STORY_FILES_PATH/story-${NEXT_STORY}.md"
  exit 1
fi

log_success "Story file created"
echo ""

# Step 2/8: SM story-review (ALWAYS NEEDED per your requirement)
log_step "2/8" "SM reviewing drafted story..."
invoke_workflow "SM" "story-review" "Review the drafted story file for story $NEXT_STORY. Validate acceptance criteria, tasks, and dev notes."
if [ $? -ne 0 ]; then
  log_error "Step 2 failed: story-review"
  exit 1
fi

log_success "Story review complete"
echo ""

# Step 3/8: TEA atdd (generate failing tests BEFORE dev)
log_step "3/8" "TEA generating ATDD tests (RED phase)..."
invoke_workflow "TEA" "atdd" "Generate failing acceptance tests for story $NEXT_STORY before implementation."
if [ $? -ne 0 ]; then
  log_error "Step 3 failed: atdd"
  exit 1
fi

# Verify ATDD checklist was created
if ! atdd_checklist_exists "$NEXT_STORY"; then
  log_error "ATDD checklist was not created"
  exit 1
fi

log_success "ATDD tests generated (RED phase)"
echo ""

# Step 4/8: TEA test-review (quality audit)
log_step "4/8" "TEA reviewing test quality..."
invoke_workflow "TEA" "test-review" "Audit the ATDD tests just generated for story $NEXT_STORY."
if [ $? -ne 0 ]; then
  log_error "Step 4 failed: test-review"
  exit 1
fi

log_success "Test quality review complete"
echo ""

# Step 5/8: SM story-context (generate context XML)
log_step "5/8" "SM generating story context..."
invoke_workflow "SM" "story-context" "Generate context XML and mark story $NEXT_STORY ready-for-dev."
if [ $? -ne 0 ]; then
  log_error "Step 5 failed: story-context"
  exit 1
fi

# Verify context XML was created
if ! story_context_exists "$NEXT_STORY"; then
  log_error "Story context XML was not created"
  exit 1
fi

log_success "Story context generated"
echo ""

# Step 6/8: DEV develop-story (implement to make tests GREEN)
log_step "6/8" "DEV implementing story (GREEN phase)..."
invoke_workflow "DEV" "develop-story" "Implement code to make ATDD tests pass for story $NEXT_STORY."
if [ $? -ne 0 ]; then
  log_error "Step 6 failed: develop-story"
  exit 1
fi

log_success "Story implementation complete"
echo ""

# Step 7/8: DEV code-review (systematic validation)
log_step "7/8" "DEV performing code review..."
invoke_workflow "DEV" "code-review" "Systematic validation of ACs and tasks for story $NEXT_STORY."
if [ $? -ne 0 ]; then
  log_error "Step 7 failed: code-review"
  exit 1
fi

log_success "Code review complete"
echo ""

# Step 8/8: Check review outcome and mark done
log_step "8/8" "Checking review outcome..."

REVIEW_STATUS=$(check_review_approved "$NEXT_STORY")
REVIEW_EXIT=$?

log_info "Review status: $REVIEW_STATUS"

if [ $REVIEW_EXIT -eq 0 ]; then
  log_info "Code review APPROVED! Marking story done..."

  invoke_workflow "DEV" "story-done" "Mark story $NEXT_STORY as done."
  if [ $? -ne 0 ]; then
    log_error "Step 8 failed: story-done"
    exit 1
  fi

  # Verify story status changed to done
  FINAL_STATUS=$(get_story_status "$NEXT_STORY")
  if [ "$FINAL_STATUS" = "done" ]; then
    echo ""
    log_success "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    log_success "✅ Story $NEXT_STORY COMPLETE!"
    log_success "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    exit 0
  else
    log_error "Story status did not change to done. Current status: $FINAL_STATUS"
    exit 1
  fi

else
  echo ""
  log_error "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  log_error "⚠️  Code review found issues: $REVIEW_STATUS"
  log_error "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  log_info "Story needs revision. Review the story file:"
  log_info "  $STORY_FILES_PATH/story-${NEXT_STORY}.md"
  log_info ""
  log_info "To fix: Re-run step 6 (develop-story) to address review items,"
  log_info "then run this script again."
  exit 1
fi
