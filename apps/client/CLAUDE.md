# Client - Python CLI Application

Python 3.12 CLI for clipboard synchronization using service composition with strict layer boundaries.

## Setup & Commands

```bash
cd apps/client
uv venv --python 3.12 && uv sync && uv pip install -e .
uv run wsclip start --mode auto|manual
```

## Architecture - Service Composition

**Components:**
- `core/sync_manager.py` - Orchestrates all services (auto/manual modes, reconnection)
- `services/websocket.py` - WebSocket connection, auth, message registry
- `services/clipboard.py` - Clipboard monitoring via pyperclip
- `services/hotkeys.py` - Global hotkeys via pynput (thread-safe callbacks)
- `core/connection.py` - Reconnection strategy (exponential backoff 1s→30s)

**Layer Rules (`src/wsclip/`):**
- `cli/` - Click commands, NO business logic
- `core/` - Orchestration only (SyncManager, strategies)
- `services/` - External I/O only
- `models/` - Dataclasses, NO logic
- `utils/` - Pure functions, NO state
- `config/` - Constants only

**CRITICAL: Services compose in core, NEVER call each other directly.**
```python
# CORRECT: SyncManager orchestrates
class SyncManager:
    def __init__(self):
        self.ws = WebSocketService()
        self.clipboard = ClipboardService()

    async def start(self):
        await self.ws.connect()
        await self.clipboard.start_monitoring()


# WRONG: Service calling service
class WebSocketService:
    def on_message(self, msg):
        self.clipboard.set(msg.content)  # NEVER DO THIS
```

## Type Safety (NON-NEGOTIABLE)

**MUST use PEP 604 syntax:**
- `X | Y` NOT `Union[X, Y]`
- `X | None` NOT `Optional[X]`
- `collections.abc.Callable` NOT `typing.Callable`
- `Literal` for type-safe enums
- NO `Any` unless justified
- ALL parameters, returns, and attributes typed

```python
from typing import Literal
from dataclasses import dataclass, field
from collections.abc import Callable, Awaitable

@dataclass
class Message:
    type: Literal['text', 'image']
    content: str
    metadata: dict[str, str] | None = None  # PEP 604

async def monitor(
    on_change: Callable[[str], Awaitable[None]]  # collections.abc
) -> None:
    pass
```

## Async Patterns (CRITICAL)

**1. MUST use asyncio.TaskGroup (prevents memory leaks):**
```python
async def start(self):
    async with asyncio.TaskGroup() as tg:
        tg.create_task(self.ws.start())
        tg.create_task(self.clipboard.monitor())
    # Auto-cancelled on exit - DO NOT use bare create_task()
```

**2. Thread-safe callbacks (pynput runs in sync thread):**
```python
def hotkey_callback(self):  # Sync function from pynput
    asyncio.run_coroutine_threadsafe(self.async_handler(), self.loop)
```

**3. Handle CancelledError on shutdown:**
```python
async def stop(self):
    self._task.cancel()
    try:
        await self._task
    except asyncio.CancelledError:
        pass
```

## Output & Logging

**NEVER use print() - MUST use Rich console:**
```python
from wsclip.utils.logger import print_success, print_error, print_warning, print_info, setup_logger

print_success("Connected to relay")
self.logger = setup_logger("service_name", "INFO")
```

## Key Locations

- **Config**: `config.yaml` (root, not in apps/client/)
- **Models**: `src/wsclip/models/config.py`, `messages.py`
- **Constants**: `src/wsclip/config/constants.py`
- **Serialization**: `message_to_dict()`, `dict_to_message()` handle `from_peer` ↔ `from` mapping

## Workflow

1. Define types in `models/`
2. Implement logic in `core/` (fully typed)
3. Create I/O services in `services/`
4. Orchestrate in SyncManager
5. Verify: `mypy src/wsclip`
