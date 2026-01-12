#!/usr/bin/env python3
"""
Error handling for BMAD Ralph Execute.

Provides:
- Error categorization for execution phase
- User-friendly error messages
- Recovery instructions
"""

from enum import Enum
from typing import Optional
from dataclasses import dataclass


class ErrorType(Enum):
    """Error categories for Ralph execution."""
    AGENT_CRASH = 'AGENT_CRASH'
    OUTPUT_MISSING = 'OUTPUT_MISSING'
    INVALID_OUTPUT = 'INVALID_OUTPUT'
    TEST_FAILURE = 'TEST_FAILURE'
    BUILD_FAILURE = 'BUILD_FAILURE'
    STATUS_UPDATE_FAILED = 'STATUS_UPDATE_FAILED'
    TIMEOUT = 'TIMEOUT'
    CONFIG_ERROR = 'CONFIG_ERROR'
    CONTEXT_MISSING = 'CONTEXT_MISSING'


RECOVERY_INSTRUCTIONS = {
    ErrorType.AGENT_CRASH: """
Recovery:
1. Check the error message for specific issues
2. Review the agent's workflow for problems
3. Fix any blocking issues in code or tests
4. Re-run the skill - Ralph will resume from this step
""",
    ErrorType.OUTPUT_MISSING: """
Recovery:
1. The expected output file was not created
2. Check if the agent completed successfully
3. Verify the output directory exists and is writable
4. Re-run the skill to retry this step
""",
    ErrorType.TEST_FAILURE: """
Recovery:
1. One or more tests are failing
2. Review the test output for specific failures
3. Fix the failing tests or implementation
4. Re-run the skill to continue
""",
    ErrorType.BUILD_FAILURE: """
Recovery:
1. The build/compilation failed
2. Check build output for specific errors
3. Fix syntax errors, type errors, or missing dependencies
4. Re-run the skill after fixes
""",
    ErrorType.STATUS_UPDATE_FAILED: """
Recovery:
1. Could not update sprint-status.yaml
2. Check file permissions
3. Ensure no other process has the file locked
4. Verify YAML syntax is valid
5. Re-run the skill after fixing permissions
""",
    ErrorType.TIMEOUT: """
Recovery:
1. The step took longer than the configured timeout
2. Increase timeout in .ralph/config.yaml
3. Check if build/tests are slow or hanging
4. Re-run the skill to retry
""",
    ErrorType.CONFIG_ERROR: """
Recovery:
1. Configuration is invalid or missing
2. Run /bmad-ralph-generate first to create config
3. Verify .ralph/config.yaml exists and is valid
4. Re-run the skill after fixing
""",
    ErrorType.CONTEXT_MISSING: """
Recovery:
1. Story context.xml file is missing
2. Run /bmad-ralph-generate to create story context
3. Verify story is in 'ready-for-dev' status
4. Re-run after generating context
""",
}


@dataclass
class RalphError:
    """Structured error for Ralph execution."""
    error_type: ErrorType
    message: str
    epic_id: Optional[str] = None
    story_id: Optional[str] = None
    step_num: Optional[int] = None
    agent: Optional[str] = None
    details: Optional[str] = None

    def get_recovery_instructions(self) -> str:
        """Get recovery instructions for this error type."""
        return RECOVERY_INSTRUCTIONS.get(self.error_type, "Re-run the skill to retry.")


STEP_NAMES = {
    6: 'develop-story',
    7: 'code-review',
    8: 'story-done',
}

STEP_AGENTS = {
    6: 'DEV',
    7: 'DEV',
    8: 'DEV',
}


def format_error_message(error: RalphError) -> str:
    """Format error for display to user."""
    step_name = STEP_NAMES.get(error.step_num, 'unknown') if error.step_num else 'N/A'
    agent_name = STEP_AGENTS.get(error.step_num, 'N/A') if error.step_num else error.agent or 'N/A'

    output = f"""
╔════════════════════════════════════════════════════════════════════╗
║  ❌ Ralph encountered an error and stopped execution                ║
╚════════════════════════════════════════════════════════════════════╝

Error Type: {error.error_type.value}
Epic: {error.epic_id or 'N/A'}
Story: {error.story_id or 'N/A'}
Step: {error.step_num or 'N/A'} ({step_name})
Agent: {agent_name}

Message: {error.message}
"""

    if error.details:
        output += f"\nDetails: {error.details}\n"

    output += error.get_recovery_instructions()
    output += "\nTo resume: Fix the issue above, then run the skill again."
    output += "\nRalph will resume from this exact step."

    return output


def create_test_failure_error(
    story_id: str,
    epic_id: str,
    step_num: int,
    failing_tests: str,
) -> RalphError:
    """Create a test failure error."""
    return RalphError(
        error_type=ErrorType.TEST_FAILURE,
        message="Tests are failing",
        epic_id=epic_id,
        story_id=story_id,
        step_num=step_num,
        agent=STEP_AGENTS.get(step_num),
        details=failing_tests,
    )


def create_build_failure_error(
    story_id: str,
    epic_id: str,
    step_num: int,
    build_output: str,
) -> RalphError:
    """Create a build failure error."""
    return RalphError(
        error_type=ErrorType.BUILD_FAILURE,
        message="Build failed",
        epic_id=epic_id,
        story_id=story_id,
        step_num=step_num,
        agent=STEP_AGENTS.get(step_num),
        details=build_output,
    )


def create_context_missing_error(story_id: str, epic_id: str) -> RalphError:
    """Create a context missing error."""
    return RalphError(
        error_type=ErrorType.CONTEXT_MISSING,
        message=f"Story context file not found: {story_id}.context.xml",
        epic_id=epic_id,
        story_id=story_id,
        step_num=6,
    )


def create_config_error(message: str) -> RalphError:
    """Create a configuration error."""
    return RalphError(
        error_type=ErrorType.CONFIG_ERROR,
        message=message,
    )


if __name__ == '__main__':
    # Example error formatting
    error = create_test_failure_error(
        story_id="1-1-login",
        epic_id="1",
        step_num=6,
        failing_tests="test_login_success: AssertionError\ntest_login_invalid: timeout",
    )
    print(format_error_message(error))
