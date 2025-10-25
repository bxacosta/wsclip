/**
 * Error handling utilities
 */

import type { ErrorCode, ErrorMessage } from '../models/messages';

export class ErrorHandler {
  /**
   * Create an error message
   */
  static createError(code: ErrorCode, message: string): ErrorMessage {
    return {
      type: 'error',
      code,
      message,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Send error to WebSocket
   */
  static sendError(ws: WebSocket, code: ErrorCode, message: string): void {
    const error = this.createError(code, message);
    ws.send(JSON.stringify(error));
  }

  /**
   * Create HTTP error response
   */
  static httpError(message: string, status: number): Response {
    return new Response(message, { status });
  }
}
