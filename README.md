# New FTMO bot

This repository now contains a clean, standalone FTMO trading bot rebuilt around
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

The bot has a dedicated runtime entrypoint and is split into single-purpose
modules under `src/`:

- `newBot` - launchable bot runtime with `start`, `stop`, `tick`, and dashboard snapshot
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
- `paperBroker` - safe local broker for OFF/OBSERVATION smoke runs
- `runtimeConfig` - environment variable config and broker factory loading

The CLI entrypoint is:

```bash
npm start
```

or:

```bash
node bin/new-ftmo-bot.js
```

The default mode is `OFF`, so launching the bot without environment variables
only prints a read-only dashboard snapshot and does not scan or trade.

## Runtime environment

Configure the new bot with environment variables:

```bash
FTMO_BOT_MODE=OBSERVATION
FTMO_ACCOUNT_SIZE=25000
FTMO_RISK_PERCENT=0.25
FTMO_STRATEGY_MODE=BOTH
FTMO_SYMBOL=EURUSD
FTMO_SCAN_INTERVAL_MS=60000
```

To wire a real MetaApi/MT5 connection, provide a broker factory:

```bash
FTMO_BROKER_FACTORY=/absolute/path/to/brokerFactory.js npm start
```

The factory must export `createBroker({ env })` or a default function returning
an object with these methods:

- `getAccountInfo()`
- `getPrice(symbol)`
- `getCandles({ symbol, timeframe, limit })`
- `getOpenPositions(symbol)`
- `placeOrder(order)`
- `closePosition(positionId)`
- `partialClose(positionId, volume)`
- `modifyStopLoss(positionId, stopLoss)`
- `modifyTakeProfit(positionId, takeProfit)`

All write methods still pass through the bot's universal broker write guard.

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
