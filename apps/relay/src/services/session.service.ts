/**
 * Session management service
 */

import { Validators } from '../utils/validators';
import { MAX_PEERS_PER_SESSION } from '../config/constants';

/**
 * Validation result with discriminated union for type safety
 */
export type ValidationResult =
  | { valid: true }
  | { valid: false; error: string };

export class SessionService {
  /**
   * Verifies if a new peer can be accepted into the session
   */
  static canAcceptPeer(existingPeers: Set<string>, newPeerId: string): boolean {
    // Maximum peers per session (configurable constant)
    return existingPeers.size < MAX_PEERS_PER_SESSION || existingPeers.has(newPeerId);
  }

  /**
   * Validates peer credentials
   */
  static validatePeer(token: string, peerId: string): ValidationResult {
    if (!Validators.isValidToken(token)) {
      return { valid: false, error: 'Invalid token format' };
    }

    if (!Validators.isValidPeerId(peerId)) {
      return { valid: false, error: 'Invalid peer_id' };
    }

    return { valid: true };
  }
}
