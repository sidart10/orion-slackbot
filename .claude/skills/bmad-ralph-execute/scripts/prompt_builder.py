#!/usr/bin/env python3
"""
Prompt builder for BMAD Ralph Execute.

Builds prompts for spawning DEV agents via Task tool.
"""

from pathlib import Path
from typing import Dict, Any, Optional


# Step configuration for execute skill
STEP_CONFIG = {
    6: {
        'name': 'develop-story',
        'agent': 'dev',
        'workflow': '_bmad/bmm/workflows/4-implementation/dev-story/workflow.yaml',
        'description': 'DEV develop-story',
        'status_before': 'ready-for-dev',
        'status_after': 'in-progress',
    },
    7: {
        'name': 'code-review',
        'agent': 'dev',
        'workflow': '_bmad/bmm/workflows/4-implementation/code-review/workflow.yaml',
        'description': 'DEV code-review',
        'status_before': 'in-progress',
        'status_after': 'review',
    },
    8: {
        'name': 'story-done',
        'agent': 'dev',
        'workflow': '_bmad/bmm/workflows/4-implementation/story-done/workflow.yaml',
        'description': 'DEV story-done',
        'status_before': 'review',
        'status_after': 'done',
    },
    'retrospective': {
        'name': 'retrospective',
        'agent': 'sm',
        'workflow': '_bmad/bmm/workflows/4-implementation/retrospective/workflow.yaml',
        'description': 'SM retrospective',
    },
}


AUTONOMOUS_BASE_TEMPLATE = """**AUTONOMOUS MODE - NO MENU, NO PROMPTS**

You are running as part of Ralph autonomous orchestration.
DO NOT show menu. DO NOT wait for user input. DO NOT ask questions.
If information is unclear, make reasonable inference from context files.

1. Load config from {project_root}/_bmad/bmm/config.yaml
2. Read project-context.md if it exists (your "bible" for patterns/conventions)
3. Execute the workflow below directly - no menu selection needed

**WORKFLOW TO EXECUTE:**
Path: {project_root}/{workflow_path}

**TARGET:**
- Story ID: {story_id}
- Epic: {epic_id}
- Implementation dir: {impl_dir}

**STORY CONTEXT:**
Load context from: {impl_dir}/stories/{story_id}.context.xml
This contains everything you need: story details, AC, test specs, architecture patterns.

**EXECUTION:**
1. Load {project_root}/_bmad/core/tasks/workflow.xml
2. Pass the workflow.yaml path to workflow.xml instructions
3. Execute ALL workflow steps to completion
4. Save outputs as specified by workflow

**ON COMPLETION:**
- Confirm all tasks complete
- Exit immediately (no menu, no "what next?")

**ON ERROR:**
- Log specific error message with context
- Exit with error (Ralph will catch and handle)

{step_specific_instructions}
"""


def get_step_config(step_num) -> Dict[str, Any]:
    """Get configuration for a specific step."""
    if step_num not in STEP_CONFIG:
        raise ValueError(f"Invalid step number: {step_num}")
    return STEP_CONFIG[step_num]


def get_steps_for_execute() -> list:
    """Get list of step numbers to execute for execute skill."""
    return [6, 7, 8]


def build_autonomous_prompt(
    step_num: int,
    story_id: str,
    epic_id: str,
    impl_dir: str,
    project_root: str = '.',
    step_specific_instructions: str = '',
) -> str:
    """
    Build an autonomous prompt for a specific execution step.

    Args:
        step_num: Step number (6-8 for execute)
        story_id: Story identifier
        epic_id: Epic number
        impl_dir: Path to implementation output
        project_root: Project root path
        step_specific_instructions: Additional step-specific instructions

    Returns:
        Formatted autonomous prompt string
    """
    config = get_step_config(step_num)

    prompt = AUTONOMOUS_BASE_TEMPLATE.format(
        project_root=project_root,
        workflow_path=config['workflow'],
        story_id=story_id,
        epic_id=epic_id,
        impl_dir=impl_dir,
        step_specific_instructions=step_specific_instructions,
    )

    return prompt


