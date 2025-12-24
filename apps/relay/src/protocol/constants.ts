import type { ErrorCode } from "./types/enums";

export const WS_CLOSE_CODES = {
    INVALID_SECRET: 4001,
    INVALID_CHANNEL: 4002,
    INVALID_DEVICE_NAME: 4003,
    CHANNEL_FULL: 4004,
    DUPLICATE_DEVICE_NAME: 4005,
    INVALID_MESSAGE: 4006,
    MESSAGE_TOO_LARGE: 4007,
    NO_PEER_CONNECTED: 4008,
    RATE_LIMIT_EXCEEDED: 4009,
    AUTH_TIMEOUT: 4010,
    INTERNAL_ERROR: 5000,
} as const;

export const ERROR_MESSAGES: Record<ErrorCode, string> = {
    INVALID_SECRET: "Invalid authentication secret",
    INVALID_CHANNEL: "Channel ID must be exactly 8 alphanumeric characters",
    INVALID_DEVICE_NAME: "Device name cannot be empty",
    CHANNEL_FULL: "Channel is full (maximum 2 devices)",
    DUPLICATE_DEVICE_NAME: "Device name already exists in this channel",
    INVALID_MESSAGE: "Invalid message format or structure",
    MESSAGE_TOO_LARGE: "Message exceeds maximum size limit",
    NO_PEER_CONNECTED: "No peer connected to relay message",
    RATE_LIMIT_EXCEEDED: "Rate limit exceeded, too many requests",
    AUTH_TIMEOUT: "Authentication timeout, connection closed",
    INTERNAL_ERROR: "Internal server error",
};

export const DEFAULT_LIMITS = {
    MAX_MESSAGE_SIZE: 104857600, // 100 MiB
    AUTH_TIMEOUT_MS: 10000, // 10 seconds
    RATE_LIMIT_WINDOW_MS: 60000, // 1 minute
    RATE_LIMIT_MAX_REQUESTS: 100,
} as const;

export const PROTOCOL_CONFIG = {
    DEVICES_PER_CHANNEL: 2,
    COMPRESSION_ENABLED: false,
    IDLE_TIMEOUT_SECONDS: 120,
} as const;
