# Relay Server

WebSocket relay server implementing the Content Relay Sync Protocol (CRSP) for stateless peer-to-peer content
synchronization.

## Features

- Stateless relay architecture with transparent message routing
- Channel-based pairing using 8-character alphanumeric identifiers
- Strict two-peer limit per channel for secure point-to-point communication
- Dual authentication support (HTTP header and query parameter)
- Rate limiting and connection backpressure handling
- HTTP endpoints for health checks and statistics

## Quick Start

### Prerequisites

- Bun 1.3 or higher

### Installation

```bash
bun install
```

### Configuration

Copy the environment template and configure the server secret:

```bash
cp .env.example .env
```

Edit `.env` and set the required `SERVER_SECRET` variable. See `.env.example` for all available configuration options.

### Running the Server

**Development mode:**

```bash
bun run dev
```

**Production mode:**

```bash
bun run build
bun run start
```

**Docker deployment:**

```bash
docker compose up -d
```

## Protocol

### CRSP (Content Relay Sync Protocol)

CRSP is a WebSocket-based protocol designed for content synchronization through a relay server. It defines a
hierarchical message structure with strict header validation and flexible payload extensions.

**Connection Format:**

```
ws://host:port/ws?channelId=<CHANNEL_ID>&peerId=<PEER_ID>&secret=<SECRET>
```

or with HTTP header authentication:

```
ws://host:port/ws?channelId=<CHANNEL_ID>&peerId=<PEER_ID>
Authorization: Bearer <SECRET>
```

**Parameters:**

- `channelId`: Exactly 8 alphanumeric characters
- `peerId`: Non-empty peer identifier (unique within channel)
- `secret`: Authentication secret (query parameter or header)

**Message Categories:**

- **Control Messages**: Connection management and custom commands (`control`)
- **Data Messages**: Content exchange (`data`) and acknowledgments (`ack`)
- **System Messages**: Server notifications (`ready`, `peer`, `error`, `shutdown`)

For complete protocol specification, message formats, and integration examples, see `docs/PROTOCOL.md` and
`docs/INTEGRATION.md`.

## HTTP Endpoints

| Endpoint | Method | Authentication | Description                   |
|----------|--------|----------------|-------------------------------|
| /health  | GET    | None           | Health check status           |
| /stats   | GET    | Bearer token   | Server statistics and metrics |

## Development

### Available Scripts

| Command           | Description                         |
|-------------------|-------------------------------------|
| bun run dev       | Development server with auto-reload |
| bun run build     | Compile TypeScript                  |
| bun run start     | Run production build                |
| bun run check     | Run Biome linter checks             |
| bun run fix       | Auto-fix linting issues             |
| bun run typecheck | TypeScript type checking            |
| bun run play      | Start playground server (port 4000) |

### Playground

A web-based client interface is available for testing:

```bash
# Terminal 1: Start relay server
bun run dev

# Terminal 2: Start playground
bun run play
```

Open `http://localhost:4000` and connect multiple clients to test the relay functionality.

## Deployment

### Docker

The project includes a `Dockerfile` and `compose.yaml` for containerized deployment:

```bash
docker compose up -d
```