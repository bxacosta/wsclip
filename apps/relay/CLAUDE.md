# Relay Server - Cloudflare Worker

TypeScript relay server for WebSocket clipboard sync using Durable Objects for stateful session management.

## Setup & Commands

```bash
cd apps/relay
pnpm install && pnpm dev
pnpm run deploy  # Deploy with minification
```

## Architecture - Durable Objects

**Components:**
- `durable-objects/session.do.ts` - SessionDurableObject (2 peers/session, WebSocket Hibernation API)
- `services/token.service.ts` - Token generation (format: `XXXX-YYYY-ZZZZ`, crypto.getRandomValues)
- `services/session.service.ts` - Session validation (peer limits, duplicate checks)

**Layer Rules (`src/`):**
- `index.ts` - HTTP routes, entry point only
- `services/` - Business logic
- `durable-objects/` - Stateful WebSocket management
- `models/` - Interfaces/types only
- `utils/` - Validation, error handling
- `config/` - Constants

**CRITICAL: Services don't call Durable Objects directly.**

## WebSocket Protocol

**Message Flow:**
- Client → Server: `auth`, `clipboard_text`, `heartbeat`
- Server → Client: `auth_response`, `clipboard_text` (relayed), `peer_connected/disconnected`, `error`

**Key Fields:**
```typescript
// Auth: { type: 'auth', token, peer_id, timestamp }
// Clipboard: { type: 'clipboard_text', from, content, source: 'auto'|'manual', timestamp }
// Auth Response: { type: 'auth_response', success, session_id, paired_peer, timestamp }
// Error codes: INTERNAL_ERROR | AUTH_ERROR | SESSION_FULL | DUPLICATE_PEER
```

**Message Handling (SessionDurableObject):**
- `AUTH` → Authenticate and add peer
- `CLIPBOARD_TEXT` → Relay to paired peer
- `HEARTBEAT` → Ignored (keep-alive)
- Others → Ignored

See `src/models/messages.ts` for complete type definitions.

## Type Safety (NON-NEGOTIABLE)

**Rules:**
- NO `any` - use `unknown` then narrow with type guards
- Strict mode enabled in tsconfig.json
- All data structures must have interfaces (`src/models/`)
- Runtime validation with type guards

**Type Guard Pattern:**
```typescript
function isMessage(data: unknown): data is Message {
  return typeof data === 'object' && data !== null && 'type' in data;
}

const data: unknown = JSON.parse(input);
if (isMessage(data)) {
  processMessage(data);  // data is now Message
}
```

**Branded Types:**
```typescript
type Token = `${string}-${string}-${string}`;
function validateToken(token: string): token is Token {
  return /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(token);
}
```

## API Endpoints

- `GET /health` → `{ status: 'ok' }`
- `GET /api/generate-token` → `{ token: 'XXXX-YYYY-ZZZZ' }`
- `WS /ws?token=TOKEN&peer_id=PEER_ID` → WebSocket connection

## Key Locations

- **Constants**: `src/config/constants.ts` (MAX_PEERS_PER_SESSION: 2, TOKEN_LENGTH: 12)
- **Models**: `src/models/messages.ts`, `token.ts`
- **Wrangler**: `wrangler.jsonc` (Durable Objects binding: CLIPBOARD_SESSION)

## Workflow

1. Define types in `src/models/`
2. Implement with full type annotations
3. Add type guards for runtime validation
4. Verify: `tsc --noEmit`
5. Test: `pnpm dev`
