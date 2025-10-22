"""
Application constants and default values
"""

# Default Worker URL (can be overridden in config)
DEFAULT_WORKER_URL = "wss://clipboard-sync-relay.your-subdomain.workers.dev"

# WebSocket connection settings
WS_CONNECT_TIMEOUT = 10.0  # seconds
WS_PING_INTERVAL = 30.0    # seconds
WS_PING_TIMEOUT = 10.0     # seconds

# Message limits (Phase 1)
MAX_MESSAGE_SIZE = 1048576  # 1 MB (no chunking in Phase 1)

# Peer ID generation
PEER_ID_PREFIX = "peer_"

# Log levels
DEFAULT_LOG_LEVEL = "INFO"