def build_retrospective_prompt(
    epic_id: str,
    impl_dir: str,
    planning_dir: str,
    project_root: str = '.',
    completed_stories: list = None,
) -> str:
    """Build autonomous prompt for epic retrospective."""
    config = get_step_config('retrospective')
    stories_list = ", ".join(completed_stories) if completed_stories else "all stories"

    prompt = f"""**AUTONOMOUS MODE - NO MENU, NO PROMPTS**

You are running as part of Ralph autonomous orchestration.
DO NOT show menu. DO NOT wait for user input. DO NOT ask questions.

**WORKFLOW TO EXECUTE:**
Path: {project_root}/{config['workflow']}

**TARGET:**
- Epic: {epic_id}
- Completed Stories: {stories_list}
- Implementation dir: {impl_dir}
- Planning dir: {planning_dir}

**RETROSPECTIVE SCOPE:**
1. Review all completed stories in Epic {epic_id}
2. Analyze what went well
3. Identify lessons learned
4. Document patterns for future epics
5. Note any technical debt or follow-up items

**OUTPUT:**
Create: {impl_dir}/retrospectives/epic-{epic_id}-retrospective.md

**EXECUTION:**
1. Load {project_root}/_bmad/core/tasks/workflow.xml
2. Execute retrospective workflow
3. Save retrospective document

**ON COMPLETION:**
- Confirm retrospective created
- Exit immediately
"""

    return prompt


def get_task_description(step_num, story_id: str) -> str:
    """Get short description for Task tool."""
    config = get_step_config(step_num)
    return f"{config['description']} for {story_id}"


def get_agent_type(step_num) -> str:
    """Get agent type for Task tool subagent_type parameter."""
    config = get_step_config(step_num)
    return config['agent']


def get_status_transition(step_num: int) -> tuple:
    """Get (before_status, after_status) for a step."""
    config = get_step_config(step_num)
    return config.get('status_before'), config.get('status_after')


# Step-specific instruction templates
STEP_INSTRUCTIONS = {
    6: """**STEP 6: DEVELOP STORY**

Implement the story according to context.xml specifications.

**IMPLEMENTATION REQUIREMENTS:**
1. Read {story_id}.context.xml for complete requirements
2. Follow architecture patterns specified
3. Implement all acceptance criteria
4. Write tests (use ATDD checklist if available)
5. Ensure code follows project conventions

**TEST REQUIREMENTS:**
- Write tests for each acceptance criterion
- Include unit tests and integration tests as appropriate
- All tests must pass before completing

**CODE QUALITY:**
- Follow existing code style
- Add appropriate error handling
- Include necessary documentation
""",
    7: """**STEP 7: CODE REVIEW**

Review and improve the implementation.

**REVIEW CHECKLIST:**
1. Code correctness - does it meet all AC?
2. Test coverage - are all scenarios tested?
3. Code quality - clean, readable, maintainable?
4. Error handling - are edge cases covered?
5. Security - any vulnerabilities?
6. Performance - any obvious issues?

**FIX ANY ISSUES FOUND:**
- Address all critical issues
- Note minor improvements for future
- Re-run tests after fixes

**OUTPUT:**
- All issues resolved
- Tests still passing
- Code ready for final validation
""",
    8: """**STEP 8: STORY DONE**

Final validation and completion.

**VALIDATION CHECKLIST:**
1. ☐ All acceptance criteria met
2. ☐ All tests passing
3. ☐ Code review complete
4. ☐ No blocking issues remain
5. ☐ Documentation updated (if needed)

**IF ALL CHECKS PASS:**
- Mark story as done
- Story is complete!

**IF CHECKS FAIL:**
- Document what's missing
- Exit with error for investigation
""",
}


def get_step_specific_instructions(step_num: int, story_id: str) -> str:
    """Get step-specific instructions to append to base prompt."""
    template = STEP_INSTRUCTIONS.get(step_num, '')
    return template.format(story_id=story_id)


if __name__ == '__main__':
    # Example prompt generation
    prompt = build_autonomous_prompt(
        step_num=6,
        story_id='1-1-login',
        epic_id='1',
        impl_dir='./implementation-artifacts',
        project_root='.',
        step_specific_instructions=get_step_specific_instructions(6, '1-1-login'),
    )
    print("Example Prompt for Step 6:")
    print("=" * 60)
    print(prompt)
