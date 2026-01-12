#!/usr/bin/env python3
"""
Error handling for BMAD Ralph.

Provides:
- Error categorization
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
    STATUS_UPDATE_FAILED = 'STATUS_UPDATE_FAILED'
    TIMEOUT = 'TIMEOUT'
    CONFIG_ERROR = 'CONFIG_ERROR'
    VALIDATION_ERROR = 'VALIDATION_ERROR'
    EXTERNAL_FAILURE = 'EXTERNAL_FAILURE'


RECOVERY_INSTRUCTIONS = {
    ErrorType.AGENT_CRASH: """
Recovery:
1. Check the error message for specific issues
2. Review the agent's workflow for problems
3. Fix any blocking issues in planning docs
4. Re-run the skill - Ralph will resume from this step
""",
    ErrorType.OUTPUT_MISSING: """
Recovery:
1. The expected output file was not created
2. Check if the agent completed successfully
3. Verify the output directory exists and is writable
4. Re-run the skill to retry this step
""",
    ErrorType.INVALID_OUTPUT: """
Recovery:
1. The output file exists but is malformed or incomplete
2. Delete the corrupted file if necessary
3. Check planning docs for missing information
4. Re-run the skill to regenerate the output
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
3. Check if external services are slow/unresponsive
4. Re-run the skill to retry
""",
    ErrorType.CONFIG_ERROR: """
Recovery:
1. Configuration is invalid or missing
2. Check .ralph/config.yaml exists and is valid YAML
3. Verify planning_dir and impl_dir paths are correct
4. Re-run the skill to reconfigure
""",
    ErrorType.VALIDATION_ERROR: """
Recovery:
1. Input validation failed
2. Check that required files exist in planning directory
3. Verify files have sufficient content
4. Re-run after fixing validation issues
""",
    ErrorType.EXTERNAL_FAILURE: """
Recovery:
1. An external service or API failed
2. Ralph will retry automatically with backoff
3. If retries exhausted, check service status
4. Re-run the skill when service is available
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
    1: 'create-story',
    2: 'story-ready',
    3: 'atdd',
    4: 'test-review',
    5: 'story-context',
    6: 'develop-story',
    7: 'code-review',
    8: 'story-done',
}

STEP_AGENTS = {
    1: 'SM',
    2: 'SM',
    3: 'TEA',
    4: 'TEA',
    5: 'SM',
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


def create_agent_crash_error(
    message: str,
    epic_id: str,
    story_id: str,
    step_num: int,
    details: Optional[str] = None
) -> RalphError:
    """Create an agent crash error."""
    return RalphError(
        error_type=ErrorType.AGENT_CRASH,
        message=message,
        epic_id=epic_id,
        story_id=story_id,
        step_num=step_num,
        agent=STEP_AGENTS.get(step_num),
        details=details,
    )


def create_output_missing_error(
    expected_file: str,
    epic_id: str,
    story_id: str,
    step_num: int,
) -> RalphError:
    """Create an output missing error."""
    return RalphError(
        error_type=ErrorType.OUTPUT_MISSING,
        message=f"Expected output file not created: {expected_file}",
        epic_id=epic_id,
        story_id=story_id,
        step_num=step_num,
        agent=STEP_AGENTS.get(step_num),
    )


def create_validation_error(message: str, details: Optional[str] = None) -> RalphError:
    """Create a validation error."""
    return RalphError(
        error_type=ErrorType.VALIDATION_ERROR,
        message=message,
        details=details,
    )


def create_config_error(message: str) -> RalphError:
    """Create a configuration error."""
    return RalphError(
        error_type=ErrorType.CONFIG_ERROR,
        message=message,
    )


if __name__ == '__main__':
    # Example error formatting
    error = create_agent_crash_error(
        message="Agent returned error during workflow execution",
        epic_id="1",
        story_id="1-1-login",
        step_num=3,
        details="TEA agent failed to parse acceptance criteria",
    )
    print(format_error_message(error))
