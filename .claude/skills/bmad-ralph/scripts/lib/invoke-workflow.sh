#!/bin/bash
# lib/invoke-workflow.sh
# Helper to invoke Claude Code workflows
# Phase 1: Tests multiple invocation methods to find what works

# Source logging (same directory)
LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$LIB_DIR/log.sh"

# Invocation method (will be determined in Phase 1)
# Options: stdin, skill, file, direct
INVOCATION_METHOD="${INVOCATION_METHOD:-stdin}"

invoke_workflow() {
  local agent="$1"
  local workflow="$2"
  local additional_instructions="$3"

  log_info "Invoking $agent agent to run $workflow workflow"

  case "$INVOCATION_METHOD" in
    stdin)
      # Method A: Stdin heredoc (like original Ralph)
      claude-code <<EOF
Load $agent agent
Run $workflow workflow
$additional_instructions
EOF
      ;;

    skill)
      # Method B: Skill invocation
      local skill_path="bmad:bmm:workflows:$workflow"
      claude-code --skill "$skill_path"
      ;;

    file)
      # Method C: Prompt file
      local prompt_file="/tmp/ralph-prompt-$$.txt"
      cat > "$prompt_file" <<EOF
Load $agent agent
Run $workflow workflow
$additional_instructions
EOF
      claude-code --file "$prompt_file"
      rm -f "$prompt_file"
      ;;

    direct)
      # Method D: Direct argument
      claude-code "Load $agent agent and run $workflow workflow. $additional_instructions"
      ;;

    *)
      log_error "Unknown invocation method: $INVOCATION_METHOD"
      return 1
      ;;
  esac

  local exit_code=$?

  if [ $exit_code -eq 0 ]; then
    log_success "$agent $workflow completed successfully"
  else
    log_error "$agent $workflow failed with exit code $exit_code"
  fi

  return $exit_code
}

# Test all invocation methods (for Phase 1)
test_invocation_methods() {
  log_info "Testing all Claude Code invocation methods..."

  echo ""
  echo "Testing Method A: Stdin heredoc"
  echo "Running: claude-code <<EOF ... EOF"
  INVOCATION_METHOD=stdin invoke_workflow "SM" "create-story" ""
  local stdin_result=$?

  echo ""
  echo "Testing Method B: Skill invocation"
  echo "Running: claude-code --skill bmad:bmm:workflows:create-story"
  INVOCATION_METHOD=skill invoke_workflow "SM" "create-story" ""
  local skill_result=$?

  echo ""
  echo "Testing Method C: Prompt file"
  echo "Running: claude-code --file /tmp/prompt.txt"
  INVOCATION_METHOD=file invoke_workflow "SM" "create-story" ""
  local file_result=$?

  echo ""
  echo "Testing Method D: Direct argument"
  echo "Running: claude-code \"Load SM agent...\""
  INVOCATION_METHOD=direct invoke_workflow "SM" "create-story" ""
  local direct_result=$?

  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "Test Results:"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "Method A (stdin):  $([ $stdin_result -eq 0 ] && echo '✅ PASSED' || echo '❌ FAILED')"
  echo "Method B (skill):  $([ $skill_result -eq 0 ] && echo '✅ PASSED' || echo '❌ FAILED')"
  echo "Method C (file):   $([ $file_result -eq 0 ] && echo '✅ PASSED' || echo '❌ FAILED')"
  echo "Method D (direct): $([ $direct_result -eq 0 ] && echo '✅ PASSED' || echo '❌ FAILED')"
  echo ""

  # Return success if ANY method worked
  if [ $stdin_result -eq 0 ] || [ $skill_result -eq 0 ] || [ $file_result -eq 0 ] || [ $direct_result -eq 0 ]; then
    return 0
  else
    return 1
  fi
}
