/**
 * Default limits for the protocol.
 */
export const DEFAULT_LIMITS = {
    /** Maximum message size in bytes (100 MiB) */
    MAX_MESSAGE_SIZE: 104857600,
    /** Authentication timeout in milliseconds (10 seconds) */
    AUTH_TIMEOUT_MS: 10000,
    /** Rate limit window in milliseconds (1 minute) */
    RATE_LIMIT_WINDOW_MS: 60000,
    /** Maximum requests per rate limit window */
    RATE_LIMIT_MAX_REQUESTS: 100,
} as const;

/**
 * Protocol configuration constants.
 */
export const PROTOCOL_CONFIG = {
    /** Maximum devices per channel */
    DEVICES_PER_CHANNEL: 2,
    /** Default compression setting */
    COMPRESSION_ENABLED: false,
    /** Default idle timeout in seconds */
    IDLE_TIMEOUT_SECONDS: 120,
} as const;
