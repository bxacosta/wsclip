export interface HealthResponse {
    status: "ok";
    timestamp: string;
}

export interface ErrorResponse {
    code: string;
    status: number;
    message: string;
}
