#!/usr/bin/env python3
"""
Logging utilities for BMAD Ralph.

Provides:
- Timestamped logging
- Log file rotation
- Mode-specific log files
"""

import os
import logging
from datetime import datetime
from pathlib import Path
from typing import Optional
import glob


# Log configuration
MAX_LOG_FILES_PER_MODE = 10
LOG_FORMAT = '%(asctime)s %(levelname)-5s [%(mode)s] %(message)s'
DATE_FORMAT = '%Y-%m-%d %H:%M:%S'


class RalphLogAdapter(logging.LoggerAdapter):
    """Logger adapter that adds mode to all log messages."""

    def process(self, msg, kwargs):
        kwargs['extra'] = kwargs.get('extra', {})
        kwargs['extra']['mode'] = self.extra.get('mode', 'RALPH')
        return msg, kwargs


def get_log_directory() -> Path:
    """Get the logs directory, creating it if needed."""
    # Try to find project root
    current = Path.cwd()
    for parent in [current] + list(current.parents):
        if (parent / '.ralph').exists() or (parent / '_bmad').exists() or (parent / '.git').exists():
            log_dir = parent / 'logs'
            log_dir.mkdir(exist_ok=True)
            return log_dir

    # Fallback to current directory
    log_dir = current / 'logs'
    log_dir.mkdir(exist_ok=True)
    return log_dir


def get_log_filename(mode: str) -> str:
    """Generate log filename with timestamp."""
    timestamp = datetime.now().strftime('%Y-%m-%d-%H%M')
    return f"ralph-{mode.lower()}-{timestamp}.log"


def rotate_logs(mode: str, log_dir: Path) -> None:
    """Remove old log files, keeping only the most recent MAX_LOG_FILES_PER_MODE."""
    pattern = str(log_dir / f"ralph-{mode.lower()}-*.log")
    log_files = sorted(glob.glob(pattern), reverse=True)

    # Remove files beyond the limit
    for old_file in log_files[MAX_LOG_FILES_PER_MODE:]:
        try:
            os.remove(old_file)
        except OSError:
            pass  # Ignore errors removing old logs


def setup_logger(mode: str = 'GENERATE') -> RalphLogAdapter:
    """
    Set up logging for a Ralph session.

    Args:
        mode: Either 'GENERATE' or 'EXECUTE'

    Returns:
        Configured logger adapter
    """
    log_dir = get_log_directory()
    log_file = log_dir / get_log_filename(mode)

    # Rotate old logs first
    rotate_logs(mode, log_dir)

    # Create logger
    logger = logging.getLogger(f'ralph-{mode.lower()}')
    logger.setLevel(logging.DEBUG)

    # Remove any existing handlers
    logger.handlers = []

    # File handler
    file_handler = logging.FileHandler(log_file)
    file_handler.setLevel(logging.DEBUG)
    file_handler.setFormatter(logging.Formatter(LOG_FORMAT, DATE_FORMAT))

    # Console handler (less verbose)
    console_handler = logging.StreamHandler()
    console_handler.setLevel(logging.INFO)
    console_handler.setFormatter(logging.Formatter('%(message)s'))

    logger.addHandler(file_handler)
    logger.addHandler(console_handler)

    # Create adapter with mode
    adapter = RalphLogAdapter(logger, {'mode': mode})

    adapter.info(f"Ralph {mode} session started")
    adapter.info(f"Log file: {log_file}")

    return adapter


def log_step_start(logger: RalphLogAdapter, epic_id: str, story_id: str, step_num: int, step_name: str) -> None:
    """Log the start of a workflow step."""
    logger.info(f"Story {story_id}: Step {step_num}/5 ({step_name})")


def log_step_complete(logger: RalphLogAdapter, story_id: str, step_num: int, output_file: Optional[str] = None) -> None:
    """Log successful completion of a workflow step."""
    if output_file:
        logger.info(f"Story {story_id}: Step {step_num}/5 ✅ Complete → {output_file}")
    else:
        logger.info(f"Story {story_id}: Step {step_num}/5 ✅ Complete")


def log_step_skipped(logger: RalphLogAdapter, story_id: str, step_num: int, reason: str) -> None:
    """Log a skipped step."""
    logger.info(f"Story {story_id}: Step {step_num}/5 ⏭️ Skipped ({reason})")


def log_step_error(logger: RalphLogAdapter, story_id: str, step_num: int, error: str) -> None:
    """Log an error during a workflow step."""
    logger.error(f"Story {story_id}: Step {step_num}/5 ❌ {error}")


def log_epic_start(logger: RalphLogAdapter, epic_num: int, epic_name: str, story_count: int) -> None:
    """Log the start of processing an epic."""
    logger.info(f"Starting Epic {epic_num}: {epic_name} ({story_count} stories)")


def log_epic_complete(logger: RalphLogAdapter, epic_num: int, stories_done: int, total_stories: int) -> None:
    """Log completion of an epic."""
    logger.info(f"Epic {epic_num} complete: {stories_done}/{total_stories} stories processed")


def log_session_complete(logger: RalphLogAdapter, total_epics: int, total_stories: int, total_errors: int) -> None:
    """Log completion of the entire session."""
    if total_errors > 0:
        logger.warning(f"Session complete with errors: {total_epics} epics, {total_stories} stories, {total_errors} errors")
    else:
        logger.info(f"Session complete: {total_epics} epics, {total_stories} stories, no errors")


if __name__ == '__main__':
    # Test logging
    logger = setup_logger('GENERATE')

    log_epic_start(logger, 1, "User Authentication", 4)
    log_step_start(logger, "1", "1-1-login", 1, "SM create-story")
    log_step_complete(logger, "1-1-login", 1, "stories/story-1-1-login.md")
    log_step_start(logger, "1", "1-1-login", 2, "SM story-ready")
    log_step_complete(logger, "1-1-login", 2)
    log_step_start(logger, "1", "1-1-login", 3, "TEA atdd")
    log_step_skipped(logger, "1-1-login", 3, "TEA disabled")
    log_epic_complete(logger, 1, 4, 4)
    log_session_complete(logger, 1, 4, 0)
