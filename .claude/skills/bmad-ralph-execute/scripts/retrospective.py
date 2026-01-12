#!/usr/bin/env python3
"""
Epic retrospective management for BMAD Ralph Execute.

Handles:
- Detecting when all stories in an epic are complete
- Triggering retrospective generation
- Preventing duplicate retrospectives
"""

import os
from pathlib import Path
from typing import List, Optional, Dict, Any

# Handle both package import and direct script execution
try:
    from .sprint_parser import Epic, Story, StoryStatus
except ImportError:
    from sprint_parser import Epic, Story, StoryStatus


def check_epic_completion(
    epics: List[Epic],
    epic_num: int,
    impl_dir: str,
) -> bool:
    """
    Check if an epic is complete and needs a retrospective.

    An epic needs a retrospective when:
    1. All stories in the epic have status 'done'
    2. Retrospective file doesn't already exist

    Args:
        epics: List of all epics
        epic_num: Epic number to check
        impl_dir: Implementation artifacts directory

    Returns:
        True if retrospective should be triggered
    """
    # Find the epic
    target_epic = None
    for epic in epics:
        if epic.num == epic_num:
            target_epic = epic
            break

    if target_epic is None:
        return False

    # Check if all stories are done
    if not target_epic.all_done:
        return False

    # Check if retrospective already exists
    retro_path = get_retrospective_path(impl_dir, epic_num)
    if retro_path.exists():
        return False

    return True


def get_retrospective_path(impl_dir: str, epic_num: int) -> Path:
    """Get path to retrospective file for an epic."""
    return Path(impl_dir) / 'retrospectives' / f'epic-{epic_num}-retrospective.md'


def ensure_retrospective_directory(impl_dir: str) -> None:
    """Ensure retrospectives directory exists."""
    retro_dir = Path(impl_dir) / 'retrospectives'
    retro_dir.mkdir(parents=True, exist_ok=True)


def get_completed_stories_for_epic(epics: List[Epic], epic_num: int) -> List[str]:
    """Get list of completed story IDs for an epic."""
    for epic in epics:
        if epic.num == epic_num:
            return [s.id for s in epic.stories if s.is_done]
    return []


def build_retrospective_context(
    epics: List[Epic],
    epic_num: int,
    impl_dir: str,
    planning_dir: str,
) -> Dict[str, Any]:
    """
    Build context for retrospective generation.

    Returns dict with:
    - epic_num: Epic number
    - stories: List of completed story IDs
    - story_files: Paths to story files
    - impl_dir: Implementation directory
    - planning_dir: Planning directory
    """
    stories = get_completed_stories_for_epic(epics, epic_num)
    story_files = [
        str(Path(impl_dir) / 'stories' / f'story-{story_id}.md')
        for story_id in stories
    ]

    return {
        'epic_num': epic_num,
        'stories': stories,
        'story_files': story_files,
        'impl_dir': impl_dir,
        'planning_dir': planning_dir,
        'output_path': str(get_retrospective_path(impl_dir, epic_num)),
    }


def get_retrospective_prompt_context(
    epics: List[Epic],
    epic_num: int,
    impl_dir: str,
    planning_dir: str,
) -> str:
    """
    Generate context string for retrospective prompt.

    This is passed to the SM agent to generate the retrospective.
    """
    context = build_retrospective_context(epics, epic_num, impl_dir, planning_dir)
    stories = context['stories']

    return f"""
**EPIC RETROSPECTIVE CONTEXT**

Epic: {epic_num}
Completed Stories: {', '.join(stories)}

**STORY FILES TO REVIEW:**
{chr(10).join(f'- {f}' for f in context['story_files'])}

**RETROSPECTIVE TEMPLATE:**

# Epic {epic_num} Retrospective

## Summary
[Brief overview of what was accomplished in this epic]

## Stories Completed
{chr(10).join(f'- {s}' for s in stories)}

## What Went Well
- [Positive patterns observed]
- [Effective practices]
- [Successful approaches]

## Lessons Learned
- [What would we do differently]
- [Unexpected challenges]
- [Knowledge gained]

## Technical Patterns
- [Reusable patterns established]
- [Architectural decisions made]
- [Code conventions followed]

## Technical Debt / Follow-ups
- [Any deferred work]
- [Areas for improvement]
- [Future considerations]

## Recommendations for Future Epics
- [Process improvements]
- [Tool suggestions]
- [Team practices]
"""


if __name__ == '__main__':
    # Example usage - imports already handled above

    # Create example epic with all done stories
    stories = [
        Story(id='1-1-login', epic_num=1, story_num=1, name='login', status=StoryStatus.DONE),
        Story(id='1-2-logout', epic_num=1, story_num=2, name='logout', status=StoryStatus.DONE),
    ]
    epics = [Epic(num=1, name='Auth', status=StoryStatus.DONE, stories=stories)]

    impl_dir = './implementation-artifacts'

    if check_epic_completion(epics, 1, impl_dir):
        print("Epic 1 is complete! Generating retrospective...")
        context = get_retrospective_prompt_context(epics, 1, impl_dir, './planning-artifacts')
        print(context)
    else:
        print("Epic 1 is not complete or retrospective already exists.")
