/**
 * Token generation and validation utilities
 */

/**
 * Generates a random alphanumeric token in format: XXXX-YYYY-ZZZZ
 * @param length Total length of token (default 12, formatted as 4-4-4)
 * @returns Formatted token string
 */
export function generateToken(length: number = 12): string {
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

/**
 * Validates token format
 * @param token Token string to validate
 * @returns true if valid format
 */
export function isValidTokenFormat(token: string): boolean {
  // Match format: XXXX-YYYY-ZZZZ (alphanumeric only)
  return /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(token);
}
