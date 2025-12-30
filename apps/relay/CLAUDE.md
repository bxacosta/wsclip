# Development Guidelines

## Critical Rules (NO EXCEPTIONS)

- All code, comments, logs, and documentation must be written in English
- NO emojis anywhere (code, comments, logs, errors, documentation)
- Use a formal, impersonal tone (third person)
- Always use absolute imports with `@/` prefix (never relative imports like `../`)
- Initialize logger lazily: call `getLogger()` inside functions, never at module level
- When modifying code in `src/`, always run `bun run fix` first, then `bun run check` (in that order)
- Add dependencies without specifying a version: `bun add <package>` (fetches latest by default)
- Before implementing any feature with a library, verify current API documentation using Context7 or web search to avoid
  outdated patterns

## Project Principles

- **Single Responsibility Principle**: Each module, class, and function should have one clear purpose
- **Self-documenting code**: Prioritize clear naming and structure over comments
- **Simplicity over complexity**: Favor straightforward implementations instead of overengineered solutions
- **Elegant solutions**: Clean, maintainable code is more valuable than clever code

## Tech Stack

- **Runtime**: Bun 1.3+ | **Language**: TypeScript 5.x (strict mode)
- **WebSocket**: Bun native API | **Validation**: Zod 4.x | **Logging**: Pino 10.x | **Linter**: Biome 2.x

## Documentation Verification

Before implementing features with external libraries:

1. Use Context7 tool to query library-specific documentation with implementation examples
2. Search official docs to verify API patterns match the current library version
3. Check for deprecations to ensure methods and patterns are not deprecated
4. Validate patterns: Modern Bun WebSocket upgrade returns boolean, not Response (2025 pattern)

## Code Modification Workflow

When changing code in `src/`:

1. Make modifications
2. Run `bun run fix` (auto-format and fix linting issues)
3. Run `bun run check` (validate remaining issues)
4. Fix any remaining errors manually
5. Run `bun run build` (verify TypeScript compilation)

## Code Standards

**Naming**: camelCase (variables/functions), PascalCase (types/interfaces), UPPER_SNAKE_CASE (constants), kebab-case
(files and directories)

**TypeScript**: Use `as const` for readonly objects, discriminated unions with `type` field, singleton exports for
managers, strict mode enabled, never use `any`, avoid non-null assertions (`!`)

**Biome**: No unused variables (prefix `_` if intentional), no `any`, no `!`, double quotes, tabs, all errors fixed
before commit

## Logging (CRITICAL)

- **Lazy initialization**: Always call `getLogger()` inside function scope, never at module level (causes initialization
  errors)
- **Child loggers**: Use `.child()` for context-specific loggers with automatic context inclusion
- **Error serialization**: Use `{ err: error }` pattern for automatic stack trace serialization
- **Shutdown**: Call `await flushLogger()` before process.exit()
- **Privacy**: Never log sensitive data (secrets, tokens, user data content)

## Validation (Zod)

- Use Zod for all runtime validation (env vars, message payloads, API inputs)
- Access validation errors via `result.error.issues[0]`, not `.errors[0]`
- Implement layered validation: strict for headers, semi-strict for core payload, passthrough for metadata
- Chain transformations (`.transform()`, `.trim()`) before refinements (`.refine()`)

## Bun WebSocket Specifics

- **Upgrade pattern**: `server.upgrade()` returns boolean (true on success), not Response object
- **Pub/Sub**: Use native `ws.subscribe()`, `ws.publish()`, `ws.unsubscribe()` for channel broadcasts (7x faster)
- **Backpressure**: Check `ws.send()` return value: `> 0` = sent, `-1` = queued (backpressure), `0` = dropped
- **Typed WebSocket**: Define `WebSocketData` interface and use `ServerWebSocket<WebSocketData>` for type safety
