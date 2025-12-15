# Claude Development Guidelines

## Critical Rules (NO EXCEPTIONS)

- All code, comments, logs, documentation in English only
- NO emojis anywhere (code, comments, logs, errors, documentation)
- Formal, impersonal tone (third person)
- Absolute imports only: `@/config/logger` not `../config/logger`
- Lazy logger initialization: call `getLogger()` inside functions, never at module level
- Run `bun run check` before every commit, fix all errors

## Tech Stack

- Runtime: Bun (latest)
- Language: TypeScript strict mode
- WebSocket: Native Bun API
- Validation: Zod
- Logging: Pino
- Linter: Biome

## Naming Conventions

```typescript
// Variables/functions: camelCase
const deviceName, function validateChannel()

// Types/Interfaces: PascalCase
interface WebSocketData, type ErrorCode

// Constants: UPPER_SNAKE_CASE
const MAX_MESSAGE_SIZE, WS_CLOSE_CODES

// Files: kebab-case
channel-manager.ts, websocket-handler.ts
```

## Modern Bun WebSocket Patterns (2025)

### Native Upgrade
```typescript
// Return boolean, not Response
export function upgrade(req: Request, server: Server): boolean {
    return server.upgrade(req, { data });
}

// In fetch: return undefined on success
if (wsHandlers.upgrade(req, server)) return;
```

### Pub/Sub (7x faster than Node.js)
```typescript
ws.subscribe(channelId);    // Subscribe to topic
ws.publish(channelId, msg); // Broadcast to all in topic
ws.unsubscribe(channelId);  // Cleanup on leave
```

### Backpressure Handling
```typescript
const result = ws.send(json);
// result > 0: bytes sent
// result = -1: backpressure (Bun queued it)
// result = 0: dropped (connection issue)
```

### Typed WebSocket
```typescript
import type { ServerWebSocket } from "bun";

interface WebSocketData {
    deviceName: string;
    channelId: string;
    connectedAt: Date;
}

type TypedWebSocket = ServerWebSocket<WebSocketData>;

open(ws: ServerWebSocket<WebSocketData>) {
    ws.data.deviceName // Fully typed
}
```

## Logging Patterns

### Lazy Initialization (CRITICAL)
```typescript
// CORRECT
function sendMessage() {
    const logger = getLogger(); // Inside function
}

// WRONG - Causes module initialization errors
const logger = getLogger(); // At module level
```

### Child Loggers
```typescript
const wsLogger = logger.child({
    context: "websocket",
    deviceName: ws.data.deviceName,
    channelId: ws.data.channelId,
});
// All logs automatically include context
```

### Error Serializer
```typescript
// CORRECT
logger.error({ err: error }, "Message");

// WRONG
logger.error({ message: error.message, stack: error.stack }, "Message");
```

### Shutdown Flush
```typescript
await flushLogger(); // Before process.exit()
```

## Zod Validation

```typescript
const schema = z.object({
    channel: z.string()
        .length(8, "Channel must be 8 characters")
        .regex(/^[a-zA-Z0-9]{8}$/, "Alphanumeric only"),
    deviceName: z.string()
        .transform(val => val.trim())
        .refine(val => val.length > 0, "Cannot be empty"),
});

const result = schema.safeParse(data);
if (!result.success) {
    const error = result.error.issues[0]; // Use .issues not .errors
    return { valid: false, error: { message: error.message } };
}
```

## TypeScript Patterns

### Const Assertions
```typescript
export const WS_CLOSE_CODES = {
    INVALID_SECRET: 4001,
    CHANNEL_FULL: 4004,
} as const;

type ErrorCode = keyof typeof WS_CLOSE_CODES;
```

### Discriminated Unions
```typescript
interface BaseMessage {
    type: string;
    timestamp: string;
}

interface ConnectedMessage extends BaseMessage {
    type: "connected";
    deviceName: string;
}

type Message = ConnectedMessage | ErrorMessage | ...;
```

