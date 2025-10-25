/**
 * Token generation and validation service
 */

import { TOKEN_LENGTH } from '../config/constants';

export class TokenService {
  /**
   * Generates a random alphanumeric token in format: XXXX-YYYY-ZZZZ
   */
  static generate(length: number = TOKEN_LENGTH): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let token = '';

    // Use crypto.getRandomValues for cryptographically secure randomness
    const array = new Uint8Array(length);
    crypto.getRandomValues(array);

    for (let i = 0; i < length; i++) {
      token += chars[array[i] % chars.length];
    }

    // Format as XXXX-YYYY-ZZZZ
    return `${token.slice(0, 4)}-${token.slice(4, 8)}-${token.slice(8, 12)}`;
  }
}
