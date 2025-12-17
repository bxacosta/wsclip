import { z } from "zod";
import type { ErrorCode } from "@/types";

export interface ValidationResult {
    valid: boolean;
    error?: {
        code: ErrorCode;
        message: string;
    };
}

/**
 * Extract Bearer token from Authorization header
 * Expected format: "Bearer <token>"
 * Used for HTTP endpoint authentication (e.g., /stats)
 */
export function extractBearerToken(authHeader: string | null): string | null {
    if (!authHeader) {
        return null;
    }

    const parts = authHeader.split(" ");
    if (parts.length !== 2 || parts[0] !== "Bearer") {
        return null;
    }

    return parts[1] || null;
}

// Maximum length for device name (security limit)
const MAX_DEVICE_NAME_LENGTH = 64;

// Connection parameter schema (channel and deviceName only, auth via first message)
const connectionParamsSchema = z.object({
    channel: z
        .string()
        .length(8, "Channel must be exactly 8 characters")
        .regex(/^[a-zA-Z0-9]{8}$/, "Channel must be alphanumeric"),
    deviceName: z
        .string()
        .min(1, "Device name is required")
        .max(MAX_DEVICE_NAME_LENGTH, `Device name must be at most ${MAX_DEVICE_NAME_LENGTH} characters`)
        .transform(val => val.trim())
        .refine(val => val.length > 0, "Device name cannot be empty"),
});

/**
 * Validate connection parameters from URL query string
 * Only validates channel and deviceName - authentication happens via first message
 */
export function validateConnectionParams(params: URLSearchParams): ValidationResult {
    const channel = params.get("channel");
    const deviceName = params.get("deviceName");

    const parseResult = connectionParamsSchema.safeParse({
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

    return { valid: true };
}

/**
 * Get connection parameters from URL query string
 */
export function getConnectionParams(params: URLSearchParams) {
    return {
        channel: params.get("channel") || "",
        deviceName: params.get("deviceName")?.trim() || "",
    };
}
