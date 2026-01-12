#!/usr/bin/env python3
"""
Logging utilities for BMAD Ralph Execute.

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
    current = Path.cwd()
    for parent in [current] + list(current.parents):
        if (parent / '.ralph').exists() or (parent / '_bmad').exists() or (parent / '.git').exists():
            log_dir = parent / 'logs'
            log_dir.mkdir(exist_ok=True)
            return log_dir

    log_dir = current / 'logs'
    log_dir.mkdir(exist_ok=True)
    return log_dir


def get_log_filename(mode: str) -> str:
    """Generate log filename with timestamp."""
    timestamp = datetime.now().strftime('%Y-%m-%d-%H%M')
    return f"ralph-{mode.lower()}-{timestamp}.log"


def rotate_logs(mode: str, log_dir: Path) -> None:
    """Remove old log files, keeping only the most recent."""
    pattern = str(log_dir / f"ralph-{mode.lower()}-*.log")
    log_files = sorted(glob.glob(pattern), reverse=True)

    for old_file in log_files[MAX_LOG_FILES_PER_MODE:]:
        try:
            os.remove(old_file)
        except OSError:
            pass


def setup_logger(mode: str = 'EXECUTE') -> RalphLogAdapter:
    """Set up logging for a Ralph execute session."""
    log_dir = get_log_directory()
    log_file = log_dir / get_log_filename(mode)

    rotate_logs(mode, log_dir)

    logger = logging.getLogger(f'ralph-{mode.lower()}')
    logger.setLevel(logging.DEBUG)
    logger.handlers = []

    file_handler = logging.FileHandler(log_file)
    file_handler.setLevel(logging.DEBUG)
    file_handler.setFormatter(logging.Formatter(LOG_FORMAT, DATE_FORMAT))

    console_handler = logging.StreamHandler()
    console_handler.setLevel(logging.INFO)
    console_handler.setFormatter(logging.Formatter('%(message)s'))

    logger.addHandler(file_handler)
    logger.addHandler(console_handler)

    adapter = RalphLogAdapter(logger, {'mode': mode})

    adapter.info(f"Ralph {mode} session started")
    adapter.info(f"Log file: {log_file}")

    return adapter


def log_step_start(logger: RalphLogAdapter, story_id: str, step_num: int, step_name: str) -> None:
    """Log the start of a workflow step."""
    # Execute skill runs steps 6-8 (3 steps total)
    step_display = step_num - 5  # Convert 6,7,8 to 1,2,3
    logger.info(f"Story {story_id}: Step {step_display}/3 - {step_name}")


def log_step_complete(logger: RalphLogAdapter, story_id: str, step_num: int, message: str = None) -> None:
    """Log successful completion of a workflow step."""
    step_display = step_num - 5  # Convert 6,7,8 to 1,2,3
    if message:
        logger.info(f"Story {story_id}: Step {step_display}/3 ✅ {message}")
    else:
        logger.info(f"Story {story_id}: Step {step_display}/3 ✅ Complete")


def log_step_error(logger: RalphLogAdapter, story_id: str, step_num: int, error: str) -> None:
    """Log an error during a workflow step."""
    step_display = step_num - 5  # Convert 6,7,8 to 1,2,3
    logger.error(f"Story {story_id}: Step {step_display}/3 ❌ {error}")


def log_story_start(logger: RalphLogAdapter, story_id: str, epic_num: int) -> None:
    """Log the start of processing a story."""
    logger.info(f"Starting Story {story_id} (Epic {epic_num})")


def log_story_complete(logger: RalphLogAdapter, story_id: str) -> None:
    """Log completion of a story."""
    logger.info(f"Story {story_id} complete → done")


def log_epic_complete(logger: RalphLogAdapter, epic_num: int) -> None:
    """Log completion of an epic."""
    logger.info(f"Epic {epic_num} complete - all stories done")


def log_retrospective_created(logger: RalphLogAdapter, epic_num: int, filepath: str) -> None:
    """Log creation of retrospective."""
    logger.info(f"Epic {epic_num} retrospective created: {filepath}")


def log_session_complete(logger: RalphLogAdapter, stories_done: int, epics_done: int, errors: int) -> None:
    """Log completion of the entire session."""
    if errors > 0:
        logger.warning(f"Session complete with errors: {stories_done} stories, {epics_done} epics, {errors} errors")
    else:
        logger.info(f"Session complete: {stories_done} stories, {epics_done} epics completed")


if __name__ == '__main__':
    logger = setup_logger('EXECUTE')

    log_story_start(logger, "1-1-login", 1)
    log_step_start(logger, "1-1-login", 6, "DEV develop-story")
    log_step_complete(logger, "1-1-login", 6, "Code implemented, tests written")
    log_step_start(logger, "1-1-login", 7, "DEV code-review")
    log_step_complete(logger, "1-1-login", 7, "Code reviewed, issues fixed")
    log_step_start(logger, "1-1-login", 8, "DEV story-done")
    log_step_complete(logger, "1-1-login", 8, "All tests passing")
    log_story_complete(logger, "1-1-login")
    log_epic_complete(logger, 1)
    log_retrospective_created(logger, 1, "retrospectives/epic-1-retrospective.md")
    log_session_complete(logger, 3, 1, 0)
