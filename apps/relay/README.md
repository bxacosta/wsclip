# WSClip Relay

Cloudflare Worker relay server for WebSocket-based clipboard synchronization.

## Development

### Install dependencies

```bash
cd apps/relay
pnpm install
```

### Run locally

```bash
pnpm dev
```

### Deploy

```bash
pnpm deploy
```

## Project Structure

```
src/
├── index.ts                      # Entry point and routes
│
├── services/                     # 💼 Business logic
│   ├── token.service.ts         # Token generation and validation
│   └── session.service.ts       # Session management logic
│
├── durable-objects/              # 🔄 Durable Objects
│   └── session.do.ts            # Session Durable Object
│
├── models/                       # 📦 Types and models
│   ├── messages.ts              # WebSocket message types
│   └── session.ts               # Session model
│
├── utils/                        # 🛠️ Utilities
│   ├── validators.ts            # Validation utilities
│   └── errors.ts                # Error handling
│
├── config/                       # ⚙️ Configuration
│   └── constants.ts             # Application constants
│
└── [legacy files]               # To be removed
    ├── auth.ts
    ├── session.ts
    └── types.ts
```

## API Endpoints

### Health Check
```
GET /health
```

### Generate Token
```
GET /api/generate-token
```

### WebSocket
```
WS /ws?token=TOKEN&peer_id=PEER_ID
```

## Architecture

The relay server uses Cloudflare Durable Objects to manage WebSocket sessions with a clean, layered architecture:

### Layers

- **Entry Point** (`index.ts`): HTTP routes and request handling
- **Services** (`services/`): Business logic for tokens and sessions
- **Durable Objects** (`durable-objects/`): Stateful WebSocket session management
- **Models** (`models/`): TypeScript interfaces and types
- **Utils** (`utils/`): Validation and error handling
- **Config** (`config/`): Application constants

### Key Features

- **Token-based Pairing**: Secure session creation with random tokens
- **Peer Limit**: Maximum 2 peers per session
- **WebSocket Hibernation**: Efficient connection management
- **Message Relay**: Direct peer-to-peer message forwarding

Each token creates a unique Durable Object instance that manages the WebSocket connections for exactly 2 peers.
