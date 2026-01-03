import { ErrorCatalog, type ErrorCode } from "@/protocol";

interface HttpErrorResponse {
    code: string;
    status: number;
    message: string;
}

export function buildHttpError(errorCode: ErrorCode, customMessage?: string): Response {
    const error = ErrorCatalog[errorCode];

    const response: HttpErrorResponse = {
        code: errorCode,
        status: error.httpStatus,
        message: customMessage ?? error.message,
    };

    return Response.json(response, { status: error.httpStatus });
}

export function buildHttpErrorRaw(status: number, code: string, message: string): Response {
    const response: HttpErrorResponse = {
        code,
        status,
        message,
    };

    return Response.json(response, { status });
}
