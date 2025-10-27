"""Centralized application logging system with Console/TUI backends."""

from __future__ import annotations

import logging
from typing import Any, Literal, Protocol

from rich.console import Console
from rich.highlighter import NullHighlighter
from rich.logging import RichHandler
from rich.theme import Theme as RichTheme

from wsclip.config.constants import Theme
from wsclip.utils.tui import TUIManager

# Custom theme for console output (uses Theme from constants.py)
CUSTOM_THEME = RichTheme(
    {
        "info": Theme.LOG_INFO,
        "warning": Theme.LOG_WARNING,
        "error": Theme.LOG_ERROR,
        "log.time": Theme.LOG_TIMESTAMP,
    }
)

# Global console instance for Rich formatting
_console = Console(theme=CUSTOM_THEME)

# Export console for CLI display (tables, formatted output)
console = _console


class LoggerBackend(Protocol):
    """Protocol for logger backends (Console, TUI, File, etc.)."""

    def debug(self, message: str, **metadata: Any) -> None:
        """Log debug message."""
        ...

    def info(self, message: str, **metadata: Any) -> None:
        """Log info message."""
        ...

    def warning(self, message: str, **metadata: Any) -> None:
        """Log warning message."""
        ...

    def error(self, message: str, **metadata: Any) -> None:
        """Log error message."""
        ...


class ConsoleLoggerBackend:
    """Logs to console using Rich formatting."""

    def __init__(self, level: str = "INFO"):
        """
        Initialize console logger backend.

        Args:
            level: Minimum log level to display (DEBUG, INFO, WARNING, ERROR)
        """
        self._logger = logging.getLogger("wsclip.console")
        self._logger.setLevel(getattr(logging, level.upper()))

        # Clear existing handlers to avoid duplicates
        self._logger.handlers.clear()

        # Add Rich handler with consistent timestamps
        handler = RichHandler(
            console=_console,
            show_time=True,
            show_path=False,
            markup=False,  # Disable markup to prevent auto-coloring
            rich_tracebacks=True,
            omit_repeated_times=False,  # Always show timestamp, never omit
            highlighter=NullHighlighter(),  # Disable syntax highlighting (URLs, numbers, etc.)
        )
        handler.setFormatter(logging.Formatter("%(message)s"))
        self._logger.addHandler(handler)

    def debug(self, message: str, **metadata: Any) -> None:
        """Log debug message to console."""
        self._logger.debug(self._format_message(message, metadata))

    def info(self, message: str, **metadata: Any) -> None:
        """Log info message to console."""
        self._logger.info(self._format_message(message, metadata))

    def warning(self, message: str, **metadata: Any) -> None:
        """Log warning message to console."""
        self._logger.warning(self._format_message(message, metadata))

    def error(self, message: str, **metadata: Any) -> None:
        """Log error message to console."""
        self._logger.error(self._format_message(message, metadata))

    def _format_message(self, message: str, metadata: dict[str, Any]) -> str:
        """Format message with metadata for console output."""
        if not metadata:
            return message
        # Add metadata inline for debugging
        meta_str = ", ".join(f"{k}={v}" for k, v in metadata.items())
        return f"{message} [{meta_str}]"


class TUILoggerBackend:
    """Logs to TUI using TUIManager."""

    def __init__(self, tui_manager: TUIManager):
        """
        Initialize TUI logger backend.

        Args:
            tui_manager: TUI manager instance
        """
        self.tui = tui_manager

    def debug(self, message: str, **metadata: Any) -> None:
        """Log debug message to TUI."""
        # Debug shown in TUI during development
        self.tui.add_log(self._format_message(message, metadata), "info")

    def info(self, message: str, **metadata: Any) -> None:
        """Log info message to TUI."""
        self.tui.add_log(self._format_message(message, metadata), "info")

    def warning(self, message: str, **metadata: Any) -> None:
        """Log warning message to TUI."""
        self.tui.add_log(self._format_message(message, metadata), "warning")

    def error(self, message: str, **metadata: Any) -> None:
        """Log error message to TUI."""
        self.tui.add_log(self._format_message(message, metadata), "error")

    def _format_message(self, message: str, metadata: dict[str, Any]) -> str:
        """Format message for TUI (metadata in dim style)."""
        if not metadata:
            return message
        meta_str = ", ".join(f"{k}={v}" for k, v in metadata.items())
        # Show metadata in dim gray after message
        return f"{message} [dim]{meta_str}[/dim]"


class AppLogger:
    """
    Unified application logger.

    Services use this without knowing about Console/TUI backend.
    """

    def __init__(self, backend: LoggerBackend):
        """
        Initialize app logger.

        Args:
            backend: Logger backend (Console, TUI, etc.)
        """
        self._backend = backend

    def debug(self, message: str, **metadata: Any) -> None:
        """
        Log debug message - technical details.

        Args:
            message: Log message
            **metadata: Additional structured data
        """
        self._backend.debug(message, **metadata)

    def info(self, message: str, **metadata: Any) -> None:
        """
        Log info message - general information.

        Args:
            message: Log message
            **metadata: Additional structured data
        """
        self._backend.info(message, **metadata)

    def warning(self, message: str, **metadata: Any) -> None:
        """
        Log warning message - non-critical issues.

        Args:
            message: Log message
            **metadata: Additional structured data
        """
        self._backend.warning(message, **metadata)

    def error(self, message: str, **metadata: Any) -> None:
        """
        Log error message - critical issues.

        Args:
            message: Log message
            **metadata: Additional structured data
        """
        self._backend.error(message, **metadata)


def create_logger(
    mode: Literal["console", "tui"] = "console",
    tui_manager: TUIManager | None = None,
    component_name: str | None = None,
    log_level: str = "INFO",
) -> AppLogger:
    """
    Create appropriate logger based on mode.

    Args:
        mode: "console" for traditional prints, "tui" for TUI
        tui_manager: Required if mode="tui"
        component_name: Optional component identifier for structured logging
        log_level: Minimum log level (DEBUG, INFO, WARNING, ERROR)

    Returns:
        AppLogger instance

    Raises:
        ValueError: If mode="tui" but tui_manager is None
    """
    # Create backend based on mode
    if mode == "tui":
        if tui_manager is None:
            raise ValueError("tui_manager required when mode='tui'")
        backend: LoggerBackend = TUILoggerBackend(tui_manager)
    else:
        backend = ConsoleLoggerBackend(level=log_level)

    return AppLogger(backend)
