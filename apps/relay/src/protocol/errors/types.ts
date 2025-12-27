export interface ErrorDefinition {
    readonly closeCode: number;
    readonly httpStatus: number;
    readonly recoverable: boolean;
    readonly defaultMessage: string;
}
