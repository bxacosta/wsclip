"""Application constants."""

# Message types
MSG_AUTH = 'auth'
MSG_AUTH_RESPONSE = 'auth_response'
MSG_TEXT = 'text_message'
MSG_CLIPBOARD = 'clipboard_text'
MSG_PEER_CONNECTED = 'peer_connected'
MSG_PEER_DISCONNECTED = 'peer_disconnected'
MSG_ERROR = 'error'

# Error codes
ERR_TOKEN_INVALID = 'TOKEN_INVALID'
ERR_PEER_LIMIT = 'PEER_LIMIT'
ERR_ALREADY_CONNECTED = 'ALREADY_CONNECTED'
ERR_INTERNAL_ERROR = 'INTERNAL_ERROR'

# WebSocket connection settings (imported from settings)
from .settings import Settings

WS_CONNECT_TIMEOUT = Settings.WS_CONNECT_TIMEOUT
WS_PING_INTERVAL = Settings.WS_PING_INTERVAL
WS_PING_TIMEOUT = Settings.WS_PING_TIMEOUT
WS_HEARTBEAT_INTERVAL = Settings.WS_HEARTBEAT_INTERVAL
