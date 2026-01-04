import { ackMessageSchema, controlMessageSchema, dataMessageSchema } from "@/protocol/messages/schemas";
import { parseMessage } from "@/protocol/messages/utils";
import type { AckMessage, ControlMessage, DataMessage } from "@/protocol/types";
import { ErrorCode, MessageType } from "@/protocol/types/enums";

export type ValidatedMessage = DataMessage | AckMessage | ControlMessage;

type ValidationSuccess = { valid: true; data: ValidatedMessage };
type ValidationError = { valid: false; error: { code: ErrorCode; message: string } };
export type ValidationResult = ValidationSuccess | ValidationError;

function fail(code: ErrorCode, message: string): ValidationError {
    return { valid: false, error: { code, message } };
}

function getMessageType(parsed: unknown): string | undefined {
    if (typeof parsed === "object" && parsed !== null && "header" in parsed) {
        const header = (parsed as { header: unknown }).header;
        if (typeof header === "object" && header !== null && "type" in header) {
            return (header as { type: unknown }).type as string;
        }
    }
    return undefined;
}

export function validateMessage(raw: string, maxSize: number): ValidationResult {
    const size = Buffer.byteLength(raw, "utf-8");

    if (size > maxSize) {
        return fail(ErrorCode.MESSAGE_TOO_LARGE, `Message size ${size} exceeds maximum ${maxSize} bytes`);
    }

    const parsed = parseMessage(raw);

    if (parsed === null) {
        return fail(ErrorCode.INVALID_MESSAGE, "Invalid JSON format");
    }

    const type = getMessageType(parsed);

    if (type === MessageType.DATA) {
        const result = dataMessageSchema.safeParse(parsed);
        if (!result.success) {
            return fail(ErrorCode.INVALID_MESSAGE, result.error.issues[0]?.message ?? "Invalid DATA message");
        }
        return { valid: true, data: result.data };
    }

    if (type === MessageType.ACK) {
        const result = ackMessageSchema.safeParse(parsed);
        if (!result.success) {
            return fail(ErrorCode.INVALID_MESSAGE, result.error.issues[0]?.message ?? "Invalid ACK message");
        }
        return { valid: true, data: result.data };
    }

    if (type === MessageType.CONTROL) {
        const result = controlMessageSchema.safeParse(parsed);
        if (!result.success) {
            return fail(ErrorCode.INVALID_MESSAGE, result.error.issues[0]?.message ?? "Invalid CONTROL message");
        }
        return { valid: true, data: result.data };
    }

    return fail(ErrorCode.INVALID_MESSAGE, `Unknown message type: ${type}`);
}
