#!/usr/bin/env python3
"""
Sprint status parser for BMAD Ralph.

Handles:
- Parsing sprint-status.yaml
- Extracting epics and stories
- Status management
- YAML round-trip preservation
"""

import os
import re
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple
from dataclasses import dataclass
from enum import Enum

try:
    from ruamel.yaml import YAML
    yaml = YAML()
    yaml.preserve_quotes = True
except ImportError:
    import yaml as pyyaml
    yaml = None


class StoryStatus(Enum):
    """Valid story status values."""
    BACKLOG = 'backlog'
    DRAFTED = 'drafted'
    READY_FOR_DEV = 'ready-for-dev'
    IN_PROGRESS = 'in-progress'
    REVIEW = 'review'
    DONE = 'done'


@dataclass
class Story:
    """Represents a single story."""
    id: str           # e.g., "1-1-login"
    epic_num: int     # e.g., 1
    story_num: int    # e.g., 1
    name: str         # e.g., "login"
    status: StoryStatus

    @property
    def full_id(self) -> str:
        """Full story ID including name."""
        return f"{self.epic_num}-{self.story_num}-{self.name}"

    @property
    def is_processable(self) -> bool:
        """Check if story can be processed by generate skill."""
        return self.status == StoryStatus.BACKLOG


@dataclass
class Epic:
    """Represents an epic with its stories."""
    num: int
    name: str
    status: StoryStatus
    stories: List[Story]

    @property
    def backlog_count(self) -> int:
        return sum(1 for s in self.stories if s.status == StoryStatus.BACKLOG)

    @property
    def done_count(self) -> int:
        return sum(1 for s in self.stories if s.status == StoryStatus.DONE)

    @property
    def ready_for_dev_count(self) -> int:
        return sum(1 for s in self.stories if s.status == StoryStatus.READY_FOR_DEV)

    @property
    def in_progress_count(self) -> int:
        return sum(1 for s in self.stories if s.status == StoryStatus.IN_PROGRESS)


def parse_story_id(story_key: str) -> Optional[Tuple[int, int, str]]:
    """
    Parse a story key like '1-1-login-endpoint' into (epic_num, story_num, name).

    Returns None if not a valid story key.
    """
    # Pattern: epic_num-story_num-name (name can have hyphens)
    match = re.match(r'^(\d+)-(\d+)-(.+)$', story_key)
    if match:
        return int(match.group(1)), int(match.group(2)), match.group(3)
    return None


def parse_epic_key(epic_key: str) -> Optional[int]:
    """
    Parse an epic key like 'epic-1' into epic number.

    Returns None if not a valid epic key.
    """
    match = re.match(r'^epic-(\d+)$', epic_key)
    if match:
        return int(match.group(1))
    return None


def load_sprint_status(filepath: str) -> Dict[str, Any]:
    """Load sprint-status.yaml file."""
    with open(filepath, 'r') as f:
        if yaml:
            return yaml.load(f)
        else:
            return pyyaml.safe_load(f)


def save_sprint_status(filepath: str, data: Dict[str, Any]) -> None:
    """Save sprint-status.yaml file with round-trip preservation."""
    with open(filepath, 'w') as f:
        if yaml:
            yaml.dump(data, f)
        else:
            pyyaml.dump(data, f, default_flow_style=False)


def parse_sprint_status(data: Dict[str, Any]) -> Tuple[List[Epic], Dict[str, Story]]:
    """
    Parse sprint status data into Epic and Story objects.

    Returns:
        Tuple of (list of epics, dict mapping story_id to Story)
    """
    dev_status = data.get('development_status', {})

    # First pass: collect all epics and stories
    epics_dict: Dict[int, Epic] = {}
    stories_dict: Dict[str, Story] = {}

    for key, status_str in dev_status.items():
        try:
            status = StoryStatus(status_str)
        except ValueError:
            continue  # Skip invalid status values

        # Check if it's an epic
        epic_num = parse_epic_key(key)
        if epic_num is not None:
            if epic_num not in epics_dict:
                epics_dict[epic_num] = Epic(
                    num=epic_num,
                    name=f"Epic {epic_num}",
                    status=status,
                    stories=[]
                )
            else:
                epics_dict[epic_num].status = status
            continue

        # Check if it's a story
        story_parts = parse_story_id(key)
        if story_parts is not None:
            epic_num, story_num, name = story_parts
            story = Story(
                id=key,
                epic_num=epic_num,
                story_num=story_num,
                name=name,
                status=status
            )
            stories_dict[key] = story

            # Ensure epic exists
            if epic_num not in epics_dict:
                epics_dict[epic_num] = Epic(
                    num=epic_num,
                    name=f"Epic {epic_num}",
                    status=StoryStatus.BACKLOG,
                    stories=[]
                )

            epics_dict[epic_num].stories.append(story)

    # Sort stories within each epic
    for epic in epics_dict.values():
        epic.stories.sort(key=lambda s: (s.story_num, s.name))

    # Sort epics by number
    epics = sorted(epics_dict.values(), key=lambda e: e.num)

    return epics, stories_dict


def get_stories_for_processing(epics: List[Epic], num_epics: int = None) -> List[Story]:
    """
    Get stories that need processing (backlog status).

    Args:
        epics: List of epics
        num_epics: Number of epics to process (None = all)

    Returns:
        List of stories in backlog status, ordered by epic then story number
    """
    stories = []

    epics_to_process = epics[:num_epics] if num_epics else epics

    for epic in epics_to_process:
        for story in epic.stories:
            if story.is_processable:
                stories.append(story)

    return stories


def update_story_status(filepath: str, story_id: str, new_status: StoryStatus) -> None:
    """Update a story's status in sprint-status.yaml."""
    data = load_sprint_status(filepath)

    if 'development_status' not in data:
        data['development_status'] = {}

    data['development_status'][story_id] = new_status.value
    save_sprint_status(filepath, data)


def get_status_summary(epics: List[Epic]) -> str:
    """Generate a summary of epic and story statuses."""
    lines = []

    for epic in epics:
        status_parts = []
        if epic.backlog_count > 0:
            status_parts.append(f"{epic.backlog_count} backlog")
        if epic.ready_for_dev_count > 0:
            status_parts.append(f"{epic.ready_for_dev_count} ready")
        if epic.in_progress_count > 0:
            status_parts.append(f"{epic.in_progress_count} in-progress")
        if epic.done_count > 0:
            status_parts.append(f"{epic.done_count} done")

        status_str = ", ".join(status_parts) if status_parts else "empty"
        lines.append(f"   {epic.num}. {epic.name} ({len(epic.stories)} stories: {status_str})")

    return "\n".join(lines)


if __name__ == '__main__':
    import sys

    if len(sys.argv) < 2:
        print("Usage: sprint_parser.py <path-to-sprint-status.yaml>")
        sys.exit(1)

    filepath = sys.argv[1]
    data = load_sprint_status(filepath)
    epics, stories = parse_sprint_status(data)

    print("Parsed Sprint Status:")
    print(get_status_summary(epics))
    print(f"\nTotal stories: {len(stories)}")
    print(f"Processable (backlog): {len(get_stories_for_processing(epics))}")
