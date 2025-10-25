/**
 * Structured logging utility for Cloudflare Workers
 * Outputs JSON logs for better parsing and filtering
 */

export class Logger {
  /**
   * Log info level message with optional metadata
   */
  static info(message: string, meta?: Record<string, unknown>): void {
    console.log(
      JSON.stringify({
        level: 'INFO',
        message,
        timestamp: new Date().toISOString(),
        ...meta,
      })
    );
  }

  /**
   * Log error level message with optional error and metadata
   */
  static error(
    message: string,
    error?: unknown,
    meta?: Record<string, unknown>
  ): void {
    console.error(
      JSON.stringify({
        level: 'ERROR',
        message,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
        ...meta,
      })
    );
  }

  /**
   * Log debug level message with optional metadata
   */
  static debug(message: string, meta?: Record<string, unknown>): void {
    console.log(
      JSON.stringify({
        level: 'DEBUG',
        message,
        timestamp: new Date().toISOString(),
        ...meta,
      })
    );
  }

  /**
   * Log warning level message with optional metadata
   */
  static warn(message: string, meta?: Record<string, unknown>): void {
    console.warn(
      JSON.stringify({
        level: 'WARN',
        message,
        timestamp: new Date().toISOString(),
        ...meta,
      })
    );
  }
}
