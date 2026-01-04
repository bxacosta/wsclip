import { ackMessageSchema, controlMessageSchema, dataMessageSchema } from "./schemas.ts";
import type { AckMessage, ControlMessage, DataMessage, ErrorCode } from "./types.ts";
import { MessageType } from "./types.ts";
import { parseMessage } from "./utils.ts";

export type ValidatedMessage = DataMessage | AckMessage | ControlMessage;

export type ValidationSuccess = { valid: true; data: ValidatedMessage };
export type ValidationError = { valid: false; error: { code: ErrorCode; message: string } };
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
        return fail("MESSAGE_TOO_LARGE" as ErrorCode, `Message size ${size} exceeds maximum ${maxSize} bytes`);
    }

    const parsed = parseMessage(raw);

    if (parsed === null) {
        return fail("INVALID_MESSAGE" as ErrorCode, "Invalid JSON format");
    }

    const type = getMessageType(parsed);

    if (type === MessageType.DATA) {
        const result = dataMessageSchema.safeParse(parsed);
        if (!result.success) {
            return fail("INVALID_MESSAGE" as ErrorCode, result.error.issues[0]?.message ?? "Invalid DATA message");
        }
        return { valid: true, data: result.data };
    }

    if (type === MessageType.ACK) {
        const result = ackMessageSchema.safeParse(parsed);
        if (!result.success) {
            return fail("INVALID_MESSAGE" as ErrorCode, result.error.issues[0]?.message ?? "Invalid ACK message");
        }
        return { valid: true, data: result.data };
    }

    if (type === MessageType.CONTROL) {
        const result = controlMessageSchema.safeParse(parsed);
        if (!result.success) {
            return fail("INVALID_MESSAGE" as ErrorCode, result.error.issues[0]?.message ?? "Invalid CONTROL message");
        }
        return { valid: true, data: result.data };
    }

    return fail("INVALID_MESSAGE" as ErrorCode, `Unknown message type: ${type}`);
}
