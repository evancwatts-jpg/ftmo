"use strict";

const { AuditLogger } = require("./auditLogger");
const { FtmoBot } = require("./bot");
const { MODES, createBotConfig } = require("./config");
const { DIRECTIONS } = require("./directionValidator");

class NewFtmoTradingBot {
  constructor({
    broker,
    config = {},
    logger = new AuditLogger(),
    symbol = "EURUSD",
    scanIntervalMs = 60_000,
    candleLimits = { M1: 80, M5: 120 }
  } = {}) {
    if (!broker) {
      throw new Error("NewFtmoTradingBot requires a broker adapter");
    }

    this.name = "obedience-ftmo-bot";
    this.config = createBotConfig(config);
    this.logger = logger;
    this.symbol = symbol;
    this.scanIntervalMs = scanIntervalMs;
    this.candleLimits = candleLimits;
    this.core = new FtmoBot({ config: this.config, broker, logger });
    this.broker = broker;
    this.interval = null;
    this.lastTick = null;
    this.lastError = null;
  }

  async start({ runImmediately = true } = {}) {
    if (this.isRunning()) {
      return { started: false, reason: "bot is already running" };
    }

    if (this.config.mode === MODES.OFF) {
      this.logger.log("NO_ACTION", "bot_start", {
        bot: this.name,
        mode: this.config.mode,
        reason: "OFF mode does not start scan loop"
      });
      return { started: false, reason: "mode is OFF" };
    }

    if (runImmediately) {
      await this.tick();
    }

    this.interval = setInterval(() => {
      this.tick().catch((error) => {
        this.lastError = error;
        this.logger.log("ERROR", "bot_tick", {
          bot: this.name,
          message: error.message,
          stack: error.stack
        });
      });
    }, this.scanIntervalMs);

    this.logger.log("STARTED", "bot_start", {
      bot: this.name,
      mode: this.config.mode,
      symbol: this.symbol,
      scanIntervalMs: this.scanIntervalMs
    });

    return { started: true };
  }

  stop(reason = "manual stop") {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }

    this.logger.log("STOPPED", "bot_stop", {
      bot: this.name,
      mode: this.config.mode,
      reason
    });

    return { stopped: true };
  }

  isRunning() {
    return this.interval !== null;
  }

  setMode(mode, reason = "manual mode change") {
    if (this.isRunning()) {
      this.stop(reason);
    }

    this.config.mode = mode;
    this.core.commandController.setMode(mode);

    return {
      mode: this.config.mode,
      running: this.isRunning()
    };
  }

  async tick() {
    if (this.config.mode === MODES.OFF) {
      this.logger.log("NO_ACTION", "bot_tick", {
        bot: this.name,
        mode: this.config.mode,
        reason: "OFF mode does not scan"
      });
      return { acted: false, reason: "mode is OFF" };
    }

    const state = await this.buildReadOnlyState();
    const tradeResult = await this.core.scanAndMaybeTrade({
      candles5m: state.candles5m,
      candles1m: state.candles1m,
      market: state.market,
      openPositions: state.positions.length
    });

    let managementResults = [];
    if (this.config.mode === MODES.LIVE) {
      managementResults = await this.manageOpenPositions(state.positions, state.market);
    }

    this.lastTick = {
      timestamp: new Date().toISOString(),
      state,
      tradeResult,
      managementResults
    };

    return this.lastTick;
  }

  async buildReadOnlyState() {
    const [accountInfo, price, candles5m, candles1m, positions] = await Promise.all([
      this.core.marketDataEngine.getAccountInfo(),
      this.core.marketDataEngine.getPrice(this.symbol),
      this.core.marketDataEngine.getCandles({
        symbol: this.symbol,
        timeframe: "5m",
        limit: this.candleLimits.M5
      }),
      this.core.marketDataEngine.getCandles({
        symbol: this.symbol,
        timeframe: "1m",
        limit: this.candleLimits.M1
      }),
      this.core.marketDataEngine.getOpenPositions(this.symbol)
    ]);

    const market = this.buildMarketState(price);

    return {
      accountInfo,
      price,
      candles5m,
      candles1m,
      positions,
      market
    };
  }

  buildMarketState(price) {
    const bid = Number(price.bid);
    const ask = Number(price.ask);
    const currentPrice = Number.isFinite(bid) && Number.isFinite(ask)
      ? Number(((bid + ask) / 2).toFixed(5))
      : Number(price.price || price.close);

    return {
      symbol: this.symbol,
      currentPrice,
      bid,
      ask,
      spreadPips: Number.isFinite(bid) && Number.isFinite(ask)
        ? this.core.marketDataEngine.calculateSpreadPips({ bid, ask })
        : undefined,
      sessionLabel: this.getSessionLabel(new Date()),
      inNewsBlackout: false
    };
  }

  async manageOpenPositions(positions, market) {
    const results = [];

    for (const rawPosition of positions) {
      const position = this.normalizePosition(rawPosition);
      if (!position || !position.stopLoss || !position.entry) {
        continue;
      }

      results.push(await this.core.positionManager.handleProfitExhaustion(position, market));
    }

    return results;
  }

  normalizePosition(position) {
    const side = position.type || position.positionType || position.side;
    const direction = side === "POSITION_TYPE_SELL" || side === "SELL"
      ? DIRECTIONS.SHORT
      : DIRECTIONS.LONG;

    return {
      id: position.id || position.positionId,
      direction,
      entry: Number(position.entry || position.openPrice || position.price),
      stopLoss: Number(position.stopLoss || position.sl),
      tp1Hit: Boolean(position.tp1Hit),
      raw: position
    };
  }

  async getDashboardSnapshot() {
    const state = await this.buildReadOnlyState();

    return {
      bot: this.name,
      mode: this.config.mode,
      running: this.isRunning(),
      symbol: this.symbol,
      accountInfo: state.accountInfo,
      price: state.price,
      positions: state.positions,
      market: state.market,
      recentLogs: this.logger.events.slice(-50),
      lastTickAt: this.lastTick && this.lastTick.timestamp,
      lastError: this.lastError && this.lastError.message
    };
  }

  getSessionLabel(date) {
    const day = date.getUTCDay();
    if (day === 0 || day === 6) {
      return "OFF_HOURS";
    }

    return "REGULAR";
  }
}

module.exports = {
  NewFtmoTradingBot
};
