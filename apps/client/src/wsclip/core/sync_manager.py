"""Sync manager for orchestrating clipboard synchronization."""
from __future__ import annotations

import asyncio

from ..services.websocket import WebSocketService
from ..services.clipboard import ClipboardService
from ..services.hotkeys import HotkeyService
from ..models.config import AppConfig
from ..models.messages import ClipboardTextMessage
from ..utils.logger import print_info, print_success, print_warning, print_error
from ..core.connection import ReconnectionStrategy


class SyncManager:
    """Orchestrates clipboard synchronization between peers."""

    def __init__(self, config: AppConfig):
        """
        Initialize sync manager.

        Args:
            config: Application configuration
        """
        self.config = config

        # Services
        self.ws_service = WebSocketService(
            worker_url=config.worker_url,
            token=config.token,
            peer_id=config.peer_id,
            log_level=config.log_level
        )
        
        self.clipboard_service = ClipboardService(
            poll_interval=config.clipboard_poll_interval,
            max_size_bytes=config.clipboard_max_size_mb * 1024 * 1024
        )

        self.hotkey_service: HotkeyService | None = None

        # Register message handlers
        self.ws_service.register_handler('clipboard_text', self._on_clipboard_received)

    @classmethod
    def from_config(cls, config_path: str = 'config.yaml') -> 'SyncManager':
        """
        Create SyncManager from config file.

        Args:
            config_path: Path to configuration file

        Returns:
            Initialized SyncManager instance
        """
        config = AppConfig.from_yaml(config_path)
        return cls(config)

    async def start(self, mode: str | None = None) -> None:
        """
        Start clipboard synchronization.

        Args:
            mode: Sync mode ('auto' or 'manual'), uses config if not provided
        """
        if mode:
            self.config.mode = mode

        # Connect with retry
        connected = await self._connect_with_retry()
        if not connected:
            print_error("Failed to establish connection")
            return

        # Start mode-specific sync
        if self.config.mode == 'auto':
            await self._start_auto_mode()
        elif self.config.mode == 'manual':
            await self._start_manual_mode()

    async def _connect_with_retry(self) -> bool:
        """
        Connect to WebSocket server with optional automatic retry.

        Returns:
            True if connected successfully, False otherwise
        """
        # Direct connection if reconnect disabled
        if not self.config.enable_reconnect:
            return await self.ws_service.connect()

        # Connect with retry strategy
        reconnect_strategy = ReconnectionStrategy(
            max_attempts=self.config.reconnect_max_attempts
        )
        return await reconnect_strategy.connect_with_retry(
            self.ws_service.connect
        )

    async def stop(self) -> None:
        """Stop clipboard synchronization."""
        try:
            if self.config.mode == 'auto':
                await self.clipboard_service.stop_monitoring()
            elif self.config.mode == 'manual' and self.hotkey_service:
                self.hotkey_service.stop()

            await self.ws_service.disconnect()
        except Exception:
            pass

    async def _start_auto_mode(self) -> None:
        """Start automatic clipboard monitoring mode."""
        print_info("Auto mode: monitoring clipboard...")

        async def on_clipboard_change(content: str) -> None:
            await self.ws_service.send_clipboard(content, source='auto')
            print_success(f"Sent clipboard: {len(content)} chars")

        await self.clipboard_service.start_monitoring(on_clipboard_change)
        await self._maintain_connection()

    async def _start_manual_mode(self) -> None:
        """Start manual hotkey mode."""
        print_info(f"Manual mode: press {self.config.hotkey} to send clipboard")

        self.hotkey_service = HotkeyService(self.config.log_level)

        async def send_current_clipboard() -> None:
            content = self.clipboard_service.get()
            if content:
                await self.ws_service.send_clipboard(content, source='manual')
                print_success(f"Sent clipboard: {len(content)} chars")
            else:
                print_warning("Clipboard is empty")

        # Start hotkey registration in background to avoid blocking
        async def setup_hotkeys() -> None:
            try:
                await self.hotkey_service.register(self.config.hotkey, send_current_clipboard)
                await self.hotkey_service.start()
                print_success(f"Hotkey {self.config.hotkey} is ready!")
            except Exception as e:
                print_error(f"Hotkey setup failed: {e}")
                raise

        # Use TaskGroup for automatic task lifecycle management
        async with asyncio.TaskGroup() as tg:
            # Start hotkey setup as background task
            tg.create_task(setup_hotkeys())

            # Start receive loop immediately to keep connection alive
            await self._maintain_connection()

        # TaskGroup automatically cancels and awaits all tasks on exit

    async def _maintain_connection(self) -> None:
        """Maintain WebSocket connection and listen for messages."""
        try:
            await self.ws_service.receive_loop(self.config.mode)
        except (KeyboardInterrupt, asyncio.CancelledError):
            pass

    async def _on_clipboard_received(self, msg: ClipboardTextMessage) -> None:
        """
        Handle received clipboard content from peer.

        Args:
            msg: Clipboard message from peer
        """
        success = self.clipboard_service.set(msg.content)
        if success:
            print_success(f"Received clipboard from {msg.from_peer} ({msg.source}): {len(msg.content)} chars")
        else:
            print_error("Failed to write clipboard")
