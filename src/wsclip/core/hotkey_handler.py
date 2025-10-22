"""
Global hotkey handler for manual clipboard send
"""
from typing import Callable, Awaitable, Optional
import asyncio
from pynput import keyboard
from ..utils.logger import setup_logger


class HotkeyHandler:
    """
    Handles global hotkey registration and callbacks
    Uses pynput for cross-platform hotkey support
    """

    def __init__(self, log_level: str = "INFO"):
        """
        Initialize hotkey handler

        Args:
            log_level: Logging level
        """
        self.logger = setup_logger("hotkey_handler", log_level)
        self._listener: Optional[keyboard.GlobalHotKeys] = None
        self._hotkey_map: dict[str, Callable[[], Awaitable[None]]] = {}
        self._running = False

    def register_hotkey(
        self,
        keys: str,
        callback: Callable[[], Awaitable[None]]
    ) -> None:
        """
        Register a hotkey combination

        Args:
            keys: Hotkey string (e.g., '<ctrl>+<shift>+c')
            callback: Async function to call when hotkey pressed
        """
        # Store for async execution
        self._hotkey_map[keys] = callback

        # Create sync wrapper for pynput
        def sync_callback():
            # Schedule async callback in event loop
            asyncio.create_task(callback())

        # Register with pynput
        if self._listener:
            self._listener.stop()

        self._listener = keyboard.GlobalHotKeys({
            keys: sync_callback
        })

    async def start(self) -> None:
        """Start listening for hotkeys"""
        if self._running or not self._listener:
            return

        self._running = True
        self._listener.start()
        self.logger.info("Hotkey handler started")

    def stop(self) -> None:
        """Stop listening for hotkeys"""
        if not self._running:
            return

        self._running = False

        if self._listener:
            self._listener.stop()
            self._listener = None

        self.logger.info("Hotkey handler stopped")

    def unregister_all(self) -> None:
        """Unregister all hotkeys"""
        self.stop()
        self._hotkey_map.clear()
