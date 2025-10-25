"""Data models for WebSocket messages."""
from __future__ import annotations

from dataclasses import dataclass, field, asdict
from typing import Literal
from datetime import datetime, timezone

# Type aliases for message types
MessageType = Literal[
    'auth',
    'auth_response',
    'text_message',
    'clipboard_text',
    'peer_connected',
    'peer_disconnected',
    'heartbeat',
    'error'
]

ErrorCode = Literal[
    'TOKEN_INVALID',
    'PEER_LIMIT',
    'ALREADY_CONNECTED',
    'INTERNAL_ERROR'
]


@dataclass
class BaseMessage:
    """Base message class with common fields."""
    type: MessageType
    timestamp: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


@dataclass
class AuthMessage(BaseMessage):
    """Authentication request message."""
    type: Literal['auth'] = 'auth'
    token: str = ''
    peer_id: str = ''


@dataclass
class AuthResponseMessage(BaseMessage):
    """Authentication response message."""
    type: Literal['auth_response'] = 'auth_response'
    success: bool = False
    session_id: str | None = None
    paired_peer: str | None = None
    error: str | None = None


@dataclass
class TextMessage(BaseMessage):
    """Text message between peers."""
    type: Literal['text_message'] = 'text_message'
    from_peer: str = field(default='', metadata={'json_key': 'from'})
    content: str = ''
    message_id: str = ''


@dataclass
class ClipboardTextMessage(BaseMessage):
    """Clipboard text content message."""
    type: Literal['clipboard_text'] = 'clipboard_text'
    from_peer: str = field(default='', metadata={'json_key': 'from'})
    content: str = ''
    message_id: str = ''
    source: Literal['auto', 'manual'] = 'manual'


@dataclass
class PeerEventMessage(BaseMessage):
    """Peer connection/disconnection event."""
    type: Literal['peer_connected', 'peer_disconnected'] = 'peer_connected'
    peer_id: str = ''


@dataclass
class HeartbeatMessage(BaseMessage):
    """Heartbeat/ping message to keep connection alive."""
    type: Literal['heartbeat'] = 'heartbeat'
    peer_id: str = ''


@dataclass
class ErrorMessage(BaseMessage):
    """Error message."""
    type: Literal['error'] = 'error'
    code: ErrorCode = 'INTERNAL_ERROR'
    message: str = ''


# Utility functions for message serialization
def message_to_dict(msg: BaseMessage) -> dict[str, object]:
    """Convert message to dictionary for JSON serialization."""
    result = asdict(msg)

    # Handle 'from_peer' -> 'from' mapping
    if 'from_peer' in result:
        result['from'] = result.pop('from_peer')

    return result


def dict_to_message(data: dict[str, object]) -> BaseMessage:
    """Convert dictionary to appropriate message class."""
    msg_type = data.get('type')
    timestamp = str(data.get('timestamp', ''))

    if msg_type == 'auth':
        return AuthMessage(
            token=str(data.get('token', '')),
            peer_id=str(data.get('peer_id', '')),
            timestamp=timestamp
        )
    elif msg_type == 'auth_response':
        return AuthResponseMessage(
            success=bool(data.get('success', False)),
            session_id=str(data['session_id']) if data.get('session_id') else None,
            paired_peer=str(data['paired_peer']) if data.get('paired_peer') else None,
            error=str(data['error']) if data.get('error') else None,
            timestamp=timestamp
        )
    elif msg_type == 'text_message':
        return TextMessage(
            from_peer=str(data.get('from', '')),
            content=str(data.get('content', '')),
            message_id=str(data.get('message_id', '')),
            timestamp=timestamp
        )
    elif msg_type == 'clipboard_text':
        source_val = data.get('source', 'manual')
        source: Literal['auto', 'manual'] = 'manual' if source_val == 'manual' else 'auto'
        return ClipboardTextMessage(
            from_peer=str(data.get('from', '')),
            content=str(data.get('content', '')),
            message_id=str(data.get('message_id', '')),
            source=source,
            timestamp=timestamp
        )
    elif msg_type in ['peer_connected', 'peer_disconnected']:
        peer_type: Literal['peer_connected', 'peer_disconnected'] = (
            'peer_connected' if msg_type == 'peer_connected' else 'peer_disconnected'
        )
        return PeerEventMessage(
            type=peer_type,
            peer_id=str(data.get('peer_id', '')),
            timestamp=timestamp
        )
    elif msg_type == 'heartbeat':
        return HeartbeatMessage(
            peer_id=str(data.get('peer_id', '')),
            timestamp=timestamp
        )
    elif msg_type == 'error':
        code_val = data.get('code', 'INTERNAL_ERROR')
        code: ErrorCode = 'INTERNAL_ERROR'
        if code_val in ['TOKEN_INVALID', 'PEER_LIMIT', 'ALREADY_CONNECTED', 'INTERNAL_ERROR']:
            code = code_val  # type: ignore
        return ErrorMessage(
            code=code,
            message=str(data.get('message', '')),
            timestamp=timestamp
        )
    else:
        raise ValueError(f"Unknown message type: {msg_type}")
