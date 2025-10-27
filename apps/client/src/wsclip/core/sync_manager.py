"""Sync manager for orchestrating clipboard synchronization."""

from __future__ import annotations

import asyncio
from contextlib import suppress
from pathlib import Path

from wsclip.core.connection import ReconnectionStrategy
from wsclip.models.config import AppConfig
from wsclip.models.messages import BaseMessage, ClipboardSyncMode, ClipboardTextMessage
from wsclip.services.clipboard import ClipboardService
from wsclip.services.hotkeys import HotkeyService
from wsclip.services.websocket import WebSocketService
from wsclip.utils.logger import create_logger
from wsclip.utils.tui import TUIManager


class SyncManager:
    """Orchestrates clipboard synchronization between peers."""

    def __init__(self, config: AppConfig, tui_mode: bool = False):
        """
        Initialize sync manager.

        Args:
            config: Application configuration
            tui_mode: Enable TUI mode (default: False for console mode)
        """
        self.config = config
        self.tui_mode = tui_mode

        # TUI Manager (only if TUI mode enabled)
        self.tui = TUIManager(config) if tui_mode else None

        # Create unified logger
        self.logger = create_logger(
            mode="tui" if tui_mode else "console",
            tui_manager=self.tui,
            component_name="sync_manager",
        )

        # Services with logger
        self.ws_service = WebSocketService(
            worker_url=config.connection.worker_url,
            token=config.connection.token,
            peer_id=config.connection.peer_id,
            log_level=config.logging.level,
            proxy=config.proxy,
            logger=create_logger(
                mode="tui" if tui_mode else "console",
                tui_manager=self.tui,
                component_name="websocket",
            ),
        )

        self.clipboard_service = ClipboardService(
            poll_interval=config.clipboard.poll_interval,
            max_size_bytes=config.clipboard.max_size_mb * 1024 * 1024,
            app_logger=create_logger(
                mode="tui" if tui_mode else "console",
                tui_manager=self.tui,
                component_name="clipboard",
            ),
        )

        self.hotkey_service: HotkeyService | None = None

        # Register message handlers
        self.ws_service.register_handler("clipboard_text", self._on_clipboard_received)

    @classmethod
    def from_config(cls, config_path: Path | None = None) -> SyncManager:
        """
        Create SyncManager from config file.

        Args:
            config_path: Path to configuration file (default: XDG config path)

        Returns:
            Initialized SyncManager instance
        """
        config = AppConfig.from_json(config_path)
        return cls(config)

    async def start(self, mode: ClipboardSyncMode | None = None) -> None:
        """
        Start clipboard synchronization.

        Args:
            mode: Sync mode ('auto' or 'manual'), uses config if not provided
        """
        if mode:
            self.logger.debug(
                f"Overriding sync mode from config: {self.config.clipboard.sync_mode.value} -> {mode.value}"
            )
            self.config.clipboard.sync_mode = mode

        # Start TUI if in TUI mode and not already started
        if self.tui_mode and self.tui and not self.tui.live:
            self.logger.debug("Starting TUI interface...")
            self.tui.start()

        self.logger.debug(
            f"Sync manager starting: mode={self.config.clipboard.sync_mode.value}, "
            f"tui_mode={self.tui_mode}, peer_id={self.config.connection.peer_id}"
        )
        self.logger.info("Starting clipboard sync...")

        # Update TUI status if in TUI mode
        if self.tui:
            self.tui.update_status(connection_status="Connecting...")

        # Connect with retry
        self.logger.debug("Initiating WebSocket connection sequence...")
        connected = await self._connect_with_retry()
        if not connected:
            self.logger.error("Failed to establish connection")
            return

        # Start mode-specific sync
        if self.config.clipboard.sync_mode == ClipboardSyncMode.AUTO:
            self.logger.debug("Starting AUTO sync mode")
            await self._start_auto_mode()
        elif self.config.clipboard.sync_mode == ClipboardSyncMode.MANUAL:
            self.logger.debug("Starting MANUAL sync mode")
            await self._start_manual_mode()

    async def _connect_with_retry(self) -> bool:
        """
        Connect to WebSocket server with optional automatic retry.

        Returns:
            True if connected successfully, False otherwise
        """
        # Direct connection if reconnect disabled
        if not self.config.connection.reconnect.enabled:
            return await self.ws_service.connect()

        # Connect with retry strategy
        reconnect_strategy = ReconnectionStrategy(
            max_attempts=self.config.connection.reconnect.max_attempts,
            logger=create_logger(
                mode="tui" if self.tui_mode else "console",
                tui_manager=self.tui,
                component_name="reconnect",
            ),
        )
        return await reconnect_strategy.connect_with_retry(self.ws_service.connect)

    async def stop(self) -> None:
        """Stop clipboard synchronization."""
        self.logger.debug("Stopping sync manager...")
        try:
            if self.config.clipboard.sync_mode == ClipboardSyncMode.AUTO:
                self.logger.debug("Stopping clipboard monitoring...")
                await self.clipboard_service.stop_monitoring()
            elif self.config.clipboard.sync_mode == ClipboardSyncMode.MANUAL and self.hotkey_service:
                # Don't log here - hotkey_service.stop() already logs
                self.hotkey_service.stop()

            self.logger.debug("Disconnecting WebSocket...")
            await self.ws_service.disconnect()
            # Don't log "Disconnected" here - ws_service.disconnect() already does it

            # Stop TUI if in TUI mode
            if self.tui:
                self.logger.debug("Stopping TUI interface...")
                self.tui.stop()
        except Exception as e:
            self.logger.debug(f"Error during shutdown: {e}")
            pass

    async def _start_auto_mode(self) -> None:
        """Start automatic clipboard monitoring mode."""
        self.logger.info("Auto mode: monitoring clipboard...")

        async def on_clipboard_change(content: str) -> None:
            await self.ws_service.send_clipboard(content, source=ClipboardSyncMode.AUTO)
            self.logger.info(f"Sent clipboard: {len(content)} chars")

        # Start clipboard monitoring as background task
        monitor_task = asyncio.create_task(self.clipboard_service.start_monitoring(on_clipboard_change))

        try:
            # Start receive loop (blocks until disconnect or error)
            # Let KeyboardInterrupt propagate naturally for clean shutdown
            await self.ws_service.receive_loop(self.config.clipboard.sync_mode)
        finally:
            # Cleanup: cancel monitoring task
            if not monitor_task.done():
                monitor_task.cancel()
                with suppress(asyncio.CancelledError):
                    await monitor_task

    async def _start_manual_mode(self) -> None:
        """Start manual hotkey mode."""
        from wsclip.utils.tui import format_hotkey

        hotkey_display = format_hotkey(self.config.clipboard.hotkey)
        self.logger.info(f"Manual mode: Use {hotkey_display} to send clipboard")

        self.hotkey_service = HotkeyService(self.config.logging.level)

        async def send_current_clipboard() -> None:
            content = self.clipboard_service.get()
            if content:
                await self.ws_service.send_clipboard(content, source=ClipboardSyncMode.MANUAL)
                self.logger.info(f"Sent clipboard: {len(content)} chars")
            else:
                self.logger.warning("Clipboard is empty")

        # Setup hotkeys (quick operation, no need for background task)
        if self.hotkey_service:
            try:
                await self.hotkey_service.register(self.config.clipboard.hotkey, send_current_clipboard)
                await self.hotkey_service.start()
                self.logger.info(f"Hotkey {hotkey_display} is ready!")
            except Exception as e:
                self.logger.error(f"Hotkey setup failed: {e}")
                raise

        # Start receive loop (blocks until disconnect or error)
        # Let KeyboardInterrupt propagate naturally for clean shutdown
        await self.ws_service.receive_loop(self.config.clipboard.sync_mode)

    async def _on_clipboard_received(self, message: BaseMessage) -> None:
        """
        Handle received clipboard content from peer.

        Args:
            message: Clipboard message from peer
        """
        # Type guard: only process ClipboardTextMessage
        if not isinstance(message, ClipboardTextMessage):
            return

        # After isinstance check, msg is narrowed to ClipboardTextMessage
        success = self.clipboard_service.set(message.content)
        if success:
            self.logger.info(
                f"Received clipboard from {message.from_peer} ({message.source}): {len(message.content)} chars"
            )
        else:
            self.logger.error("Failed to write clipboard")
