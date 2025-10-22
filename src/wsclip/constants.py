"""
Application constants and default values
"""

# Default Worker URL (can be overridden in config)
DEFAULT_WORKER_URL = "wss://clipboard-sync-relay.your-subdomain.workers.dev"

# WebSocket connection settings
WS_CONNECT_TIMEOUT = 10.0  # seconds
WS_PING_INTERVAL = 30.0    # seconds
WS_PING_TIMEOUT = 10.0     # seconds

# Message limits
MAX_MESSAGE_SIZE = 1048576  # 1 MB (no chunking in Phase 2)

# Peer ID generation
PEER_ID_PREFIX = "peer_"

# Log levels
DEFAULT_LOG_LEVEL = "INFO"

# Phase 2: Clipboard settings
CLIPBOARD_POLL_INTERVAL = 0.5  # seconds between clipboard checks
CLIPBOARD_MAX_SIZE = 1048576   # 1 MB max clipboard content
DEFAULT_HOTKEY = "<ctrl>+<shift>+c"  # Default hotkey for manual mode

# Phase 2: Reconnection settings
RECONNECT_INITIAL_DELAY = 1.0  # seconds
RECONNECT_MAX_DELAY = 30.0     # seconds
RECONNECT_MAX_ATTEMPTS = 10

# Phase 2: Mode settings
DEFAULT_MODE = "manual"  # "auto" or "manual"
