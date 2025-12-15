import type { ServerWebSocket } from "bun";

// HTTP response types
export interface HealthResponse {
    status: "ok";
    timestamp: string;
}

// WebSocket connection parameters
export interface ConnectionParams {
    secret: string;
    channel: string;
    deviceName: string;
}

// WebSocket data (attached to each connection)
export interface WebSocketData {
    deviceName: string;
    channelId: string;
    connectedAt: Date;
}

// Base message structure
export interface BaseMessage {
    type: string;
    timestamp: string;
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

// PHASE 4: Clipboard message types
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
    data: string; // Plain text for 'text', base64 for 'image'/'file'
}

export interface ClipboardAckMessage extends BaseMessage {
    type: "clipboard_ack";
    receivedSize: number;
}

// Channel state
export interface ChannelDevice {
    deviceName: string;
    ws: TypedWebSocket; // Use our type-safe alias
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
    | "RATE_LIMIT_EXCEEDED";

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
} as const;

// Type alias for typed WebSocket
export type TypedWebSocket = ServerWebSocket<WebSocketData>;
