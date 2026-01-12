#!/usr/bin/env python3
"""
Prompt builder for BMAD Ralph autonomous agent execution.

Builds prompts from templates for spawning agents via Task tool.
"""

from pathlib import Path
from typing import Dict, Any, Optional


# Step configuration
STEP_CONFIG = {
    1: {
        'name': 'create-story',
        'agent': 'sm',
        'workflow': '_bmad/bmm/workflows/4-implementation/create-story/workflow.yaml',
        'description': 'SM create-story',
        'output': 'story-{story_id}.md',
    },
    2: {
        'name': 'story-ready',
        'agent': 'sm',
        'workflow': '_bmad/bmm/workflows/4-implementation/story-ready/workflow.yaml',
        'description': 'SM story-ready',
        'output': None,  # No new file, validates existing
    },
    3: {
        'name': 'atdd',
        'agent': 'tea',
        'workflow': '_bmad/bmm/workflows/testarch/atdd/workflow.yaml',
        'description': 'TEA atdd',
        'output': 'atdd-checklist-{story_id}.md',
        'skip_without_tea': True,
    },
    4: {
        'name': 'test-review',
        'agent': 'tea',
        'workflow': '_bmad/bmm/workflows/testarch/test-review/workflow.yaml',
        'description': 'TEA test-review',
        'output': None,  # Validates existing tests
        'skip_without_tea': True,
    },
    5: {
        'name': 'story-context',
        'agent': 'sm',
        'workflow': '_bmad/bmm/workflows/4-implementation/story-context/workflow.yaml',
        'description': 'SM story-context',
        'output': '{story_id}.context.xml',
        'has_no_tea_variant': True,
    },
}


AUTONOMOUS_BASE_TEMPLATE = """**AUTONOMOUS MODE - NO MENU, NO PROMPTS**

You are running as part of Ralph autonomous orchestration.
DO NOT show menu. DO NOT wait for user input. DO NOT ask questions.
If information is unclear, make reasonable inference from planning docs.

1. Load config from {project_root}/_bmad/bmm/config.yaml
2. Read project-context.md if it exists (your "bible" for patterns/conventions)
3. Execute the workflow below directly - no menu selection needed

**WORKFLOW TO EXECUTE:**
Path: {project_root}/{workflow_path}

**TARGET:**
- Story ID: {story_id}
- Epic: {epic_id}
- Planning dir: {planning_dir}
- Implementation dir: {impl_dir}

**EXECUTION:**
1. Load {project_root}/_bmad/core/tasks/workflow.xml
2. Pass the workflow.yaml path to workflow.xml instructions
3. Execute ALL workflow steps to completion
4. Save outputs to: {impl_dir}/stories/

**ON COMPLETION:**
- Confirm output file(s) created
- Exit immediately (no menu, no "what next?")

**ON ERROR:**
- Log specific error message with context
- Exit with error (Ralph will catch and handle)

{step_specific_instructions}
"""


def get_step_config(step_num: int) -> Dict[str, Any]:
    """Get configuration for a specific step."""
    if step_num not in STEP_CONFIG:
        raise ValueError(f"Invalid step number: {step_num}")
    return STEP_CONFIG[step_num]


def should_skip_step(step_num: int, use_tea: bool) -> bool:
    """Check if step should be skipped based on TEA setting."""
    config = get_step_config(step_num)
    return not use_tea and config.get('skip_without_tea', False)


def get_steps_for_generate(use_tea: bool) -> list:
    """Get list of step numbers to execute for generate skill."""
    steps = [1, 2, 3, 4, 5]
    if not use_tea:
        steps = [s for s in steps if not should_skip_step(s, use_tea)]
    return steps


