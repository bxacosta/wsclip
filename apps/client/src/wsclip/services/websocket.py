"""WebSocket service for communication with the relay server."""
from __future__ import annotations

import asyncio
import json
import uuid
from collections.abc import Callable, Awaitable
from urllib.parse import urlparse

from python_socks.async_.asyncio import Proxy
from websockets.client import connect, WebSocketClientProtocol
from websockets.exceptions import WebSocketException, ConnectionClosed

from ..config.constants import WS_CONNECT_TIMEOUT, WS_PING_INTERVAL, WS_PING_TIMEOUT, WS_HEARTBEAT_INTERVAL
from ..config.settings import Settings
from ..models.config import ProxyConfig
from ..models.messages import (
    AuthMessage,
    AuthResponseMessage,
    TextMessage,
    ClipboardTextMessage,
    PeerEventMessage,
    HeartbeatMessage,
    ErrorMessage,
    BaseMessage,
    message_to_dict,
    dict_to_message,
)
from ..utils.logger import setup_logger, print_message, print_info, print_warning, print_error, print_success

# Type alias for message handler
MessageHandler = Callable[[BaseMessage], Awaitable[None]]


class WebSocketService:
    """WebSocket client for peer-to-peer communication via relay server."""

    def __init__(
            self,
            worker_url: str,
            token: str,
            peer_id: str,
            log_level: str = "INFO",
            proxy: ProxyConfig | None = None
    ):
        """
        Initialize WebSocket service.

        Args:
            worker_url: Relay server WebSocket URL
            token: Pairing token
            peer_id: This peer's unique identifier
            log_level: Logging level
            proxy: Optional proxy configuration
        """
        self.worker_url = worker_url
        self.token = token
        self.peer_id = peer_id
        self.proxy = proxy
        self.logger = setup_logger(f"ws_service.{peer_id}", log_level)

        self.websocket: WebSocketClientProtocol | None = None
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

            self.logger.info(f"Connecting to {self.worker_url}...")

            # Parse URL to get destination host and port
            parsed_url = urlparse(self.worker_url)
            dest_host = parsed_url.hostname
            dest_port = parsed_url.port or (443 if parsed_url.scheme == 'wss' else 80)

            # Prepare connection parameters
            connect_params = {
                'ping_interval': WS_PING_INTERVAL,
                'ping_timeout': WS_PING_TIMEOUT,
                'open_timeout': WS_CONNECT_TIMEOUT,
                'close_timeout': None,  # No timeout for closing handshake
            }

            # Connect via SOCKS5 proxy if enabled
            if self.proxy and self.proxy.enabled:
                try:
                    self.logger.info(f"Connecting via SOCKS5 proxy {self.proxy.host}:{self.proxy.port}...")

                    # Build proxy URL
                    if self.proxy.username and self.proxy.password:
                        proxy_url = f"socks5://{self.proxy.username}:{self.proxy.password}@{self.proxy.host}:{self.proxy.port}"
                    else:
                        proxy_url = f"socks5://{self.proxy.host}:{self.proxy.port}"

                    # Create proxy connection
                    proxy = Proxy.from_url(proxy_url)
                    proxy_sock = await proxy.connect(dest=dest_host, port=dest_port)

                    # Connect WebSocket through proxy socket
                    connect_params['sock'] = proxy_sock
                    self.websocket = await connect(ws_url, **connect_params)

                except ConnectionRefusedError:
                    print_error(f"SOCKS5 proxy at {self.proxy.host}:{self.proxy.port} not responding")
                    return False
                except Exception as e:
                    print_error(f"Proxy connection failed: {e}")
                    return False
            else:
                # Direct connection (no proxy)
                self.websocket = await connect(ws_url, **connect_params)

            self.logger.info("WebSocket connected, authenticating...")

            # Send authentication message
            auth_msg = AuthMessage(token=self.token, peer_id=self.peer_id)
            await self._send_message(auth_msg)

            # Wait for auth response
            response = await self._receive_message()

            if isinstance(response, AuthResponseMessage):
                if response.success:
                    self.authenticated = True
                    self.session_id = response.session_id
                    self.paired_peer = response.paired_peer

                    print_success(f"Authenticated! Session: {self.session_id}")

                    if self.paired_peer:
                        print_info(f"Paired with: {self.paired_peer}")
                    else:
                        print_info("Waiting for peer to connect...")

                    return True
                else:
                    print_error(f"Authentication failed: {response.error}")
                    return False
            else:
                print_error(f"Unexpected response: {type(response)}")
                return False

        except WebSocketException as e:
            self.logger.error(f"WebSocket error: {e}")
            print_error(f"Connection failed: {e}")
            return False
        except Exception as e:
            self.logger.error(f"Unexpected error: {e}")
            print_error(f"Failed to connect: {e}")
            return False

    async def disconnect(self) -> None:
        """Disconnect from WebSocket server."""
        self._running = False

        if self.websocket:
            try:
                await asyncio.wait_for(self.websocket.close(), timeout=2.0)
            except (Exception, asyncio.TimeoutError, asyncio.CancelledError):
                pass
            finally:
                self.websocket = None

        self.authenticated = False
        self.logger.info("Disconnected")

    async def send_clipboard(self, content: str, source: str = "manual") -> None:
        """
        Send clipboard content to paired peer.

        Args:
            content: Clipboard text content
            source: Origin of clipboard ('auto' or 'manual')
        """
        if not self.authenticated:
            print_error("Not authenticated")
            return

        # Validate size before sending
        content_size = len(content.encode('utf-8'))
        if content_size > Settings.MAX_MESSAGE_SIZE:
            print_error(
                f"Clipboard too large: {content_size / 1024 / 1024:.1f}MB "
                f"(max: {Settings.MAX_MESSAGE_SIZE / 1024 / 1024:.1f}MB)"
            )
            return

        msg = ClipboardTextMessage(
            from_peer=self.peer_id,
            content=content,
            message_id=str(uuid.uuid4()),
            source=source  # type: ignore
        )

        await self._send_message(msg)
        self.logger.debug(f"Sent clipboard ({source}): {len(content)} chars")

    async def _heartbeat_loop(self) -> None:
        """Send periodic heartbeat messages to keep connection alive."""
        try:
            while self._running and self.websocket:
                # Wait first to avoid redundant heartbeat on connection
                await asyncio.sleep(WS_HEARTBEAT_INTERVAL)

                if self._running and self.websocket:
                    heartbeat = HeartbeatMessage(peer_id=self.peer_id)
                    await self._send_message(heartbeat)
                    self.logger.debug(f"Heartbeat sent (next in {WS_HEARTBEAT_INTERVAL}s)")
        except asyncio.CancelledError:
            self.logger.debug("Heartbeat loop cancelled")
            raise
        except Exception as e:
            self.logger.error(f"Error in heartbeat loop: {e}")

    async def receive_loop(self, mode: str = "manual") -> None:
        """
        Listen for incoming messages (blocking).
        Runs until disconnect() is called or connection is lost.

        Args:
            mode: Sync mode ('auto' or 'manual') for user-friendly messaging
        """
        if not self.authenticated:
            print_error("Not authenticated, cannot listen")
            return

        if mode == "auto":
            print_info("Monitoring clipboard changes... (Ctrl+C to stop)")
        else:
            print_info("Ready to send clipboard (Ctrl+C to stop)")

        try:
            self._running = True

            # Start heartbeat task
            self._heartbeat_task = asyncio.create_task(self._heartbeat_loop())

            while self._running and self.websocket:
                msg = await self._receive_message()

                if msg:
                    await self._handle_message(msg)

        except (KeyboardInterrupt, asyncio.CancelledError):
            self._running = False
        except ConnectionClosed as e:
            self.logger.warning(f"Connection closed: code={e.code}, reason={e.reason}")

            # User-friendly messages based on close code
            if e.code == 1000:
                print_info("Connection closed normally")
            elif e.code == 1001:
                print_warning("Server is going away (maintenance?)")
            elif e.code == 1006:
                print_error("Connection lost unexpectedly (check network)")
            elif e.code == 1008:
                print_error("Server rejected connection (policy violation)")
            else:
                reason = e.reason or "Unknown reason"
                print_warning(f"Connection closed by server: {reason} (code: {e.code})")

            self._running = False
        except WebSocketException as e:
            self.logger.error(f"WebSocket error: {e}")
            print_error(f"Connection lost: {e}")
            raise
        except Exception as e:
            self.logger.error(f"Error in receive loop: {e}")
            print_error(f"Unexpected error: {e}")
            raise
        finally:
            # Cancel heartbeat task
            if self._heartbeat_task and not self._heartbeat_task.done():
                self._heartbeat_task.cancel()
                try:
                    await self._heartbeat_task
                except asyncio.CancelledError:
                    pass

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
        if not self.websocket:
            raise RuntimeError("WebSocket not connected")

        data = message_to_dict(message)
        await self.websocket.send(json.dumps(data))

    async def _receive_message(self) -> BaseMessage | None:
        """Receive and parse message from WebSocket."""
        if not self.websocket:
            return None

        try:
            raw = await self.websocket.recv()

            if isinstance(raw, bytes):
                raw = raw.decode('utf-8')

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
                print_message(peer, content)

            case PeerEventMessage(type='peer_connected', peer_id=peer_id):
                self.paired_peer = peer_id
                print_success(f"Peer connected: {peer_id}")

            case PeerEventMessage(type='peer_disconnected', peer_id=peer_id):
                print_warning(f"Peer disconnected: {peer_id}")
                self.paired_peer = None

            case ErrorMessage(code=code, message=msg):
                print_error(f"Server error [{code}]: {msg}")

            case ClipboardTextMessage(from_peer=peer, content=content, source=source):
                print_message(peer, f"[Clipboard {source}] {content[:50]}...")

            case _:
                self.logger.warning(f"Unhandled message type: {message.type}")
