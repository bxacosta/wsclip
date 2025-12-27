import type { AckMessage, ControlMessage, DataMessage, MessageHeader } from "@/protocol/schemas";
import { ackMessageSchema, controlMessageSchema, dataMessageSchema, headerSchema } from "@/protocol/schemas";
import type { ErrorCode } from "@/protocol/types/enums";

export interface ValidationResult<T> {
    valid: boolean;
    data?: T;
    error?: {
        code: ErrorCode;
        message: string;
    };
}

export function validateHeader(data: unknown): ValidationResult<MessageHeader> {
    // Extract header from message object
    const message = data as { header?: unknown };

    if (!message.header) {
        return {
            valid: false,
            error: {
                code: "INVALID_MESSAGE",
                message: "Missing message header",
            },
        };
    }

    const result = headerSchema.safeParse(message.header);

    if (!result.success) {
        const firstIssue = result.error.issues[0];
        return {
            valid: false,
            error: {
                code: "INVALID_MESSAGE",
                message: firstIssue?.message || "Invalid message header",
            },
        };
    }

    return {
        valid: true,
        data: result.data,
    };
}

export function validateControlPayload(data: unknown): ValidationResult<ControlMessage> {
    const result = controlMessageSchema.safeParse(data);

    if (!result.success) {
        const firstIssue = result.error.issues[0];
        return {
            valid: false,
            error: {
                code: "INVALID_MESSAGE",
                message: firstIssue?.message || "Invalid CONTROL message",
            },
        };
    }

    return {
        valid: true,
        data: result.data,
    };
}

export function validateDataPayload(data: unknown): ValidationResult<DataMessage> {
    const result = dataMessageSchema.safeParse(data);

    if (!result.success) {
        const firstIssue = result.error.issues[0];
        return {
            valid: false,
            error: {
                code: "INVALID_MESSAGE",
                message: firstIssue?.message || "Invalid DATA message",
            },
        };
    }

    return {
        valid: true,
        data: result.data,
    };
}

export function validateAckPayload(data: unknown): ValidationResult<AckMessage> {
    const result = ackMessageSchema.safeParse(data);

    if (!result.success) {
        const firstIssue = result.error.issues[0];
        return {
            valid: false,
            error: {
                code: "INVALID_MESSAGE",
                message: firstIssue?.message || "Invalid ACK message",
            },
        };
    }

    return {
        valid: true,
        data: result.data,
    };
}
