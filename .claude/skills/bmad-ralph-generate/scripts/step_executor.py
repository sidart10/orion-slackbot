#!/usr/bin/env python3
"""
Step executor for BMAD Ralph Generate.

This module provides the core functionality for executing workflow steps
by spawning fresh Claude Code agents via the Task tool.

NOTE: This module generates the INSTRUCTIONS for the LLM orchestrator.
The actual Task tool calls are made by the LLM reading skill.md, not by Python.
This module provides helper functions to build prompts and verify outputs.
"""

import os
from pathlib import Path
from typing import Optional, Dict, Any, Tuple
from dataclasses import dataclass
from enum import Enum

# Handle both package import and direct script execution
try:
    from .config import load_config, load_paths_config, get_story_file_path, get_atdd_checklist_path, get_context_xml_path
    from .prompt_builder import (
        build_autonomous_prompt,
        get_step_config,
        get_task_description,
        get_agent_type,
        get_expected_output,
        get_step_specific_instructions,
        should_skip_step,
    )
    from .sprint_parser import Story, StoryStatus, update_story_status
    from .error_handler import RalphError, ErrorType, create_agent_crash_error, create_output_missing_error
    from .utils import file_exists_and_valid, find_project_root
except ImportError:
    from config import load_config, load_paths_config, get_story_file_path, get_atdd_checklist_path, get_context_xml_path
    from prompt_builder import (
        build_autonomous_prompt,
        get_step_config,
        get_task_description,
        get_agent_type,
        get_expected_output,
        get_step_specific_instructions,
        should_skip_step,
    )
    from sprint_parser import Story, StoryStatus, update_story_status
    from error_handler import RalphError, ErrorType, create_agent_crash_error, create_output_missing_error
    from utils import file_exists_and_valid, find_project_root


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
    use_tea: bool = True,
) -> Dict[str, Any]:
    """
    Generate parameters for the Task tool call.

    This returns a dict that the LLM orchestrator uses to call the Task tool.

    Args:
        step_num: Step number (1-5)
        story: Story object being processed
        config: Ralph configuration
        use_tea: Whether TEA agent is enabled

    Returns:
        Dict with keys: subagent_type, description, prompt
    """
    project_root = str(find_project_root())
    planning_dir = config.get('planning_dir', './planning-artifacts')
    impl_dir = config.get('impl_dir', './implementation-artifacts')

    step_instructions = get_step_specific_instructions(
        step_num=step_num,
        story_id=story.id,
        epic_id=str(story.epic_num),
        planning_dir=planning_dir,
        use_tea=use_tea,
    )

    prompt = build_autonomous_prompt(
        step_num=step_num,
        story_id=story.id,
        epic_id=str(story.epic_num),
        planning_dir=planning_dir,
        impl_dir=impl_dir,
        project_root=project_root,
        use_tea=use_tea,
        step_specific_instructions=step_instructions,
    )

    return {
        'subagent_type': get_agent_type(step_num),
        'description': get_task_description(step_num, story.id),
        'prompt': prompt,
    }


def verify_step_output(
    step_num: int,
    story: Story,
    config: Dict[str, Any],
    paths: Dict[str, Any],
) -> Tuple[bool, Optional[str], Optional[str]]:
    """
    Verify that a step produced the expected output.

    Args:
        step_num: Step number
        story: Story object
        config: Ralph configuration
        paths: Path patterns configuration

    Returns:
        Tuple of (success, output_file_path, error_message)
    """
    expected = get_expected_output(step_num, story.id)

    if expected is None:
        # Step doesn't produce a file (e.g., validation steps)
        return True, None, None

    impl_dir = config.get('impl_dir', './implementation-artifacts')

    # Resolve the expected output path
    if step_num == 1:
        output_path = Path(get_story_file_path(config, paths, story.id))
    elif step_num == 3:
        output_path = Path(get_atdd_checklist_path(config, paths, story.id))
    elif step_num == 5:
        output_path = Path(get_context_xml_path(config, paths, story.id))
    else:
        output_path = Path(impl_dir) / 'stories' / expected

    if file_exists_and_valid(output_path, min_size=50):
        return True, str(output_path), None
    else:
        return False, None, f"Expected output not found: {output_path}"


