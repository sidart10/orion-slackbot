#!/bin/bash
# lib/log.sh
# Timestamp logging helper for BMAD Ralph

LOG_FILE="${LOG_FILE:-logs/ralph-$(date +%Y-%m-%d-%H%M%S).log}"

log() {
  local level="$1"
  shift
  local message="$*"
  local timestamp=$(date '+%Y-%m-%d %H:%M:%S')

  echo "[$timestamp] [$level] $message" | tee -a "$LOG_FILE"
}

log_info() {
  log "INFO" "$@"
}

log_success() {
  log "SUCCESS" "$@"
}

log_error() {
  log "ERROR" "$@"
}

log_step() {
  local step="$1"
  shift
  log "STEP" "$step: $*"
}
