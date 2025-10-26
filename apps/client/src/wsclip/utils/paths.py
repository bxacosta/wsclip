"""Path utilities for XDG-compliant configuration directory."""

from __future__ import annotations

from pathlib import Path


def get_config_dir() -> Path:
    """
    Get XDG configuration directory for wsclip.

    Returns:
        Path to ~/.config/wsclip/ directory

    Note:
        On Windows, ~ expands to user profile directory
        (e.g., C:\\Users\\username\\.config\\wsclip\\)
    """
    config_dir = Path.home() / ".config" / "wsclip"
    return config_dir


def get_config_file() -> Path:
    """
    Get path to config.json file.

    Returns:
        Path to ~/.config/wsclip/config.json
    """
    return get_config_dir() / "config.json"


def ensure_config_dir() -> None:
    """
    Create configuration directory if it doesn't exist.

    Raises:
        PermissionError: If directory cannot be created due to permissions
        OSError: If directory creation fails for other reasons
    """
    config_dir = get_config_dir()

    if config_dir.exists():
        if not config_dir.is_dir():
            raise OSError(f"Config path exists but is not a directory: {config_dir}")
        return

    try:
        config_dir.mkdir(parents=True, exist_ok=True)
    except PermissionError as e:
        raise PermissionError(f"Cannot create config directory {config_dir}: Permission denied") from e
    except OSError as e:
        raise OSError(f"Failed to create config directory {config_dir}: {e}") from e
