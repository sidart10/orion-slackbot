"""
BMAD Ralph Generate - Scripts Package

This package provides the core functionality for the Ralph Generate skill,
which prepares stories for development (Steps 1-5).
"""

from .config import (
    load_config,
    save_config,
    config_exists,
    validate_planning_dir,
    create_impl_directories,
    find_project_root,
    get_config_path,
)

from .sprint_parser import (
    Story,
    Epic,
    StoryStatus,
    load_sprint_status,
    save_sprint_status,
    parse_sprint_status,
    get_stories_for_processing,
    update_story_status,
)

from .prompt_builder import (
    build_autonomous_prompt,
    get_step_config,
    get_task_description,
    get_agent_type,
    get_steps_for_generate,
    should_skip_step,
)

from .error_handler import (
    RalphError,
    ErrorType,
    format_error_message,
    create_agent_crash_error,
    create_output_missing_error,
    create_validation_error,
    create_config_error,
)

from .progress import (
    show_execution_header,
    show_epic_header,
    show_story_start,
    show_step_complete,
    show_step_skipped,
    show_step_error,
    show_story_complete,
    show_execution_plan,
    show_completion_summary,
)

from .logger import (
    setup_logger,
    log_step_start,
    log_step_complete,
    log_step_skipped,
    log_step_error,
    log_epic_start,
    log_epic_complete,
    log_session_complete,
)

from .utils import (
    setup_signal_handlers,
    sprint_status_lock,
    release_sprint_lock,
    resolve_path,
    ensure_directory,
    file_exists_and_valid,
)

from .step_executor import (
    StepResult,
    ExecutionResult,
    get_task_tool_params,
    verify_step_output,
    get_status_after_step,
    check_step_already_complete,
    get_resume_step,
    build_execution_plan,
)

__all__ = [
    # Config
    'load_config', 'save_config', 'config_exists', 'validate_planning_dir',
    'create_impl_directories', 'find_project_root', 'get_config_path',
    # Sprint Parser
    'Story', 'Epic', 'StoryStatus', 'load_sprint_status', 'save_sprint_status',
    'parse_sprint_status', 'get_stories_for_processing', 'update_story_status',
    # Prompt Builder
    'build_autonomous_prompt', 'get_step_config', 'get_task_description',
    'get_agent_type', 'get_steps_for_generate', 'should_skip_step',
    # Error Handler
    'RalphError', 'ErrorType', 'format_error_message', 'create_agent_crash_error',
    'create_output_missing_error', 'create_validation_error', 'create_config_error',
    # Progress
    'show_execution_header', 'show_epic_header', 'show_story_start',
    'show_step_complete', 'show_step_skipped', 'show_step_error',
    'show_story_complete', 'show_execution_plan', 'show_completion_summary',
    # Logger
    'setup_logger', 'log_step_start', 'log_step_complete', 'log_step_skipped',
    'log_step_error', 'log_epic_start', 'log_epic_complete', 'log_session_complete',
    # Utils
    'setup_signal_handlers', 'sprint_status_lock', 'release_sprint_lock',
    'resolve_path', 'ensure_directory', 'file_exists_and_valid',
    # Step Executor
    'StepResult', 'ExecutionResult', 'get_task_tool_params', 'verify_step_output',
    'get_status_after_step', 'check_step_already_complete', 'get_resume_step',
    'build_execution_plan',
]
