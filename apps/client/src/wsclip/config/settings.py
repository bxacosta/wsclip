"""Application settings with default values."""

from wsclip.models.messages import ClipboardSyncMode


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
    DEFAULT_CLIPBOARD_MODE = ClipboardSyncMode.MANUAL
    DEFAULT_CLIPBOARD_HOTKEY = "<alt>+<shift>+<enter>"  # pynput uses 'enter' not 'return'
    DEFAULT_CLIPBOARD_POLL_INTERVAL = 0.5  # seconds (different from monitor interval)
    DEFAULT_CLIPBOARD_MAX_SIZE_MB = 1

    # Reconnection
    DEFAULT_RECONNECT_ENABLED = True
    DEFAULT_RECONNECT_MAX_ATTEMPTS = 10
    RECONNECT_INITIAL_DELAY = 1.0  # seconds
    RECONNECT_MAX_DELAY = 30.0  # seconds

    # Proxy
    DEFAULT_PROXY_ENABLED = False
    DEFAULT_PROXY_HOST = "localhost"
    DEFAULT_PROXY_PORT = 1080
    DEFAULT_PROXY_TYPE = "socks5"

    # Logging
    DEFAULT_LOG_LEVEL = "INFO"

    # Messages
    MAX_MESSAGE_SIZE = 1048576  # 1 MB

    # Peer ID
    PEER_ID_PREFIX = "peer_"