### Singleton Pattern
```typescript
class ChannelManager {
    private channels = new Map<string, Channel>();
}
export const channelManager = new ChannelManager();
```

## File Structure

```
src/
├── index.ts              # Entry, signal handlers
├── server.ts             # Bun server config
├── config/
│   ├── env.ts           # Zod env validation
│   └── logger.ts        # Pino setup
├── http/
│   └── routes.ts        # /health, /stats
├── types/
│   └── index.ts         # All TypeScript types
├── utils/
│   └── validation.ts    # Validation functions
└── websocket/
    ├── handler.ts       # Lifecycle handlers
    ├── channel.ts       # Channel management
    └── messages.ts      # Message utilities
```

## Development Workflow

### Before Every Commit
1. `bun run check` - Validate linter
2. `bun run fix` - Auto-fix issues
3. `bun run build` - Verify TypeScript compilation

### Common Scripts
- `bun run dev` - Dev server with auto-reload
- `bun run check` - Biome linter check
- `bun run fix` - Auto-fix and format
- `bun run build` - Compile TypeScript

## Biome Rules

- No unused variables (remove or prefix `_`)
- No `any` types (use proper assertions)
- No non-null assertions `!` (add error checking)
- Double quotes for strings
- Tabs for indentation

### Fix Pattern
```typescript
// BEFORE
sendErrorAndClose(ws, result.error!.code);

// AFTER
if (result.error) {
    const { code, message } = result.error;
    sendErrorAndClose(ws, code, message);
}
```

## Common Pitfalls

1. Module-level `getLogger()` calls - Always inside functions
2. Relative imports - Use `@/` absolute imports
3. Emojis in code - Strictly forbidden
4. Hardcoded URLs - Use env vars
5. Ignoring linter - Always fix before commit
6. `parseResult.error.errors[0]` - Use `.issues[0]` for Zod
7. Manual error serialization - Use `{ err: error }`

## Environment Variables

```bash
SERVER_SECRET=your-secret    # Required
PORT=3000                    # Optional, default 3000
MAX_MESSAGE_SIZE=104857600   # Optional, 100 MiB
LOG_LEVEL=info               # Optional: debug,info,warn,error
NODE_ENV=development         # development or production
```

## Error Handling

### WebSocket Close Codes (4000-4999)
```typescript
INVALID_SECRET: 4001
INVALID_CHANNEL: 4002
INVALID_DEVICE_NAME: 4003
CHANNEL_FULL: 4004
DUPLICATE_DEVICE_NAME: 4005
INVALID_MESSAGE: 4006
PAYLOAD_TOO_LARGE: 4007
NO_PARTNER: 4008
RATE_LIMIT_EXCEEDED: 4009
```

### Send Error Pattern
```typescript
sendErrorAndClose(ws, "CHANNEL_FULL", "Channel has 2 participants");
```

## Testing

- Manual: Use `test-client.html` in browser
- Multiple tabs/windows for multi-device testing
- Health: `curl http://localhost:3000/health`
- Stats: `curl http://localhost:3000/stats`

## Quick Reference

```typescript
// 1. Logger inside function
function myFunc() {
    const logger = getLogger();
    const wsLogger = logger.child({ deviceName, channelId });
}

// 2. Zod validation
const result = schema.safeParse(data);
if (!result.success) {
    const error = result.error.issues[0];
}

// 3. WebSocket send with backpressure check
const result = ws.send(JSON.stringify(message));
if (result === -1) logger.warn("Backpressure");

// 4. Pub/Sub
ws.subscribe(channelId);
ws.publish(channelId, message);

// 5. Type-safe error
sendErrorAndClose(ws, "CHANNEL_FULL", "Message");
```

## Key Documentation

- requirement.md - Full requirements
- implementation-phases/ - Phase guides
- .env.example - Env template
- tsconfig.json - Path mappings (@/)
