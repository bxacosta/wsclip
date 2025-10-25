# WSClip

WebSocket-based clipboard synchronization for P2P communication via Cloudflare Workers.

## Monorepo Structure

```
wsclip/
├── apps/
│   ├── client/          # Python client application
│   └── relay/           # Cloudflare Worker relay server
│
├── docs/                # Documentation
├── config.yaml          # User configuration
├── README.md
└── LICENSE
```

## Quick Start

### Client

```bash
cd apps/client
uv pip install -e .
wsclip init
wsclip start --mode auto
```

### Relay

```bash
cd apps/relay
pnpm install
pnpm dev
```

See individual README files in `apps/client/` and `apps/relay/` for detailed instructions

## Features

- Auto and manual synchronization modes
- Token-based peer authentication
- Auto-reconnection support

## Requirements

**Server:**
- Node.js 22+
- pnpm 10+
- Cloudflare account with Workers enabled

**Client:**
- Python 3.12+
- uv package manager

## Installation

### Server

Deploy the relay server:

```bash
cd cloudflare-worker
pnpm install
pnpm wrangler login
pnpm run deploy
```

Note the deployed URL.

### Client

Install dependencies:

```bash
uv sync
```

Initialize configuration:

```bash
uv run wsclip init
```

Enter your Worker URL when prompted (use `wss://` protocol).

## Usage

### Start Syncing

**Auto mode** (automatic synchronization):

```bash
uv run wsclip start --mode auto
```

If no token exists, one will be generated. Share it with the other peer.

**Manual mode** (hotkey-triggered sync):

```bash
uv run wsclip start --mode manual
```

Default hotkey: `Alt+Shift+Return`

**Join with existing token:**

```bash
uv run wsclip start --mode auto --token XXXX-YYYY-ZZZZ
```

### Check Configuration

```bash
uv run wsclip status
```

## License

MIT
