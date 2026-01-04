import { z } from "zod";
import { ConnectionEventType, ContentType, ErrorCode, MessageType } from "@/protocol/types/enums.ts";

const headerSchema = z.strictObject({
    type: z.enum(MessageType),
    id: z.uuid(),
    timestamp: z.iso.datetime(),
});

export const metadataSchema = z.record(z.string(), z.unknown());

export const controlMessageSchema = z.object({
    header: headerSchema.extend({ type: z.literal(MessageType.CONTROL) }),
    payload: z.looseObject({
        command: z.string().min(1, { message: "Command is required" }),
        metadata: metadataSchema.nullable().optional(),
    }),
});

export const dataMessageSchema = z.object({
    header: headerSchema.extend({ type: z.literal(MessageType.DATA) }),
    payload: z.discriminatedUnion("contentType", [
        z.object({
            contentType: z.literal(ContentType.TEXT),
            data: z.string().min(1, { message: "Data is required" }),
            metadata: metadataSchema.optional(),
        }),
        z.object({
            contentType: z.literal(ContentType.BINARY),
            data: z.base64({ message: "Data must be valid Base64" }),
            metadata: metadataSchema.optional(),
        }),
    ]),
});

export const ackMessageSchema = z.object({
    header: headerSchema.extend({ type: z.literal(MessageType.ACK) }),
    payload: z.looseObject({
        messageId: z.uuid(),
        status: z.enum(["success", "error"]),
        metadata: metadataSchema.nullable().optional(),
    }),
});

export const connectionSchema = z.strictObject({
    id: z.string().min(1),
    address: z.string().min(1),
    connectedAt: z.iso.datetime(),
});

export const readyMessageSchema = z.object({
    header: headerSchema.extend({ type: z.literal(MessageType.READY) }),
    payload: z.strictObject({
        connectionId: z.string(),
        sessionId: z.string(),
        otherConnection: connectionSchema.nullable(),
    }),
});

export const connectionMessageSchema = z.object({
    header: headerSchema.extend({ type: z.literal(MessageType.CONNECTION) }),
    payload: z.strictObject({
        connectionId: z.string(),
        event: z.enum([ConnectionEventType.JOINED, ConnectionEventType.LEFT]),
    }),
});

export const errorMessageSchema = z.object({
    header: headerSchema.extend({ type: z.literal(MessageType.ERROR) }),
    payload: z.strictObject({
        code: z.enum(ErrorCode),
        message: z.string(),
        messageId: z.string().optional(),
        details: z.record(z.string(), z.unknown()).optional(),
    }),
});
