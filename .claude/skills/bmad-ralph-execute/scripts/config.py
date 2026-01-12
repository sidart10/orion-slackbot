#!/usr/bin/env python3
"""
Configuration management for BMAD Ralph Execute.

Handles:
- Config file loading (created by generate skill)
- Path validation
- Required file checks for execution
"""

import os
from pathlib import Path
from typing import Optional, Dict, Any, List, Tuple

try:
    from ruamel.yaml import YAML
    yaml = YAML()
    yaml.preserve_quotes = True
except ImportError:
    import yaml as pyyaml
    yaml = None


DEFAULT_PATHS = {
    'paths': {
        'story_file': '{impl_dir}/stories/story-{story_id}.md',
        'atdd_checklist': '{impl_dir}/stories/atdd-checklist-{story_id}.md',
        'context_xml': '{impl_dir}/stories/{story_id}.context.xml',
        'retrospective': '{impl_dir}/retrospectives/epic-{epic_id}-retrospective.md',
    }
}


def find_project_root() -> Path:
    """Find project root by looking for .ralph or _bmad directory."""
    current = Path.cwd()

    for parent in [current] + list(current.parents):
        if (parent / '.ralph').exists():
            return parent
        if (parent / '_bmad').exists():
            return parent
        if (parent / '.git').exists():
            return parent

    return current


def get_config_path() -> Path:
    """Get path to .ralph/config.yaml."""
    return find_project_root() / '.ralph' / 'config.yaml'


def get_paths_config_path() -> Path:
    """Get path to .ralph/paths.yaml."""
    return find_project_root() / '.ralph' / 'paths.yaml'


def config_exists() -> bool:
    """Check if configuration exists (created by generate skill)."""
    return get_config_path().exists()


def load_config() -> Dict[str, Any]:
    """Load configuration from .ralph/config.yaml."""
    config_path = get_config_path()

    if not config_path.exists():
        raise FileNotFoundError(
            "Configuration not found. Run /bmad-ralph-generate first to create stories."
        )

    with open(config_path, 'r') as f:
        if yaml:
            return yaml.load(f)
        else:
            return pyyaml.safe_load(f)


def load_paths_config() -> Dict[str, Any]:
    """Load path patterns from .ralph/paths.yaml."""
    paths_path = get_paths_config_path()

    if not paths_path.exists():
        return DEFAULT_PATHS.copy()

    with open(paths_path, 'r') as f:
        if yaml:
            return yaml.load(f)
        else:
            return pyyaml.safe_load(f)


def validate_story_ready_for_execution(
    story_id: str,
    config: Dict[str, Any],
    paths: Dict[str, Any]
) -> Tuple[bool, List[str]]:
    """
    Validate that a story has all required files for execution.

    Returns:
        Tuple of (is_valid, list of error messages)
    """
    errors = []
    impl_dir = config.get('impl_dir', './implementation-artifacts')
    use_tea = config.get('use_tea_agent', True)

    # Required: story file
    story_path = Path(impl_dir) / 'stories' / f'story-{story_id}.md'
    if not story_path.exists():
        errors.append(f"Missing story file: {story_path}")

    # Required: context.xml
    context_path = Path(impl_dir) / 'stories' / f'{story_id}.context.xml'
    if not context_path.exists():
        errors.append(f"Missing context file: {context_path}")

    # Required if TEA was enabled: atdd-checklist
    if use_tea:
        atdd_path = Path(impl_dir) / 'stories' / f'atdd-checklist-{story_id}.md'
        if not atdd_path.exists():
            errors.append(f"Missing ATDD checklist: {atdd_path}")

    return len(errors) == 0, errors


def resolve_path(path_pattern: str, config: Dict[str, Any], story_id: str = '', epic_id: str = '') -> str:
    """Resolve a path pattern with config values."""
    result = path_pattern
    result = result.replace('{impl_dir}', config.get('impl_dir', './implementation-artifacts'))
    result = result.replace('{planning_dir}', config.get('planning_dir', './planning-artifacts'))
    result = result.replace('{story_id}', story_id)
    result = result.replace('{epic_id}', str(epic_id))
    return result


def get_context_xml_path(config: Dict[str, Any], paths: Dict[str, Any], story_id: str) -> str:
    """Get resolved path for context XML file."""
    pattern = paths.get('paths', {}).get('context_xml', DEFAULT_PATHS['paths']['context_xml'])
    return resolve_path(pattern, config, story_id=story_id)


def get_retrospective_path(config: Dict[str, Any], paths: Dict[str, Any], epic_id: str) -> str:
    """Get resolved path for retrospective file."""
    pattern = paths.get('paths', {}).get('retrospective', DEFAULT_PATHS['paths']['retrospective'])
    return resolve_path(pattern, config, epic_id=epic_id)


def ensure_retrospective_directory(config: Dict[str, Any]) -> None:
    """Ensure retrospectives directory exists."""
    impl_dir = Path(config.get('impl_dir', './implementation-artifacts'))
    (impl_dir / 'retrospectives').mkdir(parents=True, exist_ok=True)


def print_config_summary(config: Dict[str, Any]) -> None:
    """Print configuration summary."""
    print(f"   Planning: {config.get('planning_dir')}")
    print(f"   Implementation: {config.get('impl_dir')}")
    print(f"   TEA Agent: {'Enabled' if config.get('use_tea_agent') else 'Disabled'}")


if __name__ == '__main__':
    if config_exists():
        config = load_config()
        print("Loaded existing config:")
        print_config_summary(config)
    else:
        print("No config found. Run /bmad-ralph-generate first.")
