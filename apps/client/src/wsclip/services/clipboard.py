"""Clipboard service for system clipboard operations."""

from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable
from contextlib import suppress

import pyperclip

from wsclip.config.settings import Settings
from wsclip.utils.logger import AppLogger


class ClipboardService:
    """Service for interacting with the system clipboard."""

    def __init__(
        self,
        poll_interval: float = Settings.DEFAULT_CLIPBOARD_POLL_INTERVAL,
        max_size_bytes: int = Settings.MAX_MESSAGE_SIZE,
        app_logger: AppLogger | None = None,
    ):
        """
        Initialize clipboard service.

        Args:
            poll_interval: Seconds between clipboard checks (default 0.5)
            max_size_bytes: Maximum clipboard content size (default 1MB)
            app_logger: AppLogger for all logging (user-facing and technical)
        """
        self.poll_interval = poll_interval
        self.max_size_bytes = max_size_bytes
        
        # Unified logger - same instance for everything
        self.logger: AppLogger
        if app_logger is None:
            from wsclip.utils.logger import create_logger
            self.logger = create_logger(mode="console", component_name="clipboard")
        else:
            self.logger = app_logger

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
            self.logger.error(f"Failed to read clipboard: {e}")
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
            self.logger.error(f"Failed to write to clipboard: {e}")
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
        content_bytes = len(content.encode("utf-8"))
        if content_bytes > self.max_size_bytes:
            size_mb = content_bytes / (1024 * 1024)
            max_mb = self.max_size_bytes / (1024 * 1024)
            self.logger.warning(
                f"Clipboard content too large ({size_mb:.2f}MB). Max allowed: {max_mb:.1f}MB"
            )
            return True

        return content == self._last_content

    async def start_monitoring(self, on_change: Callable[[str], Awaitable[None]]) -> None:
        """
        Start monitoring clipboard for changes.

        Args:
            on_change: Async callback when clipboard changes
        """
        if self._monitoring:
            self.logger.debug("Clipboard monitoring already active, skipping start")
            return

        self._monitoring = True
        self._last_content = self.get()
        self.logger.debug(
            f"Starting clipboard monitoring: poll_interval={self.poll_interval}s, "
            f"max_size={self.max_size_bytes / 1024 / 1024:.1f}MB, "
            f"initial_content={'<empty>' if not self._last_content else f'{len(self._last_content)} chars'}"
        )

        # Start monitoring loop
        self._monitor_task = asyncio.create_task(self._monitor_loop(on_change))
        self.logger.debug("Clipboard monitor task created")

    async def stop_monitoring(self) -> None:
        """Stop clipboard monitoring."""
        self.logger.debug("Stopping clipboard monitoring...")
        self._monitoring = False

        if self._monitor_task:
            self.logger.debug("Cancelling clipboard monitor task...")
            self._monitor_task.cancel()
            with suppress(asyncio.CancelledError):
                await self._monitor_task
            self._monitor_task = None
            self.logger.debug("Clipboard monitoring stopped")

    async def _monitor_loop(self, on_change: Callable[[str], Awaitable[None]]) -> None:
        """
        Internal monitoring loop.

        Args:
            on_change: Callback for clipboard changes
        """
        poll_count = 0
        self.logger.debug("Clipboard monitor loop started")
        while self._monitoring:
            try:
                current = self.get()
                poll_count += 1

                if poll_count % 100 == 0:  # Log every 100 polls to avoid spam
                    self.logger.debug(f"Clipboard poll #{poll_count}: monitoring active")

                if current and not self.should_ignore_change(current):
                    self.logger.debug(
                        f"Clipboard change detected: size={len(current)} chars, "
                        f"preview={current[:50]}..."
                    )
                    self._last_content = current
                    await on_change(current)

                await asyncio.sleep(self.poll_interval)

            except asyncio.CancelledError:
                self.logger.debug(f"Clipboard monitor loop cancelled (total polls: {poll_count})")
                break
            except Exception as e:
                self.logger.error(f"Clipboard monitoring error: {e}")
                await asyncio.sleep(self.poll_interval)
