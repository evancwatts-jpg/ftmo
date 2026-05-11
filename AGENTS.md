# AGENTS.md

## Cursor Cloud specific instructions

### Overview

This is a standalone Node.js (CommonJS) FTMO trading bot with **zero npm dependencies**. No build step, no Docker, no databases, no external services required for development.

### Key commands

| Task | Command |
|---|---|
| Run tests | `npm test` |
| Run bot (OFF mode, default) | `npm start` |
| Run bot (OBSERVATION mode) | `npm run bot:observation` |

### Notes

- **No linter is configured.** There is no ESLint, Prettier, or similar tooling in the project.
- Tests use the Node.js built-in test runner (`node:test` + `node:assert/strict`). All 27 tests are self-contained and use `PaperBroker` stubs — no network or external services needed.
- The bot defaults to `OFF` mode when `FTMO_BOT_MODE` is unset. OFF mode prints a JSON dashboard snapshot and exits immediately.
- `OBSERVATION` mode starts a scan loop using `PaperBroker` (simulated market data). It runs indefinitely until killed.
- `LIVE` mode requires a `FTMO_BROKER_FACTORY` env var pointing to an external MetaApi/MT5 adapter module (not included in the repo).
- All bot configuration is via environment variables; see `README.md` for the full list.
