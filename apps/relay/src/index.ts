/**
 * Entry point and routes for the Clipboard Sync Relay
 */

import { Hono } from 'hono';
import { TokenService } from './services/token.service';
import { SessionDurableObject } from './durable-objects/session.do';
import { Validators } from './utils/validators';
import { ErrorHandler } from './utils/errors';
import { TOKEN_EXPIRY_SECONDS } from './config/constants';

// API info type for type checking
interface ApiInfo {
  name: string;
  version: string;
  endpoints: Record<string, string>;
}

const app = new Hono<{ Bindings: Env }>();

/**
 * Root endpoint with API info
 * GET /
 */
app.get('/', (c) => {
  return c.json({
    name: 'WSClip Relay Server',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      generate_token: '/api/generate-token',
      websocket: '/ws?token=TOKEN&peer_id=PEER_ID',
    },
  } satisfies ApiInfo);
});

/**
 * Health check endpoint
 * GET /health
 */
app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});

/**
 * Generate a new pairing token
 * GET /api/generate-token
 */
app.get('/api/generate-token', (c) => {
  const token = TokenService.generate();

  return c.json({
    token,
    expires_in: TOKEN_EXPIRY_SECONDS,
  });
});

/**
 * WebSocket endpoint for peer connections
 * GET /ws?token=XXXX-YYYY-ZZZZ&peer_id=peer_a
 */
app.get('/ws', async (c) => {
  const token = c.req.query('token');
  const peerId = c.req.query('peer_id');

  // Validate parameters
  if (!token || !peerId) {
    return c.text('Missing token or peer_id parameter', 400);
  }

  if (!Validators.isValidToken(token)) {
    return c.text('Invalid token format', 400);
  }

  // Get Durable Object instance by token
  // This ensures all peers with same token connect to same DO instance
  const id = c.env.CLIPBOARD_SESSION.idFromName(token);
  const stub = c.env.CLIPBOARD_SESSION.get(id);

  // Forward request to Durable Object
  return stub.fetch(c.req.raw);
});

// Export Durable Object class
export { SessionDurableObject };

// Export default Worker
export default app;
