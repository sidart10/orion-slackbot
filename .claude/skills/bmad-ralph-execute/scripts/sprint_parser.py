#!/usr/bin/env python3
"""
Sprint status parser for BMAD Ralph Execute.

Handles:
- Parsing sprint-status.yaml
- Finding stories ready for development
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
    id: str
    epic_num: int
    story_num: int
    name: str
    status: StoryStatus

    @property
    def full_id(self) -> str:
        return f"{self.epic_num}-{self.story_num}-{self.name}"

    @property
    def is_ready_for_dev(self) -> bool:
        """Check if story is ready for execution."""
        return self.status == StoryStatus.READY_FOR_DEV

    @property
    def is_executable(self) -> bool:
        """Check if story can be processed by execute skill."""
        return self.status in [StoryStatus.READY_FOR_DEV, StoryStatus.IN_PROGRESS, StoryStatus.REVIEW]

    @property
    def is_done(self) -> bool:
        """Check if story is complete."""
        return self.status == StoryStatus.DONE


@dataclass
class Epic:
    """Represents an epic with its stories."""
    num: int
    name: str
    status: StoryStatus
    stories: List[Story]

    @property
    def ready_for_dev_count(self) -> int:
        return sum(1 for s in self.stories if s.status == StoryStatus.READY_FOR_DEV)

    @property
    def done_count(self) -> int:
        return sum(1 for s in self.stories if s.status == StoryStatus.DONE)

    @property
    def all_done(self) -> bool:
        """Check if all stories in epic are done."""
        return all(s.is_done for s in self.stories)


def parse_story_id(story_key: str) -> Optional[Tuple[int, int, str]]:
    """Parse a story key like '1-1-login-endpoint' into (epic_num, story_num, name)."""
    match = re.match(r'^(\d+)-(\d+)-(.+)$', story_key)
    if match:
        return int(match.group(1)), int(match.group(2)), match.group(3)
    return None


def parse_epic_key(epic_key: str) -> Optional[int]:
    """Parse an epic key like 'epic-1' into epic number."""
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
    """Parse sprint status data into Epic and Story objects."""
    dev_status = data.get('development_status', {})

    epics_dict: Dict[int, Epic] = {}
    stories_dict: Dict[str, Story] = {}

    for key, status_str in dev_status.items():
        try:
            status = StoryStatus(status_str)
        except ValueError:
            continue

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

            if epic_num not in epics_dict:
                epics_dict[epic_num] = Epic(
                    num=epic_num,
                    name=f"Epic {epic_num}",
                    status=StoryStatus.BACKLOG,
                    stories=[]
                )

            epics_dict[epic_num].stories.append(story)

    for epic in epics_dict.values():
        epic.stories.sort(key=lambda s: (s.story_num, s.name))

    epics = sorted(epics_dict.values(), key=lambda e: e.num)

    return epics, stories_dict


def get_stories_ready_for_dev(epics: List[Epic]) -> List[Story]:
    """Get stories that are ready for development."""
    stories = []
    for epic in epics:
        for story in epic.stories:
            if story.is_ready_for_dev:
                stories.append(story)
    return stories


def get_executable_stories(epics: List[Epic], num_stories: int = None) -> List[Story]:
    """
    Get stories that can be executed (ready-for-dev, in-progress, or review).

    Args:
        epics: List of epics
        num_stories: Number of stories to process (None = all)

    Returns:
        List of executable stories, ordered by epic then story number
    """
    stories = []
    for epic in epics:
        for story in epic.stories:
            if story.is_executable:
                stories.append(story)

    if num_stories:
        return stories[:num_stories]
    return stories


def update_story_status(filepath: str, story_id: str, new_status: StoryStatus) -> None:
    """Update a story's status in sprint-status.yaml."""
    data = load_sprint_status(filepath)

    if 'development_status' not in data:
        data['development_status'] = {}

    data['development_status'][story_id] = new_status.value
    save_sprint_status(filepath, data)


def check_epic_completion(epics: List[Epic], epic_num: int) -> bool:
    """Check if all stories in an epic are done."""
    for epic in epics:
        if epic.num == epic_num:
            return epic.all_done
    return False


def get_ready_stories_summary(epics: List[Epic]) -> str:
    """Generate a summary of stories ready for development."""
    lines = []
    idx = 1

    for epic in epics:
        for story in epic.stories:
            if story.is_ready_for_dev:
                lines.append(f"   {idx}. {story.id} (Epic {story.epic_num}) - ready-for-dev")
                idx += 1

    if not lines:
        return "   No stories in 'ready-for-dev' status."

    return "\n".join(lines)


if __name__ == '__main__':
    import sys

    if len(sys.argv) < 2:
        print("Usage: sprint_parser.py <path-to-sprint-status.yaml>")
        sys.exit(1)

    filepath = sys.argv[1]
    data = load_sprint_status(filepath)
    epics, stories = parse_sprint_status(data)

    print("Stories Ready for Development:")
    print(get_ready_stories_summary(epics))
    print(f"\nTotal executable: {len(get_executable_stories(epics))}")
