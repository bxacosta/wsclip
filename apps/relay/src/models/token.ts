/**
 * Token type definitions with template literal types
 */

/**
 * Branded type for token format validation
 * Pattern: XXXX-YYYY-ZZZZ
 */
export type Token = `${string}-${string}-${string}`;

/**
 * Type guard to validate token format at runtime
 */
export function isToken(value: string): value is Token {
  return /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(value);
}
