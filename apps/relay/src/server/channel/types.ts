import type { ServerWebSocket } from "bun";
import type { ClientInfo } from "@/protocol/types";

/**
 * Connection phase representing the lifecycle state of a WebSocket connection.
 *
 * - "connecting": Initial state after WebSocket upgrade, before any message
 * - "authenticating": Waiting for AUTH message
 * - "ready": Successfully authenticated, can send/receive messages
 * - "closing": Connection is being terminated
 */
export type ConnectionPhase = "connecting" | "authenticating" | "ready" | "closing";

/**
 * Data attached to each WebSocket connection.
 * Available via ws.data in all WebSocket handlers.
 */
export interface WebSocketData {
    /** Unique device name within the channel */
    deviceName: string;
    /** Channel identifier (8 alphanumeric characters) */
    channelId: string;
    /** Timestamp when connection was established */
    connectedAt: Date;
    /** Current connection phase */
    phase: ConnectionPhase;
    /** Timer ID for authentication timeout */
    authTimeoutId: ReturnType<typeof setTimeout> | null;
    /** Optional client information provided during auth */
    clientInfo?: ClientInfo;
}

/**
 * Type-safe WebSocket with attached data.
 */
export type TypedWebSocket = ServerWebSocket<WebSocketData>;

/**
 * Represents a connected device in a channel.
 */
export interface Device {
    /** Unique device name within the channel */
    deviceName: string;
    /** WebSocket connection */
    ws: TypedWebSocket;
    /** Timestamp when device joined the channel */
    connectedAt: Date;
    /** Optional client information */
    clientInfo?: ClientInfo;
}

/**
 * Represents a communication channel between two devices.
 */
export interface Channel {
    /** Channel identifier */
    channelId: string;
    /** Connected devices (max 2) */
    devices: Map<string, Device>;
    /** Timestamp when channel was created */
    createdAt: Date;
}

/**
 * Helper function to check if a connection is authenticated.
 *
 * @param data - WebSocket data
 * @returns true if the connection phase is "ready"
 */
export function isAuthenticated(data: WebSocketData): boolean {
    return data.phase === "ready";
}
