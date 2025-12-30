import { z } from "zod";
import { ContentType, ErrorCode, MessageType, PeerEventType } from "@/protocol/types/enums";

export const headerSchema = z.strictObject({
    type: z.enum([
        MessageType.CONTROL,
        MessageType.DATA,
        MessageType.ACK,
        MessageType.READY,
        MessageType.PEER,
        MessageType.ERROR,
    ]),
    id: z.uuid(),
    timestamp: z.iso.datetime(),
});

export const metadataSchema = z.record(z.string(), z.unknown());

export const controlPayloadSchema = z.looseObject({
    command: z.string().min(1, { message: "Command is required" }),
    metadata: metadataSchema.nullable().optional(),
});

export const controlMessageSchema = z.object({
    header: headerSchema.extend({ type: z.literal(MessageType.CONTROL) }),
    payload: controlPayloadSchema,
});

export const dataPayloadSchema = z.discriminatedUnion("contentType", [
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
]);

export const dataMessageSchema = z.object({
    header: headerSchema.extend({ type: z.literal(MessageType.DATA) }),
    payload: dataPayloadSchema,
});

export const ackPayloadSchema = z.looseObject({
    messageId: z.uuid(),
    status: z.enum(["success", "error"]),
    metadata: metadataSchema.nullable().optional(),
});

export const ackMessageSchema = z.object({
    header: headerSchema.extend({ type: z.literal(MessageType.ACK) }),
    payload: ackPayloadSchema,
});

const peerInfoSchema = z.strictObject({
    peerId: z.string().min(1),
    metadata: metadataSchema.optional(),
});

export const readyPayloadSchema = z.strictObject({
    peerId: z.string(),
    channelId: z.string(),
    peer: peerInfoSchema.nullable(),
});

export const readyMessageSchema = z.object({
    header: headerSchema.extend({ type: z.literal(MessageType.READY) }),
    payload: readyPayloadSchema,
});

export const peerPayloadSchema = z.strictObject({
    peerId: z.string(),
    event: z.enum([PeerEventType.JOINED, PeerEventType.LEFT]),
    metadata: metadataSchema.optional(),
});

export const peerMessageSchema = z.object({
    header: headerSchema.extend({ type: z.literal(MessageType.PEER) }),
    payload: peerPayloadSchema,
});

export const errorPayloadSchema = z.strictObject({
    code: z.enum([
        ErrorCode.INVALID_SECRET,
        ErrorCode.INVALID_CHANNEL,
        ErrorCode.INVALID_PEER_ID,
        ErrorCode.CHANNEL_FULL,
        ErrorCode.DUPLICATE_PEER_ID,
        ErrorCode.INVALID_MESSAGE,
        ErrorCode.MESSAGE_TOO_LARGE,
        ErrorCode.NO_PEER_CONNECTED,
        ErrorCode.RATE_LIMIT_EXCEEDED,
        ErrorCode.MAX_CHANNELS_REACHED,
        ErrorCode.INTERNAL_ERROR,
    ]),
    message: z.string(),
    messageId: z.string().optional(),
    details: z.record(z.string(), z.unknown()).optional(),
});

export const errorMessageSchema = z.object({
    header: headerSchema.extend({ type: z.literal(MessageType.ERROR) }),
    payload: errorPayloadSchema,
});

export type MessageHeader = z.infer<typeof headerSchema>;
export type Metadata = z.infer<typeof metadataSchema>;

export interface BaseMessage {
    header: MessageHeader;
    payload: Record<string, unknown>;
}

export type ControlMessage = z.infer<typeof controlMessageSchema>;
export type DataMessage = z.infer<typeof dataMessageSchema>;
export type AckMessage = z.infer<typeof ackMessageSchema>;

export type ReadyMessage = z.infer<typeof readyMessageSchema>;
export type PeerMessage = z.infer<typeof peerMessageSchema>;
export type ErrorMessage = z.infer<typeof errorMessageSchema>;

export type CRSPMessage = ControlMessage | DataMessage | AckMessage | ReadyMessage | PeerMessage | ErrorMessage;
