"""Hotkey service for capturing global keyboard shortcuts."""

from __future__ import annotations

import asyncio
from collections.abc import Callable, Coroutine
from typing import Any

from pynput import keyboard

from wsclip.config.settings import Settings
from wsclip.utils.logger import AppLogger


def _format_hotkey_display(keys: str) -> str:
    """
    Convert pynput hotkey format to human-readable format.
    
    Args:
        keys: Hotkey in pynput format (e.g., '<alt>+<shift>+<enter>')
    
    Returns:
        Human-readable format (e.g., 'Alt + Shift + Enter')
    """
    # Remove angle brackets and capitalize each key
    parts = keys.replace('<', '').replace('>', '').split('+')
    return ' + '.join(part.capitalize() for part in parts)


class HotkeyService:
    """Service for capturing global hotkeys."""

    def __init__(self, log_level: str = Settings.DEFAULT_LOG_LEVEL, logger: AppLogger | None = None):
        """
        Initialize hotkey service.

        Args:
            log_level: Logging level
            logger: Application logger (for user-facing messages)
        """
        # Unified logger (works for Console and TUI)
        self.logger: AppLogger
        if logger is None:
            # Fallback to console logger if not provided
            from wsclip.utils.logger import create_logger

            self.logger = create_logger(mode="console", component_name="hotkey_service", log_level=log_level)
        else:
            self.logger = logger

        self._listener: keyboard.GlobalHotKeys | None = None
        self._hotkey_map: dict[str, Callable[[], Coroutine[Any, Any, None]]] = {}
        self._running = False
        self._loop: asyncio.AbstractEventLoop | None = None

    async def register(self, keys: str, callback: Callable[[], Coroutine[Any, Any, None]]) -> None:
        """
        Register a hotkey combination.

        Args:
            keys: Hotkey string (e.g., '<ctrl>+<shift>+c')
            callback: Async function to call when hotkey pressed
        """
        # Store for async execution
        self._hotkey_map[keys] = callback

        # Create sync wrapper for pynput
        def sync_callback():
            self.logger.debug(f"Hotkey triggered: {_format_hotkey_display(keys)}")
            # Schedule async callback in event loop from different thread
            if self._loop and self._loop.is_running():
                asyncio.run_coroutine_threadsafe(callback(), self._loop)
            else:
                self.logger.error("Event loop not running, cannot execute hotkey callback")
                self.logger.error("Hotkey pressed but system not ready")

        # Register with pynput
        if self._listener:
            self._listener.stop()

        # Run GlobalHotKeys creation in executor to avoid blocking event loop
        loop = asyncio.get_running_loop()
        self._listener = await loop.run_in_executor(None, lambda *_: keyboard.GlobalHotKeys({keys: sync_callback}))
        self.logger.debug(f"Registered hotkey: {_format_hotkey_display(keys)}")

    async def start(self) -> None:
        """Start listening for hotkeys."""
        if self._running or not self._listener:
            self.logger.debug(f"Start hotkey skipped: running={self._running}, listener={self._listener is not None}")
            return

        # Store reference to current event loop
        self._loop = asyncio.get_running_loop()
        self.logger.debug(f"Stored event loop reference: {id(self._loop)}")

        self._running = True
        self._listener.start()
        formatted_keys = [_format_hotkey_display(k) for k in self._hotkey_map]
        self.logger.debug(f"Hotkey listener started (registered keys: {formatted_keys})")
        self.logger.info("Hotkey service started")

    def stop(self) -> None:
        """Stop listening for hotkeys."""
        if not self._running:
            self.logger.debug("Stop hotkey skipped: not running")
            return

        self.logger.debug("Stopping hotkey service...")
        self._running = False

        if self._listener:
            self.logger.debug("Stopping GlobalHotKeys listener...")
            self._listener.stop()
            self._listener = None
            self.logger.debug("GlobalHotKeys listener stopped and cleared")

        self.logger.info("Hotkey service stopped")
