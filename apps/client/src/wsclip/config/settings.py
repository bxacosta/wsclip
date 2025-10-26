"""Application settings with default values."""


class Settings:
    """Application settings with default values."""

    # Configuration
    CONFIG_DIR_NAME = "wsclip"
    CONFIG_FILE_NAME = "config.json"

    # Worker
    DEFAULT_WORKER_URL = "wss://clipboard-sync-relay.your-subdomain.workers.dev"

    # WebSocket
    WS_CONNECT_TIMEOUT = 10.0  # seconds
    WS_PING_INTERVAL = 30.0  # seconds (prevent connection hibernation)
    WS_PING_TIMEOUT = 10.0  # seconds
    WS_HEARTBEAT_INTERVAL = 30.0  # seconds (send heartbeat to keep Durable Object alive)

    # Clipboard
    CLIPBOARD_POLL_INTERVAL = 1.0  # seconds
    CLIPBOARD_MAX_SIZE_MB = 1
    DEFAULT_HOTKEY = "<alt>+<shift>+<enter>"  # pynput uses 'enter' not 'return'

    # Reconnection
    RECONNECT_INITIAL_DELAY = 1.0  # seconds
    RECONNECT_MAX_DELAY = 30.0  # seconds
    RECONNECT_MAX_ATTEMPTS = 10

    # Mode
    DEFAULT_MODE = "manual"  # "auto" or "manual"

    # Logging
    DEFAULT_LOG_LEVEL = "INFO"

    # Messages
    MAX_MESSAGE_SIZE = 1048576  # 1 MB

    # Peer ID
    PEER_ID_PREFIX = "peer_"
