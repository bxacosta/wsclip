# WSClip Client

Python client for WebSocket-based clipboard synchronization.

## Installation

From the project root:

```bash
cd apps/client
uv pip install -e .
```

## Usage

### Initialize configuration

```bash
wsclip init
```

### Start clipboard sync

**Manual mode** (use hotkey to send):
```bash
wsclip start --mode manual
```

**Auto mode** (automatic monitoring):
```bash
wsclip start --mode auto
```

### Join with token

```bash
wsclip start --mode auto --token XXXX-YYYY-ZZZZ
```

### Check status

```bash
wsclip status
```

## Project Structure

```
src/wsclip/
├── cli/              # CLI commands and app
│   ├── app.py       # Click application
│   └── commands.py  # Command implementations
│
├── core/            # Business logic
│   ├── sync_manager.py   # Orchestrates sync
│   ├── connection.py     # Connection management
│   └── pairing.py        # Token pairing
│
├── services/        # External services
│   ├── websocket.py      # WebSocket client
│   ├── clipboard.py      # Clipboard operations
│   └── hotkeys.py        # Hotkey capture
│
├── models/          # Data models
│   ├── config.py         # Configuration
│   └── messages.py       # WebSocket messages
│
├── utils/           # Utilities
│   ├── logger.py         # Logging
│   ├── validators.py     # Validation
│   └── helpers.py        # Helper functions
│
└── config/          # Configuration
    ├── settings.py       # Default settings
    └── constants.py      # Constants
```

## Architecture

This client follows a pragmatic layered architecture:

- **CLI Layer** (`cli/`): User interface, command parsing
- **Core Layer** (`core/`): Business logic, orchestration
- **Service Layer** (`services/`): External interactions (WebSocket, clipboard, hotkeys)
- **Models** (`models/`): Data structures
- **Utils** (`utils/`): Shared utilities
- **Config** (`config/`): Settings and constants

## Development

### Run from source

```bash
cd apps/client
python -m wsclip start --mode auto
```

### Build

```bash
cd apps/client
uv build
```
