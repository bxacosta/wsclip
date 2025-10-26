"""Application constants"""


class Theme:
    """Monochrome color scheme for elegant terminal display."""

    # Panel styling
    HEADER_PANEL = "bold white on grey23"
    BORDER = "grey30"

    # Text styling
    LABEL = "grey70"  # Field labels (Mode:, Token:, etc.)
    VALUE = "white"  # Field values
    VALUE_ACTIVE = "bold white"  # Active/important values
    VALUE_INACTIVE = "grey46"  # Inactive/waiting values

    # Log levels
    LOG_INFO = "white"
    LOG_SUCCESS = "bright_white"
    LOG_WARNING = "grey66"
    LOG_ERROR = "bright_white on grey15"
    LOG_TIMESTAMP = "grey50"

    # Status indicators
    STATUS_CONNECTED = "white"
    STATUS_DISCONNECTED = "grey46"
    STATUS_ACTIVE = "bold white"


class MessageField:
    """JSON field name constants for WebSocket messages."""

    TYPE = "type"
    TIMESTAMP = "timestamp"
    TOKEN = "token"
    PEER_ID = "peer_id"
    SESSION_ID = "session_id"
    PAIRED_PEER = "paired_peer"
    SUCCESS = "success"
    ERROR = "error"
    FROM = "from"
    CONTENT = "content"
    MESSAGE_ID = "message_id"
    SOURCE = "source"
    CODE = "code"
    MESSAGE = "message"
