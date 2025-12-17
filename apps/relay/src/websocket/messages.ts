import { z } from "zod";
import { getLogger } from "@/config/logger";
import type {
    AuthMessage,
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

// MIME type regex: type/subtype with optional parameters
// Examples: text/plain, image/png, application/octet-stream, text/plain; charset=utf-8
const MIME_TYPE_REGEX =
    /^[a-zA-Z0-9][a-zA-Z0-9!#$&\-^_.+]*\/[a-zA-Z0-9][a-zA-Z0-9!#$&\-^_.+]*(;\s*[a-zA-Z0-9\-_.]+=[a-zA-Z0-9\-_.]+)*$/;

// Zod schemas for runtime validation
const clipboardMetadataSchema = z.object({
    mimeType: z.string().min(1).regex(MIME_TYPE_REGEX, "Invalid MIME type format"),
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
 */
export function validateClipboardMessage(rawMessage: string, maxSize: number): ValidationResult<ClipboardMessage> {
    const logger = getLogger();

    // Validate total message size first (raw JSON string)
    const messageSize = Buffer.byteLength(rawMessage, "utf-8");
    if (messageSize > maxSize) {
        logger.warn(
            {
                size: messageSize,
                maxSize,
            },
            "Message size exceeds maximum",
        );

        return {
            valid: false,
            error: {
                code: "PAYLOAD_TOO_LARGE",
                message: `Message size ${messageSize} exceeds maximum ${maxSize} bytes`,
            },
        };
    }

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

    // Use Zod's inferred data - assertion needed for interface compatibility
    const message = result.data;

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
        data: message as ClipboardMessage,
    };
}

/**
 * Validate clipboard ACK message
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
 * Check if string is valid base64 using regex (efficient, no decode/encode cycle)
 * Validates: A-Z, a-z, 0-9, +, /, and = for padding
 * Length must be multiple of 4
 */
const BASE64_REGEX = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

function isValidBase64(str: string): boolean {
    if (str.length === 0) {
        return false;
    }
    return BASE64_REGEX.test(str);
}

/**
 * Create clipboard ACK message
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

// Auth message schema
const authMessageSchema = z.object({
    type: z.literal("auth"),
    secret: z.string().min(1, "Secret is required"),
});

/**
 * Validate auth message from client
 * Expected format: { type: "auth", secret: "xxx" }
 */
export function validateAuthMessage(rawMessage: string): ValidationResult<AuthMessage> {
    const logger = getLogger();

    let parsed: unknown;
    try {
        parsed = JSON.parse(rawMessage);
    } catch (error) {
        logger.warn({ err: error }, "Invalid JSON in auth message");

        return {
            valid: false,
            error: {
                code: "INVALID_MESSAGE",
                message: "Invalid JSON format",
            },
        };
    }

    const result = authMessageSchema.safeParse(parsed);

    if (!result.success) {
        logger.warn({ errors: result.error.issues }, "Invalid auth message schema");

        return {
            valid: false,
            error: {
                code: "INVALID_MESSAGE",
                message: "Invalid auth message format. Expected: { type: 'auth', secret: 'xxx' }",
            },
        };
    }

    return {
        valid: true,
        data: result.data as AuthMessage,
    };
}
