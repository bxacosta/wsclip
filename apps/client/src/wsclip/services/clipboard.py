"""Clipboard service for system clipboard operations."""
from __future__ import annotations

from collections.abc import Callable, Awaitable
import asyncio
import pyperclip

from ..utils.logger import setup_logger


class ClipboardService:
    """Service for interacting with the system clipboard."""

    def __init__(
        self,
        poll_interval: float = 0.5,
        max_size_bytes: int = 1048576  # 1MB
    ):
        """
        Initialize clipboard service.

        Args:
            poll_interval: Seconds between clipboard checks (default 0.5)
            max_size_bytes: Maximum clipboard content size (default 1MB)
        """
        self.poll_interval = poll_interval
        self.max_size_bytes = max_size_bytes
        self.logger = setup_logger("clipboard_service")

        self._monitoring = False
        self._last_content: str | None = None
        self._last_received: str | None = None  # For loop prevention
        self._monitor_task: asyncio.Task | None = None

    def get(self) -> str | None:
        """
        Read current clipboard text content.

        Returns:
            Clipboard text or None if empty/not text
        """
        try:
            content = pyperclip.paste()
            return content if content else None
        except Exception as e:
            self.logger.error(f"Failed to get clipboard: {e}")
            return None

    def set(self, text: str) -> bool:
        """
        Write text to system clipboard.

        Args:
            text: Text to write to clipboard

        Returns:
            True if successful, False otherwise
        """
        try:
            pyperclip.copy(text)
            # Remember what we wrote to prevent loop
            self._last_received = text
            return True
        except Exception as e:
            self.logger.error(f"Failed to set clipboard: {e}")
            return False

    def should_ignore_change(self, content: str) -> bool:
        """
        Check if clipboard change should be ignored (loop prevention).

        Args:
            content: Current clipboard content

        Returns:
            True if this change should be ignored
        """
        # Ignore if it's what we just received from peer
        if self._last_received and content == self._last_received:
            # Clear the flag after ignoring once
            self._last_received = None
            return True

        # Ignore if content too large
        if len(content.encode('utf-8')) > self.max_size_bytes:
            return True

        # Ignore if same as last seen
        if content == self._last_content:
            return True

        return False

    async def start_monitoring(
        self,
        on_change: Callable[[str], Awaitable[None]]
    ) -> None:
        """
        Start monitoring clipboard for changes.

        Args:
            on_change: Async callback when clipboard changes
        """
        if self._monitoring:
            return

        self._monitoring = True
        self._last_content = self.get()

        # Start monitoring loop
        self._monitor_task = asyncio.create_task(
            self._monitor_loop(on_change)
        )

    async def stop_monitoring(self) -> None:
        """Stop clipboard monitoring."""
        self._monitoring = False

        if self._monitor_task:
            self._monitor_task.cancel()
            try:
                await self._monitor_task
            except asyncio.CancelledError:
                pass
            self._monitor_task = None

    async def _monitor_loop(
        self,
        on_change: Callable[[str], Awaitable[None]]
    ) -> None:
        """
        Internal monitoring loop.

        Args:
            on_change: Callback for clipboard changes
        """
        while self._monitoring:
            try:
                current = self.get()

                if current and not self.should_ignore_change(current):
                    self._last_content = current
                    await on_change(current)

                await asyncio.sleep(self.poll_interval)

            except asyncio.CancelledError:
                break
            except Exception as e:
                self.logger.error(f"Error in monitor loop: {e}")
                await asyncio.sleep(self.poll_interval)
