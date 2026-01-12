#!/usr/bin/env python3
"""
Step executor for BMAD Ralph Execute.

This module provides the core functionality for executing development steps
by spawning fresh Claude Code agents via the Task tool.

NOTE: This module generates the INSTRUCTIONS for the LLM orchestrator.
The actual Task tool calls are made by the LLM reading skill.md, not by Python.
This module provides helper functions to build prompts and verify outputs.
"""

import os
from pathlib import Path
from typing import Optional, Dict, Any, Tuple, List
from dataclasses import dataclass
from enum import Enum

# Handle both package import and direct script execution
try:
    from .config import load_config, load_paths_config, get_context_xml_path, get_retrospective_path
    from .prompt_builder import (
        build_autonomous_prompt,
        build_retrospective_prompt,
        get_step_config,
        get_task_description,
        get_agent_type,
        get_step_specific_instructions,
        get_status_transition,
    )
    from .sprint_parser import Story, Epic, StoryStatus, update_story_status
    from .error_handler import RalphError, ErrorType, create_context_missing_error
    from .utils import file_exists_and_valid, find_project_root, load_context_xml
except ImportError:
    from config import load_config, load_paths_config, get_context_xml_path, get_retrospective_path
    from prompt_builder import (
        build_autonomous_prompt,
        build_retrospective_prompt,
        get_step_config,
        get_task_description,
        get_agent_type,
        get_step_specific_instructions,
        get_status_transition,
    )
    from sprint_parser import Story, Epic, StoryStatus, update_story_status
    from error_handler import RalphError, ErrorType, create_context_missing_error
    from utils import file_exists_and_valid, find_project_root, load_context_xml


class StepResult(Enum):
    """Result of executing a step."""
    SUCCESS = 'success'
    SKIPPED = 'skipped'
    ERROR = 'error'


@dataclass
class ExecutionResult:
    """Result of a step execution."""
    step_num: int
    result: StepResult
    output_file: Optional[str] = None
    error: Optional[RalphError] = None
    message: Optional[str] = None


