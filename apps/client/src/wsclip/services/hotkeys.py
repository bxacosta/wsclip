"""Hotkey service for capturing global keyboard shortcuts."""

from __future__ import annotations

from collections.abc import Callable, Awaitable
import asyncio
from pynput import keyboard

from wsclip.utils.logger import setup_logger


class HotkeyService:
    """Service for capturing global hotkeys."""

    def __init__(self, log_level: str = "INFO"):
        """
        Initialize hotkey service.

        Args:
            log_level: Logging level
        """
        self.logger = setup_logger("hotkey_service", log_level)
        self._listener: keyboard.GlobalHotKeys | None = None
        self._hotkey_map: dict[str, Callable[[], Awaitable[None]]] = {}
        self._running = False
        self._loop: asyncio.AbstractEventLoop | None = None

    async def register(self, keys: str, callback: Callable[[], Awaitable[None]]) -> None:
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
            # Schedule async callback in event loop from different thread
            if self._loop and self._loop.is_running():
                asyncio.run_coroutine_threadsafe(callback(), self._loop)
            else:
                self.logger.error("Event loop not running, cannot execute hotkey callback")

        # Register with pynput
        if self._listener:
            self._listener.stop()

        # Run GlobalHotKeys creation in executor to avoid blocking event loop
        loop = asyncio.get_running_loop()
        self._listener = await loop.run_in_executor(None, lambda: keyboard.GlobalHotKeys({keys: sync_callback}))

    async def start(self) -> None:
        """Start listening for hotkeys."""
        if self._running or not self._listener:
            return

        # Store reference to current event loop
        self._loop = asyncio.get_running_loop()

        self._running = True
        self._listener.start()
        self.logger.info("Hotkey service started")

    def stop(self) -> None:
        """Stop listening for hotkeys."""
        if not self._running:
            return

        self._running = False

        if self._listener:
            self._listener.stop()
            self._listener = None

        self.logger.info("Hotkey service stopped")
