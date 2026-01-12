#!/usr/bin/env python3
"""
Progress display utilities for BMAD Ralph.

Provides real-time progress feedback during workflow execution.
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


@dataclass
class StepProgress:
    """Progress for a single step."""
    step_num: int
    name: str
    state: StepState
    output_file: Optional[str] = None
    error_message: Optional[str] = None


@dataclass
class StoryProgress:
    """Progress for a story across all steps."""
    story_id: str
    epic_id: str
    steps: List[StepProgress]
    current_step: int = 0


# Step display info
STEP_DISPLAY = {
    1: {'name': 'SM create-story', 'icon': '📝'},
    2: {'name': 'SM story-ready', 'icon': '✓'},
    3: {'name': 'TEA atdd', 'icon': '🧪'},
    4: {'name': 'TEA test-review', 'icon': '🔍'},
    5: {'name': 'SM story-context', 'icon': '📋'},
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


def format_step_progress(step: StepProgress, total_steps: int) -> str:
    """Format a single step's progress."""
    state_icon = get_state_icon(step.state)
    step_info = STEP_DISPLAY.get(step.step_num, {'name': f'Step {step.step_num}', 'icon': '•'})

    line = f"   ├── {state_icon} [Step {step.step_num}/{total_steps}: {step_info['name']}]"

    if step.state == StepState.COMPLETE and step.output_file:
        line += f"\n   │   └── Created: {step.output_file}"
    elif step.state == StepState.ERROR and step.error_message:
        line += f"\n   │   └── Error: {step.error_message}"
    elif step.state == StepState.SKIPPED:
        line += " (skipped)"
    elif step.state == StepState.IN_PROGRESS:
        line += " ..."

    return line


def format_story_progress(progress: StoryProgress, use_tea: bool = True) -> str:
    """Format progress for a complete story."""
    total_steps = 5 if use_tea else 3
    lines = [f"🔄 Story {progress.story_id}:"]

    for step in progress.steps:
        lines.append(format_step_progress(step, total_steps))

    return "\n".join(lines)


def show_epic_header(epic_num: int, epic_name: str) -> str:
    """Show header for starting an epic."""
    return f"\n🔄 Processing Epic {epic_num}: {epic_name}..."


def show_story_start(story_id: str, step_num: int, total_steps: int, step_name: str) -> str:
    """Show that a story step is starting."""
    return f"   ├── 🔄 Story {story_id} [Step {step_num}/{total_steps}: {step_name}]"


def show_step_complete(output_file: Optional[str] = None, message: Optional[str] = None) -> str:
    """Show that a step completed successfully."""
    if output_file:
        return f"   │   └── ✅ Created: {output_file}"
    elif message:
        return f"   │   └── ✅ {message}"
    else:
        return f"   │   └── ✅ Complete"


def show_step_skipped(reason: str = "TEA disabled") -> str:
    """Show that a step was skipped."""
    return f"   │   └── ⏭️ Skipped ({reason})"


def show_step_error(error_message: str) -> str:
    """Show that a step encountered an error."""
    return f"   │   └── ❌ Error: {error_message}"


def show_story_complete(story_id: str, new_status: str) -> str:
    """Show that a story is complete."""
    return f"   └── ✅ Story {story_id} → {new_status}"


def show_execution_header(mode: str = "Generate") -> str:
    """Show execution header."""
    return f"""
╔════════════════════════════════════════════════════════════════════╗
║  🚀 BMAD Ralph {mode} - {'Story Preparation' if mode == 'Generate' else 'Development'} Workflow                ║
╚════════════════════════════════════════════════════════════════════╝
"""


def show_execution_plan(
    num_epics: int,
    epic_names: List[str],
    total_stories: int,
    skipped_stories: int,
    steps_per_story: int,
) -> str:
    """Show execution plan before starting."""
    epic_list = ", ".join(epic_names[:3])
    if len(epic_names) > 3:
        epic_list += f" + {len(epic_names) - 3} more"

    return f"""
═══════════════════════════════════════════════════════════════════════

📊 Execution Plan:
   • Epics: {num_epics} ({epic_list})
   • Stories: {total_stories} total{f' (skipping {skipped_stories} already done)' if skipped_stories else ''}
   • Steps per story: {steps_per_story}

   Proceed? (y/n):
"""


def show_completion_summary(
    mode: str,
    epics_processed: int,
    stories_processed: int,
    stories_skipped: int,
    final_status: str,
) -> str:
    """Show completion summary."""
    return f"""
═══════════════════════════════════════════════════════════════════════

✅ Ralph {mode} Complete!

Summary:
   • Epics processed: {epics_processed}
   • Stories processed: {stories_processed}
   • Stories skipped: {stories_skipped}
   • Final status: {final_status}

{'Next: Run /bmad-ralph-execute to implement these stories' if mode == 'Generate' else 'All stories implemented!'}
"""


if __name__ == '__main__':
    # Example progress display
    print(show_execution_header("Generate"))

    print(show_epic_header(1, "User Authentication"))
    print(show_story_start("1-1-login", 1, 5, "SM create-story"))
    print(show_step_complete(output_file="stories/story-1-1-login.md"))
    print(show_story_start("1-1-login", 2, 5, "SM story-ready"))
    print(show_step_complete(message="Story validated and reviewed"))
    print(show_story_complete("1-1-login", "ready-for-dev"))

    print(show_completion_summary(
        mode="Generate",
        epics_processed=1,
        stories_processed=3,
        stories_skipped=1,
        final_status="All stories now 'ready-for-dev'",
    ))
