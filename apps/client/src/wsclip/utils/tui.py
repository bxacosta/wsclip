"""Terminal User Interface manager for WSClip."""

from __future__ import annotations

from collections import deque
from datetime import datetime

from rich.console import Console
from rich.layout import Layout
from rich.live import Live
from rich.panel import Panel
from rich.text import Text

from wsclip.config.constants import Theme
from wsclip.models.config import AppConfig
from wsclip.models.messages import ClipboardSyncMode


def format_hotkey(pynput_format: str) -> str:
    """
    Convert pynput hotkey format to human-readable format.

    Args:
        pynput_format: Hotkey in pynput format (e.g., "<alt>+<shift>+<enter>")

    Returns:
        Human-readable format (e.g., "Alt + Shift + Enter")
    """
    replacements = {
        "<alt>": "Alt",
        "<shift>": "Shift",
        "<ctrl>": "Ctrl",
        "<cmd>": "Cmd",
        "<enter>": "Enter",
        "<space>": "Space",
        "<tab>": "Tab",
        "<backspace>": "Backspace",
        "<delete>": "Delete",
        "<esc>": "Esc",
        "<up>": "Up",
        "<down>": "Down",
        "<left>": "Left",
        "<right>": "Right",
    }

    result = pynput_format
    for old, new in replacements.items():
        result = result.replace(old, new)

    return result.replace("+", " + ")


class TUIManager:
    """Manages fixed status panel + scrolling logs display."""

    def __init__(self, config: AppConfig):
        """
        Initialize TUI manager.

        Args:
            config: Application configuration
        """
        self.config = config
        self.console = Console()
        self.layout = Layout()
        self.live: Live | None = None

        # Status state
        self.mode = config.clipboard.sync_mode
        self.connection_status = "Disconnected"
        self.peer_active = False
        self.token = config.connection.token or "N/A"
        self.proxy_enabled = config.proxy.enabled
        self.proxy_info = f"{config.proxy.host}:{config.proxy.port}" if self.proxy_enabled else None

        # Log buffer (last 100 logs)
        self.logs: deque[tuple[str, str, str]] = deque(maxlen=100)

        # Setup layout
        self._setup_layout()

    def _setup_layout(self):
        """Create layout with fixed header (5 lines) and scrolling body."""
        self.layout.split_column(
            Layout(name="header", size=5),  # Fixed height
            Layout(name="body"),  # Remaining space
        )

    def _render_status_panel(self) -> Panel:
        """Render the fixed status panel."""
        # Format hotkey
        hotkey = format_hotkey(self.config.clipboard.hotkey) if self.mode == ClipboardSyncMode.MANUAL else "N/A"

        # Status indicator
        if self.connection_status == "Connected":
            status = "Connected • Peer Active" if self.peer_active else "Connected • Waiting for peer"
            status_style = Theme.STATUS_ACTIVE if self.peer_active else Theme.STATUS_CONNECTED
        else:
            status = self.connection_status
            status_style = Theme.STATUS_DISCONNECTED

        # Proxy status
        proxy = f"Enabled ({self.proxy_info})" if self.proxy_enabled else "Disabled"

        # Build status text
        content = Text()

        # Line 1: Mode | Status
        content.append("Mode: ", style=Theme.LABEL)
        content.append(f"{self.mode.value.capitalize():<14}", style=Theme.VALUE)
        content.append(" │ ", style=Theme.BORDER)
        content.append("Status: ", style=Theme.LABEL)
        content.append(f"{status}\n", style=status_style)

        # Line 2: Token | Proxy
        content.append("Token: ", style=Theme.LABEL)
        # Truncate token if too long
        token_display = self.token if len(self.token) <= 20 else f"{self.token[:8]}...{self.token[-8:]}"
        content.append(f"{token_display:<14}", style=Theme.VALUE)
        content.append(" │ ", style=Theme.BORDER)
        content.append("Proxy: ", style=Theme.LABEL)
        content.append(f"{proxy}\n", style=Theme.VALUE)

        # Line 3: Hotkey (only in manual mode)
        if self.mode == ClipboardSyncMode.MANUAL:
            content.append("Hotkey: ", style=Theme.LABEL)
            content.append(hotkey, style=Theme.VALUE)

        return Panel(
            content,
            title="WSClip Status",
            border_style=Theme.BORDER,
            padding=(0, 1),
        )

    def _render_logs(self) -> Panel:
        """Render scrolling logs."""
        if not self.logs:
            return Panel(
                Text("No logs yet...", style=Theme.LOG_TIMESTAMP),
                title="Connection Logs",
                border_style=Theme.BORDER,
                padding=(0, 1),
            )

        log_text = Text()
        for timestamp, message, level in self.logs:
            # Timestamp in grey
            log_text.append(f"[{timestamp}] ", style=Theme.LOG_TIMESTAMP)

            # Message with level-based styling
            style_map = {
                "info": Theme.LOG_INFO,
                "success": Theme.LOG_SUCCESS,
                "warning": Theme.LOG_WARNING,
                "error": Theme.LOG_ERROR,
            }
            style = style_map.get(level, Theme.LOG_INFO)

            log_text.append(f"{message}\n", style=style)

        return Panel(
            log_text,
            title="Connection Logs",
            border_style=Theme.BORDER,
            padding=(0, 1),
        )

    def start(self):
        """Start the live display."""
        self.layout["header"].update(self._render_status_panel())
        self.layout["body"].update(self._render_logs())
        # Use screen=True to enable alternate screen mode (cleaner scrolling)
        self.live = Live(self.layout, console=self.console, refresh_per_second=4, screen=True)
        # self.live = Live(self.layout, console=self.console, refresh_per_second=4)
        self.live.start()

    def stop(self):
        """Stop the live display."""
        if self.live:
            self.live.stop()
            self.live = None

    def update_status(
        self,
        connection_status: str | None = None,
        peer_active: bool | None = None,
        token: str | None = None,
    ):
        """
        Update status panel state.

        Args:
            connection_status: Connection status text
            peer_active: Whether peer is active
            token: Pairing token
        """
        if connection_status is not None:
            self.connection_status = connection_status
        if peer_active is not None:
            self.peer_active = peer_active
        if token is not None:
            self.token = token

        self._refresh()

    def add_log(self, message: str, level: str = "info"):
        """
        Add a new log entry.

        Args:
            message: Log message
            level: Log level (info, success, warning, error)
        """
        timestamp = datetime.now().strftime("%H:%M:%S")
        self.logs.append((timestamp, message, level))
        self._refresh()

    def _refresh(self):
        """Refresh the display."""
        if self.live:
            self.layout["header"].update(self._render_status_panel())
            self.layout["body"].update(self._render_logs())
            self.live.refresh()
