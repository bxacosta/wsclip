"""
WebSocket client for connecting to Cloudflare Worker relay
"""
import asyncio
import json
import uuid
from typing import Optional, Callable, Awaitable
from websockets.client import connect, WebSocketClientProtocol
from websockets.exceptions import WebSocketException

from ..models.message import (
    AuthMessage,
    AuthResponseMessage,
    TextMessage,
    ClipboardTextMessage,
    PeerEventMessage,
    ErrorMessage,
    BaseMessage,
    message_to_dict,
    dict_to_message,
)
from ..utils.logger import setup_logger, print_message, print_info, print_warning, print_error, print_success
from ..constants import WS_CONNECT_TIMEOUT, WS_PING_INTERVAL, WS_PING_TIMEOUT
from .reconnect_strategy import ReconnectionStrategy


# Type alias for message handler
MessageHandler = Callable[[BaseMessage], Awaitable[None]]


class WebSocketClient:
    """
    WebSocket client for peer-to-peer communication via Worker relay
    """

    def __init__(
        self,
        worker_url: str,
        token: str,
        peer_id: str,
        log_level: str = "INFO",
        enable_reconnect: bool = True
    ):
        """
        Initialize WebSocket client

        Args:
            worker_url: Cloudflare Worker WebSocket URL
            token: Pairing token
            peer_id: This peer's unique identifier
            log_level: Logging level
            enable_reconnect: Enable automatic reconnection (Phase 2)
        """
        self.worker_url = worker_url
        self.token = token
        self.peer_id = peer_id
        self.logger = setup_logger(f"ws_client.{peer_id}", log_level)

        self.websocket: Optional[WebSocketClientProtocol] = None
        self.authenticated = False
        self.paired_peer: Optional[str] = None
        self.session_id: Optional[str] = None

        # Message handlers
        self._message_handlers: dict[str, MessageHandler] = {}

        # Running flag
        self._running = False

        # Phase 2: Reconnection
        self.enable_reconnect = enable_reconnect
        self.reconnect_strategy = ReconnectionStrategy() if enable_reconnect else None
        self._connection_task: Optional[asyncio.Task] = None

    async def connect(self) -> bool:
        """
        Connect to WebSocket server and authenticate

        Returns:
            True if connected and authenticated successfully
        """
        try:
            # Build WebSocket URL with query parameters
            ws_url = f"{self.worker_url}/ws?token={self.token}&peer_id={self.peer_id}"

            self.logger.info(f"Connecting to {self.worker_url}...")

            # Connect with ping settings
            self.websocket = await connect(
                ws_url,
                ping_interval=WS_PING_INTERVAL,
                ping_timeout=WS_PING_TIMEOUT,
                open_timeout=WS_CONNECT_TIMEOUT,
            )

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
        """Disconnect from WebSocket server"""
        self._running = False

        if self.websocket:
            try:
                # Try to close gracefully with timeout
                await asyncio.wait_for(self.websocket.close(), timeout=2.0)
            except (Exception, asyncio.TimeoutError, asyncio.CancelledError):
                # Ignore all errors during disconnect (including timeout and cancellation)
                pass
            finally:
                self.websocket = None

        self.authenticated = False
        self.logger.info("Disconnected")

    async def send_text(self, content: str) -> None:
        """
        Send text message to paired peer

        Args:
            content: Text content to send
        """
        if not self.authenticated:
            print_error("Not authenticated")
            return

        # Create text message
        msg = TextMessage(
            from_peer=self.peer_id,
            content=content,
            message_id=str(uuid.uuid4()),
        )

        await self._send_message(msg)
        self.logger.debug(f"Sent text message: {msg.message_id}")

    async def listen(self) -> None:
        """
        Listen for incoming messages (blocking)
        Runs until disconnect() is called or connection is lost
        """
        if not self.authenticated:
            print_error("Not authenticated, cannot listen")
            return

        print_info("Listening for messages... (Ctrl+C to stop)")

        try:
            while self._running and self.websocket:
                msg = await self._receive_message()

                if msg:
                    await self._handle_message(msg)

        except (KeyboardInterrupt, asyncio.CancelledError):
            # Graceful shutdown - signal to stop
            self._running = False
        except WebSocketException as e:
            self.logger.error(f"WebSocket error: {e}")
            print_error(f"Connection lost: {e}")
        except Exception as e:
            self.logger.error(f"Error in listen loop: {e}")
            print_error(f"Unexpected error: {e}")

    def register_handler(self, message_type: str, handler: MessageHandler) -> None:
        """
        Register a custom message handler

        Args:
            message_type: Type of message to handle
            handler: Async function to call when message is received
        """
        self._message_handlers[message_type] = handler

    async def _send_message(self, message: BaseMessage) -> None:
        """Send a message object via WebSocket"""
        if not self.websocket:
            raise RuntimeError("WebSocket not connected")

        data = message_to_dict(message)
        await self.websocket.send(json.dumps(data))

    async def _receive_message(self) -> Optional[BaseMessage]:
        """Receive and parse message from WebSocket"""
        if not self.websocket:
            return None

        try:
            raw = await self.websocket.recv()

            if isinstance(raw, bytes):
                raw = raw.decode('utf-8')

            data = json.loads(raw)
            return dict_to_message(data)

        except json.JSONDecodeError as e:
            self.logger.error(f"Failed to parse message: {e}")
            return None

    async def _handle_message(self, message: BaseMessage) -> None:
        """Handle received message"""
        msg_type = message.type

        # Check for custom handler
        if msg_type in self._message_handlers:
            await self._message_handlers[msg_type](message)
            return

        # Default handlers
        if isinstance(message, TextMessage):
            print_message(message.from_peer, message.content)

        elif isinstance(message, PeerEventMessage):
            if message.type == 'peer_connected':
                self.paired_peer = message.peer_id
                print_success(f"Peer connected: {message.peer_id}")
            else:
                print_warning(f"Peer disconnected: {message.peer_id}")
                self.paired_peer = None

        elif isinstance(message, ErrorMessage):
            print_error(f"Server error [{message.code}]: {message.message}")

        elif isinstance(message, ClipboardTextMessage):
            # Phase 2: Default handler for clipboard messages
            print_message(message.from_peer, f"[Clipboard {message.source}] {message.content[:50]}...")

        else:
            self.logger.warning(f"Unhandled message type: {msg_type}")

    async def connect_with_retry(self) -> bool:
        """
        Connect with automatic retry (Phase 2)

        Returns:
            True if connected, False if failed after all retries
        """
        if not self.enable_reconnect or not self.reconnect_strategy:
            return await self.connect()

        return await self.reconnect_strategy.connect_with_retry(self.connect)

    async def send_clipboard(self, content: str, source: str) -> None:
        """
        Send clipboard content to peer (Phase 2)

        Args:
            content: Clipboard text content
            source: Origin of clipboard ('auto' or 'manual')
        """
        if not self.authenticated:
            print_error("Not authenticated")
            return

        # Create clipboard message
        msg = ClipboardTextMessage(
            from_peer=self.peer_id,
            content=content,
            message_id=str(uuid.uuid4()),
            source=source  # type: ignore
        )

        await self._send_message(msg)
        self.logger.debug(f"Sent clipboard ({source}): {len(content)} chars")

    async def maintain_connection(self) -> None:
        """
        Maintain connection with auto-reconnect (Phase 2)
        Runs in background, reconnects on disconnect
        """
        self._running = True

        while self.enable_reconnect and self._running:
            try:
                # Only connect if not already connected
                if not self.authenticated or not self.websocket:
                    connected = await self.connect_with_retry()

                    if not connected:
                        print_error("Failed to establish connection")
                        break

                # Listen for messages (blocks until disconnect)
                await self.listen()

            except asyncio.CancelledError:
                break
            except Exception as e:
                self.logger.error(f"Connection error: {e}")
                await asyncio.sleep(1)
