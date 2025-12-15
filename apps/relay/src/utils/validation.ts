import { z } from "zod";
import type { ErrorCode } from "@/types";

export interface ValidationResult {
    valid: boolean;
    error?: {
        code: ErrorCode;
        message: string;
    };
}

// Connection parameter schema
const connectionParamsSchema = z.object({
    secret: z.string().min(1),
    channel: z
        .string()
        .length(8, "Channel must be exactly 8 characters")
        .regex(/^[a-zA-Z0-9]{8}$/, "Channel must be alphanumeric"),
    deviceName: z
        .string()
        .min(1, "Device name is required")
        .transform(val => val.trim())
        .refine(val => val.length > 0, "Device name cannot be empty"),
});

export function validateConnectionParams(params: URLSearchParams, serverSecret: string): ValidationResult {
    const secret = params.get("secret");
    const channel = params.get("channel");
    const deviceName = params.get("deviceName");

    // Parse with Zod
    const parseResult = connectionParamsSchema.safeParse({
        secret,
        channel,
        deviceName,
    });

    if (!parseResult.success) {
        const firstError = parseResult.error.issues[0];

        let code: ErrorCode = "INVALID_MESSAGE";
        if (firstError?.path.includes("channel")) {
            code = "INVALID_CHANNEL";
        } else if (firstError?.path.includes("deviceName")) {
            code = "INVALID_DEVICE_NAME";
        }

        return {
            valid: false,
            error: {
                code,
                message: firstError?.message || "Validation failed",
            },
        };
    }

    // Check secret match
    if (parseResult.data.secret !== serverSecret) {
        return {
            valid: false,
            error: {
                code: "INVALID_SECRET",
                message: "Invalid or missing secret",
            },
        };
    }

    return { valid: true };
}

export function getConnectionParams(params: URLSearchParams) {
    return {
        secret: params.get("secret") || "",
        channel: params.get("channel") || "",
        deviceName: params.get("deviceName")?.trim() || "",
    };
}