def get_task_tool_params(
    step_num: int,
    story: Story,
    config: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Generate parameters for the Task tool call.

    This returns a dict that the LLM orchestrator uses to call the Task tool.

    Args:
        step_num: Step number (6-8)
        story: Story object being processed
        config: Ralph configuration

    Returns:
        Dict with keys: subagent_type, description, prompt
    """
    project_root = str(find_project_root())
    impl_dir = config.get('impl_dir', './implementation-artifacts')

    step_instructions = get_step_specific_instructions(step_num, story.id)

    prompt = build_autonomous_prompt(
        step_num=step_num,
        story_id=story.id,
        epic_id=str(story.epic_num),
        impl_dir=impl_dir,
        project_root=project_root,
        step_specific_instructions=step_instructions,
    )

    return {
        'subagent_type': get_agent_type(step_num),
        'description': get_task_description(step_num, story.id),
        'prompt': prompt,
    }


def get_retrospective_task_params(
    epic: Epic,
    config: Dict[str, Any],
    completed_stories: List[str],
) -> Dict[str, Any]:
    """
    Generate parameters for spawning retrospective agent.

    Args:
        epic: Epic that was completed
        config: Ralph configuration
        completed_stories: List of completed story IDs

    Returns:
        Dict with keys: subagent_type, description, prompt
    """
    project_root = str(find_project_root())
    impl_dir = config.get('impl_dir', './implementation-artifacts')
    planning_dir = config.get('planning_dir', './planning-artifacts')

    prompt = build_retrospective_prompt(
        epic_id=str(epic.num),
        impl_dir=impl_dir,
        planning_dir=planning_dir,
        project_root=project_root,
        completed_stories=completed_stories,
    )

    return {
        'subagent_type': 'sm',
        'description': f'SM retrospective for Epic {epic.num}',
        'prompt': prompt,
    }


def verify_story_ready(
    story: Story,
    config: Dict[str, Any],
) -> Tuple[bool, Optional[str]]:
    """
    Verify that a story has all required files for execution.

    Args:
        story: Story object
        config: Ralph configuration

    Returns:
        Tuple of (is_ready, error_message)
    """
    impl_dir = config.get('impl_dir', './implementation-artifacts')

    # Check for context.xml
    context_path = Path(impl_dir) / 'stories' / f'{story.id}.context.xml'
    if not context_path.exists():
        return False, f"Missing context file: {context_path}"

    # Check for story file
    story_path = Path(impl_dir) / 'stories' / f'story-{story.id}.md'
    if not story_path.exists():
        return False, f"Missing story file: {story_path}"

    return True, None


def get_status_after_step(step_num: int) -> Optional[StoryStatus]:
    """
    Get the status a story should transition to after a step.

    Args:
        step_num: Completed step number

    Returns:
        New status, or None if no transition
    """
    # Status transitions for execute:
    # Step 6: ready-for-dev -> in-progress
    # Step 7: in-progress -> review
    # Step 8: review -> done

    status_map = {
        6: StoryStatus.IN_PROGRESS,
        7: StoryStatus.REVIEW,
        8: StoryStatus.DONE,
    }

    return status_map.get(step_num)


def get_resume_step(story: Story) -> int:
    """
    Determine which step to resume from for a story.

    Args:
        story: Story object

    Returns:
        Step number to resume from (6-8), or -1 if done
    """
    status_to_step = {
        StoryStatus.READY_FOR_DEV: 6,
        StoryStatus.IN_PROGRESS: 6,  # Might have partial impl, restart step 6
        StoryStatus.REVIEW: 8,       # Skip to final validation
        StoryStatus.DONE: -1,        # Already complete
    }

    return status_to_step.get(story.status, 6)


def check_epic_needs_retrospective(
    epics: List[Epic],
    epic_num: int,
    impl_dir: str,
) -> bool:
    """
    Check if an epic needs a retrospective.

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
    retro_path = Path(impl_dir) / 'retrospectives' / f'epic-{epic_num}-retrospective.md'
    if retro_path.exists():
        return False

    return True


def build_execution_plan(
    stories: List[Story],
    config: Dict[str, Any],
) -> List[Dict[str, Any]]:
    """
    Build an execution plan showing what steps need to run for each story.

    Args:
        stories: List of Story objects
        config: Configuration

    Returns:
        List of dicts with story info and steps to execute
    """
    plan = []

    for story in stories:
        resume_from = get_resume_step(story)

        if resume_from == -1:
            # Story already complete
            continue

        # Ready for dev means ready to check
        is_ready, error = verify_story_ready(story, config)
        if not is_ready:
            plan.append({
                'story': story,
                'error': error,
                'steps': [],
                'step_count': 0,
            })
            continue

        steps_to_run = [s for s in [6, 7, 8] if s >= resume_from]

        plan.append({
            'story': story,
            'resume_from': resume_from,
            'steps': steps_to_run,
            'step_count': len(steps_to_run),
        })

    return plan


if __name__ == '__main__':
    # Example usage
    print("Step Executor - Execute Skill")
    print("=" * 50)

    example_story = Story(
        id='1-1-login',
        epic_num=1,
        story_num=1,
        name='login',
        status=StoryStatus.READY_FOR_DEV,
    )

    example_config = {
        'planning_dir': './planning-artifacts',
        'impl_dir': './implementation-artifacts',
        'use_tea_agent': True,
    }

    print("\nExample Task tool params for Step 6:")
    params = get_task_tool_params(6, example_story, example_config)
    print(f"  subagent_type: {params['subagent_type']}")
    print(f"  description: {params['description']}")
    print(f"  prompt length: {len(params['prompt'])} chars")

    print("\nResume step for story in ready-for-dev:", get_resume_step(example_story))