def build_autonomous_prompt(
    step_num: int,
    story_id: str,
    epic_id: str,
    planning_dir: str,
    impl_dir: str,
    project_root: str = '.',
    use_tea: bool = True,
    step_specific_instructions: str = '',
) -> str:
    """
    Build an autonomous prompt for a specific step.

    Args:
        step_num: Step number (1-5 for generate)
        story_id: Story identifier (e.g., "1-1-login")
        epic_id: Epic number (e.g., "1")
        planning_dir: Path to planning artifacts
        impl_dir: Path to implementation output
        project_root: Project root path
        use_tea: Whether TEA agent is enabled
        step_specific_instructions: Additional step-specific instructions

    Returns:
        Formatted autonomous prompt string
    """
    config = get_step_config(step_num)

    # Handle no-TEA variant for step 5
    workflow_path = config['workflow']

    prompt = AUTONOMOUS_BASE_TEMPLATE.format(
        project_root=project_root,
        workflow_path=workflow_path,
        story_id=story_id,
        epic_id=epic_id,
        planning_dir=planning_dir,
        impl_dir=impl_dir,
        step_specific_instructions=step_specific_instructions,
    )

    return prompt


def get_task_description(step_num: int, story_id: str) -> str:
    """Get short description for Task tool."""
    config = get_step_config(step_num)
    return f"{config['description']} for {story_id}"


def get_agent_type(step_num: int) -> str:
    """Get agent type for Task tool subagent_type parameter."""
    config = get_step_config(step_num)
    return config['agent']


def get_expected_output(step_num: int, story_id: str) -> Optional[str]:
    """Get expected output filename for a step."""
    config = get_step_config(step_num)
    output_pattern = config.get('output')

    if output_pattern is None:
        return None

    return output_pattern.format(story_id=story_id)


# Step-specific instruction templates
STEP_INSTRUCTIONS = {
    1: """**STEP-SPECIFIC: CREATE STORY**
- Read epic details from {planning_dir}/epic-{epic_id}-details.md
- Find story {story_id} requirements in epics.md
- Create comprehensive story file with all sections
- Include clear acceptance criteria
""",
    2: """**STEP-SPECIFIC: STORY READY**
- Review story-{story_id}.md for completeness
- Validate acceptance criteria are testable
- Ensure dependencies are documented
- Mark story as ready if all checks pass
""",
    3: """**STEP-SPECIFIC: ATDD**
- Read story-{story_id}.md acceptance criteria
- Create ATDD checklist with test scenarios
- Cover happy path, edge cases, error handling
- Output: atdd-checklist-{story_id}.md
""",
    4: """**STEP-SPECIFIC: TEST REVIEW**
- Review atdd-checklist-{story_id}.md
- Validate test coverage is comprehensive
- Check test scenarios are implementable
- Flag any missing edge cases
""",
    5: """**STEP-SPECIFIC: STORY CONTEXT**
- Compile all story context into XML format
- Include story details, AC, and test specs
- Reference atdd-checklist if TEA enabled, otherwise use story AC
- Output: {story_id}.context.xml for DEV agent
""",
    '5_no_tea': """**STEP-SPECIFIC: STORY CONTEXT (NO TEA)**
- Compile story context into XML format
- Include story details and acceptance criteria
- DEV will write tests from AC directly (no atdd-checklist)
- Output: {story_id}.context.xml for DEV agent
""",
}


def get_step_specific_instructions(step_num: int, story_id: str, epic_id: str, planning_dir: str, use_tea: bool = True) -> str:
    """Get step-specific instructions to append to base prompt."""
    if step_num == 5 and not use_tea:
        template = STEP_INSTRUCTIONS.get('5_no_tea', '')
    else:
        template = STEP_INSTRUCTIONS.get(step_num, '')

    return template.format(
        story_id=story_id,
        epic_id=epic_id,
        planning_dir=planning_dir,
    )


if __name__ == '__main__':
    # Example prompt generation
    prompt = build_autonomous_prompt(
        step_num=1,
        story_id='1-1-login',
        epic_id='1',
        planning_dir='./planning-artifacts',
        impl_dir='./implementation-artifacts',
        project_root='.',
        use_tea=True,
        step_specific_instructions=get_step_specific_instructions(1, '1-1-login', '1', './planning-artifacts'),
    )
    print("Example Prompt for Step 1:")
    print("=" * 60)
    print(prompt)
