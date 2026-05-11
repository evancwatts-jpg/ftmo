# FTMO bot core

This repository now contains a clean FTMO trading bot core rebuilt around
obedience first:

1. obey mode
2. obey direction
3. obey risk
4. obey SL/TP limits
5. wait for a setup
6. execute cleanly
7. manage profit intentionally
8. avoid hidden behavior

## Architecture

The bot is split into single-purpose modules under `src/`:

- `config` - central `botConfig` defaults and account/mode validation
- `commandController` - mode obedience and universal broker write guard
- `accountManager` - account presets, broker account reload, transient state reset
- `marketDataEngine` - read-only account, price, candle, position, and spread helpers
- `strategyEngine` - scalp/sniper setup detection and 1m execution confirmation
- `setupStateMachine` - sweep -> displacement -> retracement -> execution states
- `riskEngine` - spread/news/open-position/RR checks and lot sizing
- `slTpEngine` - capped risk-first SL/TP construction and sanity validation
- `directionValidator` - LONG/BUY and SHORT/SELL orientation enforcement
- `executionEngine` - only module that places new broker orders
- `positionManager` - approved close/partial/modify/profit-protection writes
- `observationSimulator` - hypothetical trades only; never touches the broker
- `profitExhaustionDetector` - scored profit-only exit detection
- `auditLogger` - structured audit events; no execution side effects
- `brokerAdapter` - MetaApi/MT5 adapter boundary

## Default config

The central config starts in `OFF`, disables daily P&L blocks, disables
cooldowns, disables structure exits, allows 24/5 trading, and keeps HTF bias
contextual unless explicitly changed.

## Tests

Run:

```bash
npm test
```

The test suite covers the requested safety guarantees, including observation
mode write blocking, disabled daily P&L/cooldown/session/HTF blockers,
direction validation, SL/TP sanity, account-size lot sizing, profit exhaustion,
and 1m execution confirmation behavior.
