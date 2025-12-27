/**
 * Default limits for the protocol.
 */
export const DEFAULT_LIMITS = {
    /** Maximum message size in bytes (100 MiB) */
    MAX_MESSAGE_SIZE: 104857600,
    /** Authentication timeout in milliseconds (5 seconds) */
    AUTH_TIMEOUT_MS: 5000,
    /** Rate limit window in milliseconds (1 minute) */
    RATE_LIMIT_WINDOW_MS: 60000,
    /** Maximum requests per rate limit window */
    RATE_LIMIT_MAX_REQUESTS: 10,
} as const;

/**
 * Protocol configuration constants.
 */
export const PROTOCOL_CONFIG = {
    /** Maximum peers per channel */
    PEERS_PER_CHANNEL: 2,
    /** Default compression setting */
    COMPRESSION_ENABLED: false,
    /** Default idle timeout in seconds */
    IDLE_TIMEOUT_SECONDS: 60,
} as const;
