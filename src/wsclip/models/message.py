"""
Data classes for WebSocket messages
"""
from dataclasses import dataclass, field
from typing import Literal, Optional
from datetime import datetime

# Type aliases for message types
MessageType = Literal[
    'auth',
    'auth_response',
    'text_message',
    'peer_connected',
    'peer_disconnected',
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
    """Base message class with common fields"""
    type: MessageType
    timestamp: str = field(default_factory=lambda: datetime.utcnow().isoformat())


@dataclass
class AuthMessage(BaseMessage):
    """Authentication request message"""
    type: Literal['auth'] = 'auth'
    token: str = ''
    peer_id: str = ''


@dataclass
class AuthResponseMessage(BaseMessage):
    """Authentication response message"""
    type: Literal['auth_response'] = 'auth_response'
    success: bool = False
    session_id: Optional[str] = None
    paired_peer: Optional[str] = None
    error: Optional[str] = None


@dataclass
class TextMessage(BaseMessage):
    """Text message between peers"""
    type: Literal['text_message'] = 'text_message'
    from_peer: str = field(default='', metadata={'json_key': 'from'})
    content: str = ''
    message_id: str = ''


@dataclass
class PeerEventMessage(BaseMessage):
    """Peer connection/disconnection event"""
    type: Literal['peer_connected', 'peer_disconnected'] = 'peer_connected'
    peer_id: str = ''


@dataclass
class ErrorMessage(BaseMessage):
    """Error message"""
    type: Literal['error'] = 'error'
    code: ErrorCode = 'INTERNAL_ERROR'
    message: str = ''


# Utility functions for message serialization
def message_to_dict(msg: BaseMessage) -> dict[str, object]:
    """Convert message to dictionary for JSON serialization"""
    result: dict[str, object] = {}
    for key, value in msg.__dict__.items():
        # Handle 'from_peer' -> 'from' mapping
        if key == 'from_peer':
            result['from'] = value
        else:
            result[key] = value
    return result


def dict_to_message(data: dict[str, object]) -> BaseMessage:
    """Convert dictionary to appropriate message class"""
    msg_type = data.get('type')

    if msg_type == 'auth':
        return AuthMessage(**data)  # type: ignore
    elif msg_type == 'auth_response':
        return AuthResponseMessage(**data)  # type: ignore
    elif msg_type == 'text_message':
        # Map 'from' -> 'from_peer'
        data_copy = data.copy()
        data_copy['from_peer'] = data_copy.pop('from', '')
        return TextMessage(**data_copy)  # type: ignore
    elif msg_type in ['peer_connected', 'peer_disconnected']:
        return PeerEventMessage(**data)  # type: ignore
    elif msg_type == 'error':
        return ErrorMessage(**data)  # type: ignore
    else:
        raise ValueError(f"Unknown message type: {msg_type}")
