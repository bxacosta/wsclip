"""Data models for WebSocket messages."""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime
from enum import Enum

from wsclip.config.constants import MessageField


class MessageType(str, Enum):
    """WebSocket message types."""

    AUTH = "auth"
    AUTH_RESPONSE = "auth_response"
    TEXT_MESSAGE = "text_message"
    CLIPBOARD_TEXT = "clipboard_text"
    PEER_CONNECTED = "peer_connected"
    PEER_DISCONNECTED = "peer_disconnected"
    HEARTBEAT = "heartbeat"
    ERROR = "error"


class ErrorCode(str, Enum):
    """Error codes for error messages."""

    TOKEN_INVALID = "TOKEN_INVALID"
    PEER_LIMIT = "PEER_LIMIT"
    ALREADY_CONNECTED = "ALREADY_CONNECTED"
    INTERNAL_ERROR = "INTERNAL_ERROR"


class ClipboardSyncMode(str, Enum):
    """Clipboard synchronization mode."""

    AUTO = "auto"
    MANUAL = "manual"


@dataclass
class BaseMessage:
    """Base message class with common fields."""

    type: MessageType
    timestamp: str = field(default_factory=lambda: datetime.now(UTC).isoformat())


@dataclass
class AuthMessage(BaseMessage):
    """Authentication request message."""

    type: MessageType = MessageType.AUTH
    token: str = ""
    peer_id: str = ""


@dataclass
class AuthResponseMessage(BaseMessage):
    """Authentication response message."""

    type: MessageType = MessageType.AUTH_RESPONSE
    success: bool = False
    session_id: str | None = None
    paired_peer: str | None = None
    error: str | None = None


@dataclass
class TextMessage(BaseMessage):
    """Text message between peers."""

    type: MessageType = MessageType.TEXT_MESSAGE
    from_peer: str = field(default="", metadata={"json_key": "from"})
    content: str = ""
    message_id: str = ""


@dataclass
class ClipboardTextMessage(BaseMessage):
    """Clipboard text content message."""

    type: MessageType = MessageType.CLIPBOARD_TEXT
    from_peer: str = field(default="", metadata={"json_key": "from"})
    content: str = ""
    message_id: str = ""
    source: ClipboardSyncMode = ClipboardSyncMode.MANUAL


@dataclass
class PeerEventMessage(BaseMessage):
    """Peer connection/disconnection event."""

    type: MessageType = MessageType.PEER_CONNECTED
    peer_id: str = ""


@dataclass
class HeartbeatMessage(BaseMessage):
    """Heartbeat/ping message to keep connection alive."""

    type: MessageType = MessageType.HEARTBEAT
    peer_id: str = ""


@dataclass
class ErrorMessage(BaseMessage):
    """Error message."""

    type: MessageType = MessageType.ERROR
    code: ErrorCode = ErrorCode.INTERNAL_ERROR
    message: str = ""


# Utility functions for message serialization
def message_to_dict(message: BaseMessage) -> dict[str, object]:
    """Convert message to dictionary for JSON serialization."""
    result = asdict(message)

    # Handle 'from_peer' -> 'from' mapping
    if "from_peer" in result:
        result[MessageField.FROM] = result.pop("from_peer")

    return result


def dict_to_message(data: dict[str, object]) -> BaseMessage:
    """Convert dictionary to appropriate message class."""
    message_type = data.get(MessageField.TYPE)
    timestamp = str(data.get(MessageField.TIMESTAMP, ""))

    if message_type == MessageType.AUTH.value:
        return AuthMessage(
            token=str(data.get(MessageField.TOKEN, "")),
            peer_id=str(data.get(MessageField.PEER_ID, "")),
            timestamp=timestamp,
        )
    elif message_type == MessageType.AUTH_RESPONSE.value:
        return AuthResponseMessage(
            success=bool(data.get(MessageField.SUCCESS, False)),
            session_id=str(data[MessageField.SESSION_ID]) if data.get(MessageField.SESSION_ID) else None,
            paired_peer=str(data[MessageField.PAIRED_PEER]) if data.get(MessageField.PAIRED_PEER) else None,
            error=str(data[MessageField.ERROR]) if data.get(MessageField.ERROR) else None,
            timestamp=timestamp,
        )
    elif message_type == MessageType.TEXT_MESSAGE.value:
        return TextMessage(
            from_peer=str(data.get(MessageField.FROM, "")),
            content=str(data.get(MessageField.CONTENT, "")),
            message_id=str(data.get(MessageField.MESSAGE_ID, "")),
            timestamp=timestamp,
        )
    elif message_type == MessageType.CLIPBOARD_TEXT.value:
        source_value = data.get(MessageField.SOURCE, ClipboardSyncMode.MANUAL.value)
        source = ClipboardSyncMode.MANUAL if source_value == ClipboardSyncMode.MANUAL.value else ClipboardSyncMode.AUTO
        return ClipboardTextMessage(
            from_peer=str(data.get(MessageField.FROM, "")),
            content=str(data.get(MessageField.CONTENT, "")),
            message_id=str(data.get(MessageField.MESSAGE_ID, "")),
            source=source,
            timestamp=timestamp,
        )
    elif message_type in (MessageType.PEER_CONNECTED.value, MessageType.PEER_DISCONNECTED.value):
        peer_type = (
            MessageType.PEER_CONNECTED
            if message_type == MessageType.PEER_CONNECTED.value
            else MessageType.PEER_DISCONNECTED
        )
        return PeerEventMessage(type=peer_type, peer_id=str(data.get(MessageField.PEER_ID, "")), timestamp=timestamp)
    elif message_type == MessageType.HEARTBEAT.value:
        return HeartbeatMessage(peer_id=str(data.get(MessageField.PEER_ID, "")), timestamp=timestamp)
    elif message_type == MessageType.ERROR.value:
        code_value = data.get(MessageField.CODE, ErrorCode.INTERNAL_ERROR.value)
        code = ErrorCode.INTERNAL_ERROR
        # Validate and convert to enum
        if code_value == ErrorCode.TOKEN_INVALID.value:
            code = ErrorCode.TOKEN_INVALID
        elif code_value == ErrorCode.PEER_LIMIT.value:
            code = ErrorCode.PEER_LIMIT
        elif code_value == ErrorCode.ALREADY_CONNECTED.value:
            code = ErrorCode.ALREADY_CONNECTED
        return ErrorMessage(code=code, message=str(data.get(MessageField.MESSAGE, "")), timestamp=timestamp)
    else:
        raise ValueError(f"Unknown message type: {message_type}")
