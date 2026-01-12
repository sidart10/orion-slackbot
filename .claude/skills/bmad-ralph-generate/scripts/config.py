#!/usr/bin/env python3
"""
Configuration management for BMAD Ralph Generate.

Handles:
- First-run configuration prompts
- Config file loading/saving
- Path validation
- Required file checks
"""

import os
import sys
from pathlib import Path
from typing import Optional, Dict, Any, List, Tuple

try:
    from ruamel.yaml import YAML
    yaml = YAML()
    yaml.preserve_quotes = True
except ImportError:
    import yaml as pyyaml
    yaml = None


# Required planning files with minimum content length
REQUIRED_FILES = {
    'prd.md': 100,
    'architecture.md': 100,
    'epics.md': 50,
    'sprint-status.yaml': 10,
}

# TEA-only required files
TEA_REQUIRED_FILES = {
    'test-design.md': 50,
}

DEFAULT_CONFIG = {
    'planning_dir': './planning-artifacts',
    'impl_dir': './implementation-artifacts',
    'use_tea_agent': True,
    'step_timeouts': {
        1: 10,   # create-story
        2: 5,    # story-ready
        3: 15,   # atdd
        4: 5,    # test-review
        5: 10,   # story-context
    }
}

DEFAULT_PATHS = {
    'paths': {
        'story_file': '{impl_dir}/stories/story-{story_id}.md',
        'atdd_checklist': '{impl_dir}/stories/atdd-checklist-{story_id}.md',
        'context_xml': '{impl_dir}/stories/{story_id}.context.xml',
    }
}


def find_project_root() -> Path:
    """Find project root by looking for .ralph or _bmad directory."""
    current = Path.cwd()

    # Walk up looking for markers
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
    """Check if configuration already exists."""
    return get_config_path().exists()


def load_config() -> Dict[str, Any]:
    """Load configuration from .ralph/config.yaml."""
    config_path = get_config_path()

    if not config_path.exists():
        raise FileNotFoundError(f"Config not found: {config_path}")

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


def save_config(config: Dict[str, Any]) -> None:
    """Save configuration to .ralph/config.yaml."""
    config_path = get_config_path()
    config_path.parent.mkdir(parents=True, exist_ok=True)

    with open(config_path, 'w') as f:
        if yaml:
            yaml.dump(config, f)
        else:
            pyyaml.dump(config, f, default_flow_style=False)


def save_paths_config(paths: Dict[str, Any]) -> None:
    """Save path patterns to .ralph/paths.yaml."""
    paths_path = get_paths_config_path()
    paths_path.parent.mkdir(parents=True, exist_ok=True)

    with open(paths_path, 'w') as f:
        if yaml:
            yaml.dump(paths, f)
        else:
            pyyaml.dump(paths, f, default_flow_style=False)


def validate_planning_dir(planning_dir: str, use_tea: bool = True) -> Tuple[bool, List[str]]:
    """
    Validate that planning directory contains required files.

    Returns:
        Tuple of (is_valid, list of error messages)
    """
    errors = []
    path = Path(planning_dir)

    if not path.exists():
        return False, [f"Directory does not exist: {planning_dir}"]

    if not path.is_dir():
        return False, [f"Not a directory: {planning_dir}"]

    # Check required files
    files_to_check = REQUIRED_FILES.copy()
    if use_tea:
        files_to_check.update(TEA_REQUIRED_FILES)

    for filename, min_length in files_to_check.items():
        filepath = path / filename

        if not filepath.exists():
            errors.append(f"Missing required file: {filename}")
            continue

        content_length = filepath.stat().st_size
        if content_length < min_length:
            errors.append(f"File too small ({content_length} bytes, need {min_length}): {filename}")

    return len(errors) == 0, errors


def create_impl_directories(impl_dir: str) -> None:
    """Create implementation output directories."""
    impl_path = Path(impl_dir)

    (impl_path / 'stories').mkdir(parents=True, exist_ok=True)
    (impl_path / 'retrospectives').mkdir(parents=True, exist_ok=True)


def resolve_path(path_pattern: str, config: Dict[str, Any], story_id: str = '', epic_id: str = '') -> str:
    """Resolve a path pattern with config values."""
    result = path_pattern
    result = result.replace('{impl_dir}', config.get('impl_dir', './implementation-artifacts'))
    result = result.replace('{planning_dir}', config.get('planning_dir', './planning-artifacts'))
    result = result.replace('{story_id}', story_id)
    result = result.replace('{epic_id}', epic_id)
    return result


def get_story_file_path(config: Dict[str, Any], paths: Dict[str, Any], story_id: str) -> str:
    """Get resolved path for story file."""
    pattern = paths.get('paths', {}).get('story_file', DEFAULT_PATHS['paths']['story_file'])
    return resolve_path(pattern, config, story_id=story_id)


def get_atdd_checklist_path(config: Dict[str, Any], paths: Dict[str, Any], story_id: str) -> str:
    """Get resolved path for ATDD checklist file."""
    pattern = paths.get('paths', {}).get('atdd_checklist', DEFAULT_PATHS['paths']['atdd_checklist'])
    return resolve_path(pattern, config, story_id=story_id)


def get_context_xml_path(config: Dict[str, Any], paths: Dict[str, Any], story_id: str) -> str:
    """Get resolved path for context XML file."""
    pattern = paths.get('paths', {}).get('context_xml', DEFAULT_PATHS['paths']['context_xml'])
    return resolve_path(pattern, config, story_id=story_id)


def print_config_summary(config: Dict[str, Any]) -> None:
    """Print configuration summary."""
    print(f"   Planning: {config.get('planning_dir')}")
    print(f"   Implementation: {config.get('impl_dir')}")
    print(f"   TEA Agent: {'Enabled' if config.get('use_tea_agent') else 'Disabled'}")


if __name__ == '__main__':
    # Test configuration
    if config_exists():
        config = load_config()
        print("Loaded existing config:")
        print_config_summary(config)
    else:
        print("No config found. Run skill to configure.")
