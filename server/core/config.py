from __future__ import annotations

from pathlib import Path


APP_CONFIG_DIR = Path.home() / ".script-storyboard-system"
APP_CONFIG_FILE = APP_CONFIG_DIR / "config.json"
APP_SETTINGS_FILE = APP_CONFIG_DIR / "settings.json"
APP_LOG_DIR = APP_CONFIG_DIR / "logs"
LLM_LOG_FILE = APP_LOG_DIR / "llm-calls.json"
IMAGE_LOG_FILE = APP_LOG_DIR / "image-calls.json"
IMAGE_TASK_FILE = APP_LOG_DIR / "image-tasks.json"

BACKEND_HOST = "127.0.0.1"
BACKEND_PORT = 8787


def repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def bundled_rulepacks_dir() -> Path:
    return repo_root() / "rulepacks"


def bundled_providerpacks_dir() -> Path:
    return repo_root() / "providerpacks"


def default_project_root_dir() -> Path:
    return repo_root() / "WORK"
