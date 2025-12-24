import { z } from "zod";
import { ContentType, MessageType } from "@/protocol/types/enums";

export const headerSchema = z.strictObject({
    type: z.enum([
        MessageType.AUTH,
        MessageType.CONTROL,
        MessageType.DATA,
        MessageType.ACK,
        MessageType.CONNECTED,
        MessageType.PEER_EVENT,
        MessageType.ERROR,
        MessageType.SHUTDOWN,
    ]),
    id: z.uuid(),
    timestamp: z.iso.datetime(),
});

export const clientInfoSchema = z.looseObject({
    platform: z.string().optional(),
    version: z.string().optional(),
});

export const authPayloadSchema = z.strictObject({
    secret: z.string().min(1, { message: "Secret is required" }),
    channel: z
        .string()
        .length(8, { message: "Channel must be 8 characters" })
        .regex(/^[a-zA-Z0-9]{8}$/, { message: "Channel must be alphanumeric" }),
    deviceName: z
        .string()
        .transform(val => val.trim())
        .refine(val => val.length > 0, {
            message: "Device name cannot be empty",
        }),
    clientInfo: clientInfoSchema.optional(),
});

export const controlPayloadSchema = z.looseObject({
    command: z.string().min(1, { message: "Command is required" }),
    params: z.record(z.string(), z.unknown()).nullable().optional(),
});

export const dataMetadataSchema = z.looseObject({
    size: z.number().optional(),
    encoding: z.string().optional(),
});

export const dataPayloadSchema = z
    .looseObject({
        contentType: z.enum([ContentType.TEXT, ContentType.BINARY]),
        data: z.string().min(1, { message: "Data is required" }),
        metadata: dataMetadataSchema.optional(),
    })
    .refine(
        payload => {
            if (payload.contentType === ContentType.BINARY) {
                try {
                    atob(payload.data);
                    return true;
                } catch {
                    return false;
                }
            }
            return true;
        },
        {
            message: "Data must be valid Base64 when contentType is binary",
        },
    );

export const ackDetailsSchema = z.looseObject({
    receivedAt: z.iso.datetime().optional(),
    processedAt: z.iso.datetime().optional(),
});

export const ackPayloadSchema = z.looseObject({
    messageId: z.uuid(),
    status: z.enum(["received", "processed", "error"]),
    details: ackDetailsSchema.nullable().optional(),
});

export const authMessageSchema = z.object({
    header: headerSchema.extend({ type: z.literal(MessageType.AUTH) }),
    payload: authPayloadSchema,
});

export const controlMessageSchema = z.object({
    header: headerSchema.extend({ type: z.literal(MessageType.CONTROL) }),
    payload: controlPayloadSchema,
});

export const dataMessageSchema = z.object({
    header: headerSchema.extend({ type: z.literal(MessageType.DATA) }),
    payload: dataPayloadSchema,
});

export const ackMessageSchema = z.object({
    header: headerSchema.extend({ type: z.literal(MessageType.ACK) }),
    payload: ackPayloadSchema,
});
