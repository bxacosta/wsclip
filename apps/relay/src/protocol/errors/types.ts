export interface ErrorDefinition {
    readonly code: number;
    readonly httpStatus: number;
    readonly recoverable: boolean;
}
