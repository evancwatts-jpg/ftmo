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
TypeScript services under `server/bot/`:

- `config/botConfig` - central defaults and account/mode validation
- `core/commandController` - mode obedience and universal broker write guard
- `core/botRunner` - launchable bot runtime with `start`, `stop`, `tick`, and snapshots
- `account/accountManager` - account presets and broker account verification
- `market/marketData` - read-only account, price, candle, position, and spread helpers
- `strategy/*` - scalp/sniper setup detection, state machine, market shift, and 1m timing
- `risk/*` - lot sizing, SL/TP construction, and direction validation
- `execution/*` - guarded broker order boundary plus MetaApi and paper adapters
- `position/*` - approved close/partial/modify/profit-exhaustion management
- `observation/observationSimulator` - hypothetical trades only; never touches the broker
- `analytics/*` - trade projection, expectancy, and Monte Carlo simulation

The CLI entrypoint is:

```bash
npm start
```

The central config defaults to `OBSERVATION`; set `FTMO_BOT_MODE=OFF` when you
want the CLI to print only a read-only snapshot and exit.

## Website dashboard

Run the browser dashboard with:

```bash
npm run web
```

By default it listens on `http://0.0.0.0:3000` and uses the safe paper broker
unless `FTMO_BROKER_FACTORY` is provided.

Optional website settings:

```bash
FTMO_WEB_HOST=0.0.0.0
FTMO_WEB_PORT=3000
```

Website routes:

- `GET /` - dashboard UI
- `GET /api/status` - read-only dashboard snapshot
- `GET /api/config` - sanitized config flags
- `POST /api/mode` - manual mode switch: `OFF`, `OBSERVATION`, or `LIVE`
- `POST /api/start` - manually start the scan loop
- `POST /api/stop` - manually stop the scan loop
- `POST /api/tick` - manually run one scan

Manual scans in `LIVE` mode require the `x-confirm-live-action: true` header.
The website never bypasses the command controller or broker write guard.

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

The central config starts in `OBSERVATION`, disables daily P&L blocks, disables
cooldowns, disables structure exits, allows 24/5 trading, uses 1% default risk
with a 1% hard cap, and keeps HTF bias contextual unless explicitly changed.

## Tests

Run:

```bash
npm test
```

The test suite covers the requested safety guarantees, including observation
mode write blocking, disabled daily P&L/cooldown/session/HTF blockers,
direction validation, SL/TP sanity, account-size lot sizing, profit exhaustion,
and 1m execution confirmation behavior.
