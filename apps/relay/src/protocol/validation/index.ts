import type { ZodType } from "zod";
import type { AckMessage, BaseMessage, ControlMessage, DataMessage } from "@/protocol";
import {
    ackMessageSchema,
    baseMessageSchema,
    controlMessageSchema,
    dataMessageSchema,
} from "@/protocol/messages/schemas.ts";
import { ErrorCode } from "@/protocol/types/enums";

export type ValidationResult<T> =
    | { valid: true; data: T }
    | { valid: false; error: { code: ErrorCode; message: string } };

export type ValidationFunction<T> = (data: unknown) => ValidationResult<T>;

function validate<T>(data: unknown, schema: ZodType<T>, errorMessage: string): ValidationResult<T> {
    const result = schema.safeParse(data);

    if (result.success) {
        return { valid: true, data: result.data };
    }

    return {
        valid: false,
        error: {
            code: ErrorCode.INVALID_MESSAGE,
            message: result.error.issues[0]?.message || errorMessage,
        },
    };
}

export const validateBaseMessage: ValidationFunction<BaseMessage> = (data: unknown): ValidationResult<BaseMessage> => {
    return validate(data, baseMessageSchema, "Invalid message");
};

export const validateControlPayload: ValidationFunction<ControlMessage> = (data): ValidationResult<ControlMessage> =>
    validate(data, controlMessageSchema, "Invalid CONTROL message");

export const validateDataPayload: ValidationFunction<DataMessage> = (data): ValidationResult<DataMessage> =>
    validate(data, dataMessageSchema, "Invalid DATA message");

export const validateAckPayload: ValidationFunction<AckMessage> = (data): ValidationResult<AckMessage> =>
    validate(data, ackMessageSchema, "Invalid ACK message");
