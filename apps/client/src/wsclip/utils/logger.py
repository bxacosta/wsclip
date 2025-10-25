"""Rich-based logging utilities."""
import logging

from rich.console import Console
from rich.logging import RichHandler
from rich.theme import Theme

# Custom theme for console output
CUSTOM_THEME = Theme({
    "info": "cyan",
    "warning": "yellow",
    "error": "bold red",
    "success": "bold green",
    "peer": "magenta",
    "message": "white",
})

# Global console instance
console = Console(theme=CUSTOM_THEME)


def setup_logger(name: str, level: str = "INFO") -> logging.Logger:
    """
    Setup a Rich logger with custom formatting.

    Args:
        name: Logger name
        level: Log level (DEBUG, INFO, WARNING, ERROR)

    Returns:
        Configured logger instance
    """
    logger = logging.getLogger(name)
    logger.setLevel(getattr(logging, level.upper()))

    # Remove existing handlers
    logger.handlers.clear()

    # Add Rich handler
    handler = RichHandler(
        console=console,
        show_time=True,
        show_path=False,
        markup=True,
        rich_tracebacks=True,
    )

    handler.setFormatter(logging.Formatter("%(message)s"))
    logger.addHandler(handler)

    return logger


def print_message(from_peer: str, content: str) -> None:
    """Print a received message with nice formatting."""
    console.print(f"[peer]◀ {from_peer}[/peer]: [message]{content}[/message]")


def print_info(message: str) -> None:
    """Print info message."""
    console.print(f"[info]ℹ {message}[/info]")


def print_success(message: str) -> None:
    """Print success message."""
    console.print(f"[success]✓ {message}[/success]")


def print_warning(message: str) -> None:
    """Print warning message."""
    console.print(f"[warning]⚠ {message}[/warning]")


def print_error(message: str) -> None:
    """Print error message."""
    console.print(f"[error]✗ {message}[/error]")
