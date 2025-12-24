import type { AckMessage, AuthMessage, ControlMessage, DataMessage, ErrorCode, MessageHeader } from "@/protocol/types";
import { ackMessageSchema, authMessageSchema, controlMessageSchema, dataMessageSchema, headerSchema } from "./schemas";

export interface ValidationResult<T> {
    valid: boolean;
    data?: T;
    error?: {
        code: ErrorCode;
        message: string;
    };
}

export function validateHeader(data: unknown): ValidationResult<MessageHeader> {
    const result = headerSchema.safeParse(data);

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

export function validateAuthPayload(data: unknown): ValidationResult<AuthMessage> {
    const result = authMessageSchema.safeParse(data);

    if (!result.success) {
        const firstIssue = result.error.issues[0];
        return {
            valid: false,
            error: {
                code: "INVALID_MESSAGE",
                message: firstIssue?.message || "Invalid AUTH message",
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

export function validateDataPayload(data: unknown, maxSize: number): ValidationResult<DataMessage> {
    const jsonString = JSON.stringify(data);
    const sizeInBytes = new TextEncoder().encode(jsonString).length;

    if (sizeInBytes > maxSize) {
        return {
            valid: false,
            error: {
                code: "MESSAGE_TOO_LARGE",
                message: `Message size ${sizeInBytes} exceeds maximum ${maxSize} bytes`,
            },
        };
    }

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
