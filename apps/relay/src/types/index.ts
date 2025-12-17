import type { ServerWebSocket } from "bun";

// HTTP response types
export interface HealthResponse {
    status: "ok";
    timestamp: string;
}

// WebSocket connection parameters (from query string, not auth)
export interface ConnectionParams {
    channel: string;
    deviceName: string;
}

// WebSocket data (attached to each connection)
export interface WebSocketData {
    deviceName: string;
    channelId: string;
    connectedAt: Date;
    authenticated: boolean;
    authTimeoutId: ReturnType<typeof setTimeout> | null;
}

// Base message structure
export interface BaseMessage {
    type: string;
    timestamp: string;
}

// Authentication message (client -> server, must be first message)
export interface AuthMessage extends BaseMessage {
    type: "auth";
    secret: string;
}

// System messages (server -> client)
export interface ConnectedMessage extends BaseMessage {
    type: "connected";
    deviceName: string;
    channelId: string;
    waitingForPartner: boolean;
}

export interface ErrorMessage extends BaseMessage {
    type: "error";
    code: ErrorCode;
    message: string;
}

// Partner notification messages
export interface PartnerConnectedMessage extends BaseMessage {
    type: "partner_connected";
    partnerName: string;
}

export interface PartnerDisconnectedMessage extends BaseMessage {
    type: "partner_disconnected";
    partnerName: string;
}

export interface ServerShutdownMessage extends BaseMessage {
    type: "server_shutdown";
    message: string;
}

// Clipboard message types
export type ContentType = "text" | "image" | "file";

export interface ClipboardMetadata {
    mimeType: string;
    size: number;
    filename: string | null;
}

export interface ClipboardMessage extends BaseMessage {
    type: "clipboard";
    contentType: ContentType;
    metadata: ClipboardMetadata;
    data: string;
}

export interface ClipboardAckMessage extends BaseMessage {
    type: "clipboard_ack";
    receivedSize: number;
}

// Channel state
export interface ChannelDevice {
    deviceName: string;
    ws: TypedWebSocket;
    connectedAt: Date;
}

export interface Channel {
    channelId: string;
    devices: Map<string, ChannelDevice>;
    createdAt: Date;
}

// Error codes
export type ErrorCode =
    | "INVALID_SECRET"
    | "INVALID_CHANNEL"
    | "INVALID_DEVICE_NAME"
    | "CHANNEL_FULL"
    | "DUPLICATE_DEVICE_NAME"
    | "INVALID_MESSAGE"
    | "PAYLOAD_TOO_LARGE"
    | "NO_PARTNER"
    | "RATE_LIMIT_EXCEEDED"
    | "AUTH_TIMEOUT"
    | "MAX_CHANNELS_REACHED";

// WebSocket close codes (4000-4999 for application-defined codes)
export const WS_CLOSE_CODES = {
    INVALID_SECRET: 4001,
    INVALID_CHANNEL: 4002,
    INVALID_DEVICE_NAME: 4003,
    CHANNEL_FULL: 4004,
    DUPLICATE_DEVICE_NAME: 4005,
    INVALID_MESSAGE: 4006,
    PAYLOAD_TOO_LARGE: 4007,
    NO_PARTNER: 4008,
    RATE_LIMIT_EXCEEDED: 4009,
    AUTH_TIMEOUT: 4010,
    MAX_CHANNELS_REACHED: 4011,
} as const;

// Centralized error messages
export const ERROR_MESSAGES: Record<ErrorCode, string> = {
    INVALID_SECRET: "Invalid secret",
    INVALID_CHANNEL: "Channel must be exactly 8 alphanumeric characters",
    INVALID_DEVICE_NAME: "Invalid device name",
    CHANNEL_FULL: "Channel already has 2 participants",
    DUPLICATE_DEVICE_NAME: "Device name already exists in this channel",
    INVALID_MESSAGE: "Invalid message format",
    PAYLOAD_TOO_LARGE: "Message size exceeds maximum allowed",
    NO_PARTNER: "No partner connected to receive message",
    RATE_LIMIT_EXCEEDED: "Too many connection attempts. Please try again later.",
    AUTH_TIMEOUT: "Authentication timeout. Send auth message within timeout period.",
    MAX_CHANNELS_REACHED: "Server has reached maximum number of active channels",
} as const;

// Type alias for typed WebSocket
export type TypedWebSocket = ServerWebSocket<WebSocketData>;
