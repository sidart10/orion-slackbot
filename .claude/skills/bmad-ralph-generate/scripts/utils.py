#!/usr/bin/env python3
"""
Utility functions for BMAD Ralph.

Provides:
- File locking for sprint-status.yaml
- Path utilities
- Signal handling for graceful shutdown
"""

import os
import sys
import signal
import atexit
from pathlib import Path
from typing import Optional, Callable
from contextlib import contextmanager

try:
    from filelock import FileLock, Timeout
    HAS_FILELOCK = True
except ImportError:
    HAS_FILELOCK = False


# Global state for cleanup
_cleanup_callbacks = []
_lock_file: Optional['FileLock'] = None


def register_cleanup(callback: Callable) -> None:
    """Register a cleanup callback for graceful shutdown."""
    _cleanup_callbacks.append(callback)


def _run_cleanup() -> None:
    """Run all registered cleanup callbacks."""
    for callback in _cleanup_callbacks:
        try:
            callback()
        except Exception:
            pass  # Ignore errors during cleanup


def _signal_handler(signum, frame) -> None:
    """Handle interrupt signals gracefully."""
    print("\n\n⚠️  Interrupted! Cleaning up...")
    _run_cleanup()
    release_sprint_lock()
    print("✓ Cleanup complete. Re-run the skill to resume from last completed step.")
    sys.exit(1)


def setup_signal_handlers() -> None:
    """Set up signal handlers for graceful shutdown."""
    signal.signal(signal.SIGINT, _signal_handler)
    signal.signal(signal.SIGTERM, _signal_handler)
    atexit.register(_run_cleanup)


def get_lock_file_path(sprint_status_path: str) -> Path:
    """Get path to lock file for sprint-status.yaml."""
    return Path(sprint_status_path).with_suffix('.yaml.lock')


@contextmanager
def sprint_status_lock(sprint_status_path: str, timeout: int = 30):
    """
    Context manager for locking sprint-status.yaml.

    Usage:
        with sprint_status_lock(path):
            # modify sprint-status.yaml
    """
    global _lock_file

    if not HAS_FILELOCK:
        # No locking available, proceed without lock
        yield
        return

    lock_path = get_lock_file_path(sprint_status_path)
    _lock_file = FileLock(str(lock_path), timeout=timeout)

    try:
        _lock_file.acquire()
        yield
    except Timeout:
        raise RuntimeError(f"Could not acquire lock on {sprint_status_path} within {timeout}s. Another Ralph instance may be running.")
    finally:
        if _lock_file.is_locked:
            _lock_file.release()
        _lock_file = None


def release_sprint_lock() -> None:
    """Release sprint status lock if held."""
    global _lock_file
    if _lock_file and HAS_FILELOCK and _lock_file.is_locked:
        _lock_file.release()
        _lock_file = None


def find_project_root() -> Path:
    """Find project root by looking for marker files."""
    current = Path.cwd()

    for parent in [current] + list(current.parents):
        # Check for Ralph config
        if (parent / '.ralph').exists():
            return parent
        # Check for BMAD config
        if (parent / '_bmad').exists():
            return parent
        # Check for git repo
        if (parent / '.git').exists():
            return parent

    return current


def resolve_path(path: str, base: Optional[Path] = None) -> Path:
    """Resolve a path relative to project root or given base."""
    if base is None:
        base = find_project_root()

    path_obj = Path(path)

    if path_obj.is_absolute():
        return path_obj

    # Handle special prefixes
    path_str = str(path)
    if path_str.startswith('./'):
        return base / path_str[2:]
    elif path_str.startswith('{project-root}/'):
        return base / path_str[15:]

    return base / path


def ensure_directory(path: Path) -> None:
    """Ensure a directory exists, creating it if necessary."""
    path.mkdir(parents=True, exist_ok=True)


def file_exists_and_valid(path: Path, min_size: int = 1) -> bool:
    """Check if a file exists and has minimum content."""
    if not path.exists():
        return False
    if not path.is_file():
        return False
    if path.stat().st_size < min_size:
        return False
    return True


def get_file_age_seconds(path: Path) -> Optional[float]:
    """Get age of file in seconds, or None if doesn't exist."""
    if not path.exists():
        return None
    import time
    return time.time() - path.stat().st_mtime


def is_file_newer_than(file1: Path, file2: Path) -> bool:
    """Check if file1 is newer than file2."""
    if not file1.exists() or not file2.exists():
        return False
    return file1.stat().st_mtime > file2.stat().st_mtime


def safe_read_file(path: Path) -> Optional[str]:
    """Safely read a file, returning None on error."""
    try:
        return path.read_text()
    except Exception:
        return None


def safe_write_file(path: Path, content: str) -> bool:
    """Safely write to a file, returning success status."""
    try:
        ensure_directory(path.parent)
        path.write_text(content)
        return True
    except Exception:
        return False


if __name__ == '__main__':
    # Test utilities
    print(f"Project root: {find_project_root()}")
    print(f"Has filelock: {HAS_FILELOCK}")

    test_path = resolve_path('./planning-artifacts')
    print(f"Resolved './planning-artifacts': {test_path}")
