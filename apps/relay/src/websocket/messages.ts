import { z } from "zod";
import { getLogger } from "@/config/logger";
import type {
    BaseMessage,
    ClipboardAckMessage,
    ClipboardMessage,
    ConnectedMessage,
    ErrorCode,
    ErrorMessage,
    PartnerConnectedMessage,
    PartnerDisconnectedMessage,
    TypedWebSocket,
} from "@/types";
import { WS_CLOSE_CODES } from "@/types";

// Create ISO 8601 timestamp
export function createTimestamp(): string {
    return new Date().toISOString();
}

// Send JSON message with backpressure handling
export function sendMessage(ws: TypedWebSocket, message: BaseMessage): boolean {
    const logger = getLogger();
    const json = JSON.stringify(message);
    const result = ws.send(json);

    if (result === -1) {
        // Backpressure - message queued
        logger.warn(
            { deviceName: ws.data.deviceName, channelId: ws.data.channelId },
            "Message queued due to backpressure",
        );
        return false;
    } else if (result === 0) {
        // Connection issue - message dropped
        logger.error(
            { deviceName: ws.data.deviceName, channelId: ws.data.channelId },
            "Message dropped - connection issue",
        );
        return false;
    }

    return true; // Success (bytes sent)
}

// Send error and close connection
export function sendErrorAndClose(ws: TypedWebSocket, code: keyof typeof WS_CLOSE_CODES, message: string): void {
    const errorMsg: ErrorMessage = {
        type: "error",
        timestamp: createTimestamp(),
        code,
        message,
    };

    sendMessage(ws, errorMsg);
    ws.close(WS_CLOSE_CODES[code], message);
}

// Send connected message
export function sendConnectedMessage(ws: TypedWebSocket, waitingForPartner: boolean): void {
    const msg: ConnectedMessage = {
        type: "connected",
        timestamp: createTimestamp(),
        deviceName: ws.data.deviceName,
        channelId: ws.data.channelId,
        waitingForPartner,
    };

    sendMessage(ws, msg);
}

// Send partner connected notification
export function sendPartnerConnected(ws: TypedWebSocket, partnerName: string): void {
    const msg: PartnerConnectedMessage = {
        type: "partner_connected",
        timestamp: createTimestamp(),
        partnerName,
    };

    sendMessage(ws, msg);
}

// Send partner disconnected notification
export function sendPartnerDisconnected(ws: TypedWebSocket, partnerName: string): void {
    const msg: PartnerDisconnectedMessage = {
        type: "partner_disconnected",
        timestamp: createTimestamp(),
        partnerName,
    };

    sendMessage(ws, msg);
}

// ============================================================================
// PHASE 4: Clipboard Message Validation
// ============================================================================

// Zod schemas for runtime validation
const clipboardMetadataSchema = z.object({
    mimeType: z.string().min(1),
    size: z.number().int().positive(),
    filename: z.string().nullable(),
});

const clipboardMessageSchema = z.object({
    type: z.literal("clipboard"),
    timestamp: z.string().datetime(),
    contentType: z.enum(["text", "image", "file"]),
    metadata: clipboardMetadataSchema,
    data: z.string(),
});

const clipboardAckSchema = z.object({
    type: z.literal("clipboard_ack"),
    timestamp: z.string().datetime(),
    receivedSize: z.number().int().positive(),
});

export interface ValidationResult<T = unknown> {
    valid: boolean;
    data?: T;
    error?: {
        code: ErrorCode;
        message: string;
    };
}

/**
 * Validate and parse clipboard message
 * MODERN PATTERN: Uses lazy logger initialization
 */
export function validateClipboardMessage(rawMessage: string, maxSize: number): ValidationResult<ClipboardMessage> {
    const logger = getLogger(); // Modern pattern: get logger inside function

    // Parse JSON
    let parsed: unknown;
    try {
        parsed = JSON.parse(rawMessage);
    } catch (error) {
        logger.warn({ err: error }, "Invalid JSON in clipboard message");

        return {
            valid: false,
            error: {
                code: "INVALID_MESSAGE",
                message: "Invalid JSON format",
            },
        };
    }

    // Validate against schema
    const result = clipboardMessageSchema.safeParse(parsed);

    if (!result.success) {
        logger.warn({ errors: result.error.issues }, "Invalid clipboard message schema");

        return {
            valid: false,
            error: {
                code: "INVALID_MESSAGE",
                message: "Invalid clipboard message format",
            },
        };
    }

    const message = result.data as ClipboardMessage;

    // Validate size
    const dataSize = Buffer.from(message.data, "utf-8").length;

    if (dataSize > maxSize) {
        logger.warn(
            {
                size: dataSize,
                maxSize,
                contentType: message.contentType,
            },
            "Payload too large",
        );

        return {
            valid: false,
            error: {
                code: "PAYLOAD_TOO_LARGE",
                message: `Message size ${dataSize} exceeds maximum ${maxSize} bytes`,
            },
        };
    }

    // Validate base64 for image/file
    if (message.contentType !== "text") {
        if (!isValidBase64(message.data)) {
            logger.warn({ contentType: message.contentType }, "Invalid base64 data");

            return {
                valid: false,
                error: {
                    code: "INVALID_MESSAGE",
                    message: "Data must be base64 encoded for images and files",
                },
            };
        }
    }

    return {
        valid: true,
        data: message,
    };
}

/**
 * Validate clipboard ACK message
 * MODERN PATTERN: Uses lazy logger initialization
 */
export function validateClipboardAck(rawMessage: string): ValidationResult<ClipboardAckMessage> {
    const logger = getLogger();

    try {
        const parsed = JSON.parse(rawMessage);
        const result = clipboardAckSchema.safeParse(parsed);

        if (!result.success) {
            logger.warn({ errors: result.error.issues }, "Invalid ACK message schema");

            return {
                valid: false,
                error: {
                    code: "INVALID_MESSAGE",
                    message: "Invalid ACK message format",
                },
            };
        }

        return {
            valid: true,
            data: result.data as ClipboardAckMessage,
        };
    } catch (error) {
        logger.warn({ err: error }, "Invalid JSON in ACK message");

        return {
            valid: false,
            error: {
                code: "INVALID_MESSAGE",
                message: "Invalid JSON format",
            },
        };
    }
}

/**
 * Check if string is valid base64
 */
function isValidBase64(str: string): boolean {
    try {
        // Use Bun's native base64 functions
        const decoded = atob(str);
        const encoded = btoa(decoded);
        return encoded === str;
    } catch {
        return false;
    }
}

/**
 * Create clipboard ACK message
 * MODERN PATTERN: Reuses createTimestamp() from Phase 2
 */
export function createClipboardAck(size: number): ClipboardAckMessage {
    return {
        type: "clipboard_ack",
        timestamp: createTimestamp(),
        receivedSize: size,
    };
}

/**
 * Send clipboard ACK to partner
 * MODERN PATTERN: Reuses sendMessage() for backpressure handling
 */
export function sendClipboardAck(ws: TypedWebSocket, size: number): void {
    const ackMsg = createClipboardAck(size);
    sendMessage(ws, ackMsg);
}

/**
 * Determine message type from raw JSON
 */
export function getMessageType(rawMessage: string): string | null {
    try {
        const parsed = JSON.parse(rawMessage);
        return parsed.type || null;
    } catch {
        return null;
    }
}
