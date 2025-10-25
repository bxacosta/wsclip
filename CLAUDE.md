# WSClip - Monorepo

WebSocket-based P2P clipboard synchronization system.

## Structure

- `apps/client/` - Python 3.12 CLI app (see `apps/client/CLAUDE.md`)
- `apps/relay/` - Cloudflare Worker relay (see `apps/relay/CLAUDE.md`)

IMPORTANT: Check project-specific CLAUDE.md files for detailed guidelines.

## Type Safety (Both Projects)

**Python (Client):**

- ALL code fully typed
- Use PEP 604: `X | Y` NOT `Union[X, Y]`
- Use `collections.abc.Callable` NOT `typing.Callable`
- NO `Any` unless justified

**TypeScript (Relay):**

- Strict mode enabled
- NO `any` - use `unknown` with type guards

## Naming Conventions

- **Python**: `snake_case.py`, `PascalCase` classes, `UPPER_SNAKE_CASE` constants
- **TypeScript**: `kebab-case.ts`, `PascalCase` classes, `camelCase` functions, `UPPER_SNAKE_CASE` constants

## Architecture (Both Projects)

- Layered architecture with clear separation
- Services NEVER call each other directly
- Orchestration in higher layers (Core/Index)
- Models/types are data only, NO logic
- Utils are pure functions, NO state

## Package Management

- **Client (Python)**: `uv` - use `pyproject.toml`, NOT `requirements.txt`
- **Relay (TypeScript)**: `pnpm` - Node 22.x required

## Type Checking

**Python**: `mypy src/wsclip`
**TypeScript**: `tsc --noEmit`

## Workflow

1. Define types/interfaces in `models/`
2. Implement with full type annotations
3. Verify type checker passes
4. Follow layer boundaries strictly
5. Document APIs (Python: Google-style, TypeScript: JSDoc)

## Key Files

- `apps/relay/wrangler.jsonc` - Cloudflare Worker config
- `apps/client/pyproject.toml` - Python package config
