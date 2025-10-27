"""WebSocket service for communication with the relay server."""

from __future__ import annotations

import asyncio
import json
import uuid
from collections.abc import Awaitable, Callable
from contextlib import suppress
from typing import Any
from urllib.parse import urlparse

from python_socks.async_.asyncio import Proxy
from websockets.asyncio.client import ClientConnection, connect
from websockets.exceptions import ConnectionClosed, WebSocketException

from wsclip.config.settings import Settings
from wsclip.models.config import ProxyConfig
from wsclip.models.messages import (
    AuthMessage,
    AuthResponseMessage,
    BaseMessage,
    ClipboardSyncMode,
    ClipboardTextMessage,
    ErrorMessage,
    HeartbeatMessage,
    PeerEventMessage,
    TextMessage,
    dict_to_message,
    message_to_dict,
)
from wsclip.utils.logger import AppLogger

# Type alias for message handler
MessageHandler = Callable[[BaseMessage], Awaitable[None]]


class WebSocketService:
    """WebSocket client for peer-to-peer communication via relay server."""

    def __init__(
        self,
        worker_url: str,
        token: str,
        peer_id: str,
        log_level: str = Settings.DEFAULT_LOG_LEVEL,
        proxy: ProxyConfig | None = None,
        logger: AppLogger | None = None,
    ):
        """
        Initialize WebSocket service.

        Args:
            worker_url: Relay server WebSocket URL
            token: Pairing token
            peer_id: This peer's unique identifier
            log_level: Logging level
            proxy: Optional proxy configuration
            logger: Application logger (for user-facing messages)
        """
        self.worker_url = worker_url
        self.token = token
        self.peer_id = peer_id
        self.proxy = proxy

        # Unified logger (works for Console and TUI)
        self.logger: AppLogger
        if logger is None:
            # Fallback to console logger if not provided
            from wsclip.utils.logger import create_logger

            self.logger = create_logger(mode="console", component_name="websocket", log_level=log_level)
        else:
            self.logger = logger

        self.websocket: ClientConnection | None = None
        self.authenticated = False
        self.paired_peer: str | None = None
        self.session_id: str | None = None

        # Message handlers
        self._message_handlers: dict[str, MessageHandler] = {}

        # Running flag
        self._running = False

        # Heartbeat task
        self._heartbeat_task: asyncio.Task | None = None

    async def connect(self) -> bool:
        """
        Connect to WebSocket server and authenticate.

        Returns:
            True if connected and authenticated successfully
        """
        try:
            # Build WebSocket URL with query parameters
            ws_url = f"{self.worker_url}/ws?token={self.token}&peer_id={self.peer_id}"

            self.logger.debug(f"Initiating connection - peer_id: {self.peer_id}, token: {self.token[:8]}...")
            self.logger.info(f"Connecting to {self.worker_url}...")

            # Parse URL to get destination host and port
            parsed_url = urlparse(self.worker_url)
            dest_host = parsed_url.hostname
            dest_port = parsed_url.port or (443 if parsed_url.scheme == "wss" else 80)

            # Validate hostname
            if not dest_host:
                self.logger.error("Invalid worker URL: hostname not found")
                return False

            # Prepare connection parameters
            connect_params: dict[str, Any] = {
                "ping_interval": Settings.WS_PING_INTERVAL,
                "ping_timeout": Settings.WS_PING_TIMEOUT,
                "open_timeout": Settings.WS_CONNECT_TIMEOUT,
                "close_timeout": None,  # No timeout for closing handshake
            }

            # Connect via SOCKS5 proxy if enabled
            if self.proxy and self.proxy.enabled:
                try:
                    self.logger.debug(
                        f"Using SOCKS5 proxy: {self.proxy.host}:{self.proxy.port}, "
                        f"auth: {bool(self.proxy.auth.username)}"
                    )
                    self.logger.info(f"Connecting via SOCKS5 proxy {self.proxy.host}:{self.proxy.port}...")

                    # Build proxy URL
                    if self.proxy.auth.username and self.proxy.auth.password:
                        proxy_url = f"socks5://{self.proxy.auth.username}:{self.proxy.auth.password}@{self.proxy.host}:{self.proxy.port}"
                    else:
                        proxy_url = f"socks5://{self.proxy.host}:{self.proxy.port}"

                    # Create proxy connection
                    proxy = Proxy.from_url(proxy_url)
                    proxy_sock = await proxy.connect(dest_host=dest_host, dest_port=dest_port)

                    # Connect WebSocket through proxy socket
                    # proxy_sock is socket-like object, websockets accepts it
                    connect_params_with_sock: dict[str, Any] = {**connect_params, "sock": proxy_sock}
                    self.websocket = await connect(ws_url, **connect_params_with_sock)

                except ConnectionRefusedError:
                    self.logger.error(f"SOCKS5 proxy at {self.proxy.host}:{self.proxy.port} not responding")
                    return False
                except Exception as e:
                    self.logger.error(f"Proxy connection failed: {e}")
                    return False
            else:
                # Direct connection (no proxy)
                self.logger.debug(f"Direct connection to {dest_host}:{dest_port}")
                self.websocket = await connect(ws_url, **connect_params)

            self.logger.debug("WebSocket handshake completed successfully")
            self.logger.info("WebSocket connected, authenticating...")

            # Send authentication message
            auth_msg = AuthMessage(token=self.token, peer_id=self.peer_id)
            self.logger.debug(f"Sending auth message: token={self.token[:8]}..., peer_id={self.peer_id}")
            await self._send_message(auth_msg)

            # Wait for auth response
            self.logger.debug("Waiting for auth response from server...")
            response = await self._receive_message()

            if isinstance(response, AuthResponseMessage):
                self.logger.debug(
                    f"Auth response received: success={response.success}, "
                    f"session_id={response.session_id}, paired_peer={response.paired_peer}"
                )
                if response.success:
                    self.authenticated = True
                    self.session_id = response.session_id
                    self.paired_peer = response.paired_peer

                    self.logger.info(f"Authenticated! Session: {self.session_id}")

                    if self.paired_peer:
                        self.logger.info(f"Paired with peer: {self.paired_peer}")
                    else:
                        self.logger.info("Waiting for peer to connect...")

                    return True
                else:
                    self.logger.error(f"Authentication failed: {response.error}")
                    return False
            else:
                self.logger.error(f"Unexpected response: {type(response)}")
                return False

        except WebSocketException as e:
            self.logger.error(f"WebSocket error: {e}")
            self.logger.error(f"Connection failed: {e}")
            return False
        except Exception as e:
            self.logger.error(f"Unexpected error: {e}")
            self.logger.error(f"Failed to connect: {e}")
            return False

    async def disconnect(self) -> None:
        """Disconnect from WebSocket server with proper cleanup."""
        self.logger.debug("Starting disconnect sequence...")
        self._running = False

        # Step 1: Cancel heartbeat task first (if not already cancelled)
        if self._heartbeat_task:
            if self._heartbeat_task.done():
                self.logger.debug("Heartbeat task already completed/cancelled")
            else:
                self.logger.debug("Cancelling heartbeat task...")
                self._heartbeat_task.cancel()
                with suppress(asyncio.CancelledError):
                    await self._heartbeat_task
                self.logger.debug("Heartbeat task cancelled")
            self._heartbeat_task = None

        # Step 2: Close WebSocket connection and cancel all internal tasks
        websocket = self.websocket
        if websocket:
            try:
                # Try graceful close with timeout (2s is reasonable for network roundtrip)
                self.logger.debug("Attempting graceful WebSocket close (timeout: 2s)...")
                await asyncio.wait_for(websocket.close(code=1000, reason="Client disconnect"), timeout=2.0)
                self.logger.debug("WebSocket closed gracefully")
            except (TimeoutError, asyncio.CancelledError):
                # If timeout or cancelled, force close and cancel all websocket tasks
                self.logger.debug("Graceful close timed out, forcing WebSocket closure")
                try:
                    # Get all tasks related to this websocket and cancel them
                    current_tasks = [t for t in asyncio.all_tasks() if not t.done()]
                    for task in current_tasks:
                        # Cancel tasks that belong to websocket connection (keepalive, etc)
                        if hasattr(task, "get_coro") and "keepalive" in str(task.get_coro()):
                            task.cancel()
                            self.logger.debug(f"Cancelled websocket internal task: {task.get_name()}")
                except Exception as e:
                    self.logger.debug(f"Error cancelling websocket tasks: {e}")
            except Exception as e:
                self.logger.debug(f"Error closing WebSocket: {e}")
            finally:
                self.websocket = None

        # Step 3: Clear state
        self.authenticated = False
        self.paired_peer = None
        self.logger.debug("WebSocket state cleared (authenticated=False, paired_peer=None)")
        self.logger.info("Disconnected")

    async def send_clipboard(self, content: str, source: ClipboardSyncMode = ClipboardSyncMode.MANUAL) -> None:
        """
        Send clipboard content to paired peer.

        Args:
            content: Clipboard text content
            source: Origin of clipboard ('auto' or 'manual')
        """
        if not self.authenticated:
            self.logger.warning("Attempted to send clipboard while not authenticated")
            self.logger.error("Not authenticated")
            return

        # Validate size before sending
        content_size = len(content.encode("utf-8"))
        self.logger.debug(
            f"Preparing to send clipboard: size={content_size} bytes, source={source.value}, "
            f"preview={content[:50]}..."
        )
        if content_size > Settings.MAX_MESSAGE_SIZE:
            self.logger.warning(f"Clipboard exceeds max size: {content_size} > {Settings.MAX_MESSAGE_SIZE}")
            self.logger.error(
                f"Clipboard too large: {content_size / 1024 / 1024:.1f}MB "
                f"(max: {Settings.MAX_MESSAGE_SIZE / 1024 / 1024:.1f}MB)"
            )
            return

        message = ClipboardTextMessage(
            from_peer=self.peer_id,
            content=content,
            message_id=str(uuid.uuid4()),
            source=source,
        )

        await self._send_message(message)
        self.logger.debug(
            f"Clipboard sent successfully: msg_id={message.message_id}, chars={len(content)}, source={source.value}"
        )
        self.logger.debug(f"Sent clipboard ({source.value}): {len(content)} chars")

    async def _heartbeat_loop(self) -> None:
        """Send periodic heartbeat messages to keep connection alive."""
        self.logger.debug(f"Heartbeat loop started (interval: {Settings.WS_HEARTBEAT_INTERVAL}s)")
        try:
            while self._running and self.websocket:
                # Wait first to avoid redundant heartbeat on connection
                await asyncio.sleep(Settings.WS_HEARTBEAT_INTERVAL)

                if self._running and self.websocket:
                    heartbeat = HeartbeatMessage(peer_id=self.peer_id)
                    await self._send_message(heartbeat)
                    self.logger.debug(f"Heartbeat sent (next in {Settings.WS_HEARTBEAT_INTERVAL}s)")
        except asyncio.CancelledError:
            self.logger.debug("Heartbeat loop cancelled")
            raise
        except Exception as e:
            self.logger.error(f"Heartbeat loop error: {e}", exc_info=True)
            self.logger.error(f"Error in heartbeat loop: {e}")

    async def receive_loop(self, mode: ClipboardSyncMode = ClipboardSyncMode.MANUAL) -> None:
        """
        Listen for incoming messages (blocking).
        Runs until disconnect() is called or connection is lost.

        Args:
            mode: Sync mode ('auto' or 'manual') for user-friendly messaging
        """
        if not self.authenticated:
            self.logger.error("Not authenticated, cannot listen")
            return

        try:
            self._running = True

            # Start heartbeat task
            self._heartbeat_task = asyncio.create_task(self._heartbeat_loop())

            while self._running and self.websocket:
                message = await self._receive_message()

                if message:
                    await self._handle_message(message)

        except (KeyboardInterrupt, asyncio.CancelledError):
            self._running = False
        except ConnectionClosed as e:
            self.logger.warning(f"Connection closed: code={e.code}, reason={e.reason}")

            # User-friendly messages based on close code
            if e.code == 1000:
                self.logger.info("Connection closed normally")
            elif e.code == 1001:
                self.logger.warning("Server is going away (maintenance?)")
            elif e.code == 1006:
                self.logger.error("Connection lost unexpectedly (check network)")
            elif e.code == 1008:
                self.logger.error("Server rejected connection (policy violation)")
            else:
                reason = e.reason or "Unknown reason"
                self.logger.warning(f"Connection closed by server: {reason} (code: {e.code})")

            self._running = False
        except WebSocketException as e:
            self.logger.error(f"WebSocket error: {e}")
            self.logger.error(f"Connection lost: {e}")
            raise
        except Exception as e:
            # Don't log if it's an event loop closed error during shutdown
            if "Event loop is closed" not in str(e):
                self.logger.error(f"Error in receive loop: {e}")
                self.logger.error(f"Unexpected error: {e}")
            self._running = False
        finally:
            # Cancel heartbeat task (ignore errors during shutdown)
            if self._heartbeat_task and not self._heartbeat_task.done():
                self._heartbeat_task.cancel()
                with suppress(asyncio.CancelledError, RuntimeError):
                    await self._heartbeat_task

    def register_handler(self, message_type: str, handler: MessageHandler) -> None:
        """
        Register a custom message handler.

        Args:
            message_type: Type of message to handle
            handler: Async function to call when message is received
        """
        self._message_handlers[message_type] = handler

    def is_connected(self) -> bool:
        """Check if WebSocket is connected and authenticated."""
        return self.authenticated and self.websocket is not None

    async def _send_message(self, message: BaseMessage) -> None:
        """Send a message object via WebSocket."""
        websocket = self.websocket
        if not websocket:
            raise RuntimeError("WebSocket not connected")

        data = message_to_dict(message)
        await websocket.send(json.dumps(data))

    async def _receive_message(self) -> BaseMessage | None:
        """Receive and parse message from WebSocket."""
        websocket = self.websocket
        if not websocket:
            return None

        try:
            raw = await websocket.recv()

            if isinstance(raw, bytes):
                raw = raw.decode("utf-8")

            data = json.loads(raw)
            return dict_to_message(data)

        except ConnectionClosed as e:
            self.logger.warning(f"WebSocket connection closed: {e}")
            raise  # Re-raise to be handled by receive_loop
        except json.JSONDecodeError as e:
            self.logger.error(f"Failed to parse message: {e}")
            return None

    async def _handle_message(self, message: BaseMessage) -> None:
        """Handle received message."""
        # Check for custom handler
        if message.type in self._message_handlers:
            await self._message_handlers[message.type](message)
            return

        # Default handlers using pattern matching
        match message:
            case TextMessage(from_peer=peer, content=content):
                self.logger.info(f"Message from {peer}: {content}")

            case PeerEventMessage(type="peer_connected", peer_id=peer_id):
                self.paired_peer = peer_id
                self.logger.info(f"Peer connected: {peer_id}")

            case PeerEventMessage(type="peer_disconnected", peer_id=peer_id):
                self.logger.warning(f"Peer disconnected: {peer_id}")
                self.paired_peer = None

            case ErrorMessage(code=code, message=error_message):
                self.logger.error(f"Server error [{code}]: {error_message}")

            case ClipboardTextMessage(from_peer=peer, content=content, source=source):
                self.logger.info(f"Clipboard from {peer} [{source.value}]: {len(content)} chars")

            case _:
                self.logger.warning(f"Unhandled message type: {message.type}")