def get_status_after_step(step_num: int, use_tea: bool = True) -> Optional[StoryStatus]:
    """
    Get the status a story should transition to after a step.

    Args:
        step_num: Completed step number
        use_tea: Whether TEA is enabled

    Returns:
        New status, or None if no transition
    """
    # Status transitions:
    # Step 1: backlog -> drafted
    # Step 2: (no change, validation only)
    # Step 3: (no change, creates ATDD checklist)
    # Step 4: (no change, validation only)
    # Step 5: drafted -> ready-for-dev

    if step_num == 1:
        return StoryStatus.DRAFTED
    elif step_num == 5:
        return StoryStatus.READY_FOR_DEV

    return None


def check_step_already_complete(
    step_num: int,
    story: Story,
    config: Dict[str, Any],
    paths: Dict[str, Any],
    use_tea: bool = True,
) -> bool:
    """
    Check if a step has already been completed (for resume logic).

    Args:
        step_num: Step to check
        story: Story object
        config: Configuration
        paths: Path patterns
        use_tea: TEA enabled

    Returns:
        True if step output already exists
    """
    # If step should be skipped anyway, consider it "complete"
    if should_skip_step(step_num, use_tea):
        return True

    expected = get_expected_output(step_num, story.id)

    if expected is None:
        # Validation steps - check if subsequent step's output exists
        # or if story is past this point
        if step_num == 2:
            # If step 3 output exists (or step 5 if no TEA), step 2 was done
            if use_tea:
                atdd_path = Path(get_atdd_checklist_path(config, paths, story.id))
                return atdd_path.exists()
            else:
                context_path = Path(get_context_xml_path(config, paths, story.id))
                return context_path.exists()
        elif step_num == 4:
            # If step 5 output exists, step 4 was done
            context_path = Path(get_context_xml_path(config, paths, story.id))
            return context_path.exists()
        return False

    # Check if output file exists
    success, _, _ = verify_step_output(step_num, story, config, paths)
    return success


def get_resume_step(
    story: Story,
    config: Dict[str, Any],
    paths: Dict[str, Any],
    use_tea: bool = True,
) -> int:
    """
    Determine which step to resume from for a story.

    Args:
        story: Story object
        config: Configuration
        paths: Path patterns
        use_tea: TEA enabled

    Returns:
        Step number to resume from (1-5)
    """
    steps = [1, 2, 3, 4, 5] if use_tea else [1, 2, 5]

    for step in steps:
        if not check_step_already_complete(step, story, config, paths, use_tea):
            return step

    # All steps complete
    return -1


def build_execution_plan(
    stories: list,
    config: Dict[str, Any],
    paths: Dict[str, Any],
    use_tea: bool = True,
) -> list:
    """
    Build an execution plan showing what steps need to run for each story.

    Args:
        stories: List of Story objects
        config: Configuration
        paths: Path patterns
        use_tea: TEA enabled

    Returns:
        List of dicts with story info and steps to execute
    """
    plan = []
    steps_template = [1, 2, 3, 4, 5] if use_tea else [1, 2, 5]

    for story in stories:
        resume_from = get_resume_step(story, config, paths, use_tea)

        if resume_from == -1:
            # Story already complete
            continue

        steps_to_run = [s for s in steps_template if s >= resume_from]

        plan.append({
            'story': story,
            'resume_from': resume_from,
            'steps': steps_to_run,
            'step_count': len(steps_to_run),
        })

    return plan


if __name__ == '__main__':
    # Example usage
    from .sprint_parser import load_sprint_status, parse_sprint_status, get_stories_for_processing

    print("Step Executor - Generate Skill")
    print("=" * 50)

    # This would normally be run by the LLM orchestrator
    print("\nExample Task tool params for Step 1:")

    example_story = Story(
        id='1-1-login',
        epic_num=1,
        story_num=1,
        name='login',
        status=StoryStatus.BACKLOG,
    )

    example_config = {
        'planning_dir': './planning-artifacts',
        'impl_dir': './implementation-artifacts',
        'use_tea_agent': True,
    }

    params = get_task_tool_params(1, example_story, example_config)
    print(f"  subagent_type: {params['subagent_type']}")
    print(f"  description: {params['description']}")
    print(f"  prompt length: {len(params['prompt'])} chars")
