"""
BMAD Ralph Execute - Scripts Package

This package provides the core functionality for the Ralph Execute skill,
which implements prepared stories (Steps 6-8).
"""

from .config import (
    load_config,
    config_exists,
    validate_story_ready_for_execution,
    find_project_root,
    get_config_path,
    get_context_xml_path,
    get_retrospective_path,
    ensure_retrospective_directory,
)

from .sprint_parser import (
    Story,
    Epic,
    StoryStatus,
    load_sprint_status,
    save_sprint_status,
    parse_sprint_status,
    get_stories_ready_for_dev,
    get_executable_stories,
    update_story_status,
    check_epic_completion,
)

from .prompt_builder import (
    build_autonomous_prompt,
    build_retrospective_prompt,
    get_step_config,
    get_task_description,
    get_agent_type,
    get_steps_for_execute,
    get_status_transition,
)

from .retrospective import (
    check_epic_completion as check_epic_needs_retro,
    get_retrospective_path as get_retro_path,
    ensure_retrospective_directory as ensure_retro_dir,
    get_completed_stories_for_epic,
    build_retrospective_context,
    get_retrospective_prompt_context,
)

from .error_handler import (
    RalphError,
    ErrorType,
    format_error_message,
    create_test_failure_error,
    create_build_failure_error,
    create_context_missing_error,
    create_config_error,
)

from .progress import (
    show_execution_header,
    show_no_stories_ready,
    show_stories_list,
    show_execution_plan,
    show_story_start,
    show_step_start,
    show_step_complete,
    show_step_error,
    show_story_complete,
    show_epic_complete,
    show_retrospective_created,
    show_completion_summary,
    show_partial_completion,
)

from .logger import (
    setup_logger,
    log_step_start,
    log_step_complete,
    log_step_error,
    log_story_start,
    log_story_complete,
    log_epic_complete,
    log_retrospective_created,
    log_session_complete,
)

from .utils import (
    setup_signal_handlers,
    sprint_status_lock,
    release_sprint_lock,
    resolve_path,
    ensure_directory,
    file_exists_and_valid,
    load_context_xml,
)

from .step_executor import (
    StepResult,
    ExecutionResult,
    get_task_tool_params,
    get_retrospective_task_params,
    verify_story_ready,
    get_status_after_step,
    get_resume_step,
    check_epic_needs_retrospective,
    build_execution_plan,
)

__all__ = [
    # Config
    'load_config', 'config_exists', 'validate_story_ready_for_execution',
    'find_project_root', 'get_config_path', 'get_context_xml_path',
    'get_retrospective_path', 'ensure_retrospective_directory',
    # Sprint Parser
    'Story', 'Epic', 'StoryStatus', 'load_sprint_status', 'save_sprint_status',
    'parse_sprint_status', 'get_stories_ready_for_dev', 'get_executable_stories',
    'update_story_status', 'check_epic_completion',
    # Prompt Builder
    'build_autonomous_prompt', 'build_retrospective_prompt', 'get_step_config',
    'get_task_description', 'get_agent_type', 'get_steps_for_execute',
    'get_status_transition',
    # Retrospective
    'check_epic_needs_retro', 'get_retro_path', 'ensure_retro_dir',
    'get_completed_stories_for_epic', 'build_retrospective_context',
    'get_retrospective_prompt_context',
    # Error Handler
    'RalphError', 'ErrorType', 'format_error_message', 'create_test_failure_error',
    'create_build_failure_error', 'create_context_missing_error', 'create_config_error',
    # Progress
    'show_execution_header', 'show_no_stories_ready', 'show_stories_list',
    'show_execution_plan', 'show_story_start', 'show_step_start',
    'show_step_complete', 'show_step_error', 'show_story_complete',
    'show_epic_complete', 'show_retrospective_created', 'show_completion_summary',
    'show_partial_completion',
    # Logger
    'setup_logger', 'log_step_start', 'log_step_complete', 'log_step_error',
    'log_story_start', 'log_story_complete', 'log_epic_complete',
    'log_retrospective_created', 'log_session_complete',
    # Utils
    'setup_signal_handlers', 'sprint_status_lock', 'release_sprint_lock',
    'resolve_path', 'ensure_directory', 'file_exists_and_valid', 'load_context_xml',
    # Step Executor
    'StepResult', 'ExecutionResult', 'get_task_tool_params', 'get_retrospective_task_params',
    'verify_story_ready', 'get_status_after_step', 'get_resume_step',
    'check_epic_needs_retrospective', 'build_execution_plan',
]
