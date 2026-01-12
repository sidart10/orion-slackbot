#!/usr/bin/env python3
"""
Progress display utilities for BMAD Ralph Execute.

Provides real-time progress feedback during story execution.
"""

from typing import Optional, List
from dataclasses import dataclass
from enum import Enum


class StepState(Enum):
    """State of a workflow step."""
    PENDING = 'pending'
    IN_PROGRESS = 'in_progress'
    COMPLETE = 'complete'
    SKIPPED = 'skipped'
    ERROR = 'error'


# Step display info for execute
STEP_DISPLAY = {
    6: {'name': 'DEV develop-story', 'icon': '💻'},
    7: {'name': 'DEV code-review', 'icon': '🔎'},
    8: {'name': 'DEV story-done', 'icon': '✅'},
}


def get_state_icon(state: StepState) -> str:
    """Get icon for step state."""
    icons = {
        StepState.PENDING: '⏳',
        StepState.IN_PROGRESS: '🔄',
        StepState.COMPLETE: '✅',
        StepState.SKIPPED: '⏭️',
        StepState.ERROR: '❌',
    }
    return icons.get(state, '?')


def show_execution_header() -> str:
    """Show execution header."""
    return """
╔════════════════════════════════════════════════════════════════════╗
║  🚀 BMAD Ralph Execute - Development Workflow                       ║
╚════════════════════════════════════════════════════════════════════╝
"""


def show_no_stories_ready() -> str:
    """Show message when no stories are ready."""
    return """
ℹ️  No stories in 'ready-for-dev' status.

Run /bmad-ralph-generate first to prepare stories.
"""


def show_stories_list(stories: list) -> str:
    """Show list of stories ready for development."""
    lines = ["📋 Stories Ready for Development:"]
    for idx, story in enumerate(stories, 1):
        lines.append(f"   {idx}. {story.id} (Epic {story.epic_num}) - ready-for-dev")
    return "\n".join(lines)


def show_execution_plan(
    story_count: int,
    story_ids: List[str],
) -> str:
    """Show execution plan before starting."""
    story_list = ", ".join(story_ids[:3])
    if len(story_ids) > 3:
        story_list += f" + {len(story_ids) - 3} more"

    return f"""
═══════════════════════════════════════════════════════════════════════

📊 Execution Plan:
   • Stories: {story_count} ({story_list})
   • Steps per story: 3

   Proceed? (y/n):
"""


def show_story_start(story_id: str) -> str:
    """Show that a story is starting."""
    return f"\n🔄 Executing Story {story_id}..."


def show_step_start(step_num: int) -> str:
    """Show that a step is starting."""
    step_info = STEP_DISPLAY.get(step_num, {'name': f'Step {step_num}'})
    return f"   ├── 🔄 [Step {step_num}/8: {step_info['name']}]"


def show_step_complete(message: str = "Complete") -> str:
    """Show that a step completed successfully."""
    return f"   │   └── ✅ {message}"


def show_step_error(error_message: str) -> str:
    """Show that a step encountered an error."""
    return f"   │   └── ❌ Error: {error_message}"


def show_story_complete(story_id: str) -> str:
    """Show that a story is complete."""
    return f"   └── ✅ Story {story_id} → done"


def show_epic_complete(epic_num: int) -> str:
    """Show that an epic is complete."""
    return f"\n🎉 Epic {epic_num} Complete! Generating retrospective..."


def show_retrospective_created(filepath: str) -> str:
    """Show that retrospective was created."""
    return f"   └── ✅ Created: {filepath}"


def show_completion_summary(
    stories_implemented: int,
    total_stories: int,
    epics_completed: List[int],
) -> str:
    """Show completion summary."""
    epic_summary = ""
    if epics_completed:
        epic_list = ", ".join(f"Epic {e}" for e in epics_completed)
        epic_summary = f"\n   • Epics completed: {epic_list} (with retrospectives)"

    return f"""
═══════════════════════════════════════════════════════════════════════

✅ Ralph Execute Complete!

Summary:
   • Stories implemented: {stories_implemented}/{total_stories}{epic_summary}
   • All processed stories now 'done'

Great work! 🚀
"""


def show_partial_completion(
    stories_done: int,
    stories_remaining: int,
    error_story: str,
) -> str:
    """Show partial completion when error occurs."""
    return f"""
═══════════════════════════════════════════════════════════════════════

⚠️  Ralph Execute Stopped

Progress:
   • Stories completed: {stories_done}
   • Stories remaining: {stories_remaining}
   • Stopped at: {error_story}

Fix the error above and re-run to continue.
"""


if __name__ == '__main__':
    # Example progress display
    print(show_execution_header())
    print(show_story_start("1-1-login-endpoint"))
    print(show_step_start(6))
    print(show_step_complete("Code implemented, tests written"))
    print(show_step_start(7))
    print(show_step_complete("Code reviewed, 3 issues fixed"))
    print(show_step_start(8))
    print(show_step_complete("All tests passing, story complete"))
    print(show_story_complete("1-1-login-endpoint"))
    print(show_epic_complete(1))
    print(show_retrospective_created("retrospectives/epic-1-retrospective.md"))
    print(show_completion_summary(3, 3, [1]))
