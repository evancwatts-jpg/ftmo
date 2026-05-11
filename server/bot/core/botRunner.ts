import { createBotConfig, MODES, type BotConfig, type BotMode } from "../config/botConfig";
import { AccountManager } from "../account/accountManager";
import { buildTradeProjection } from "../analytics/tradeProjection";
import { DirectionValidator, sideForDirection } from "../risk/directionValidator";
import { ExecutionEngine } from "../execution/orderExecutor";
import { MarketDataEngine } from "../market/marketData";
import { buildMarketState, getSessionLabel } from "../market/marketContext";
import { MarketShiftDetector } from "../strategy/marketShiftDetector";
import { ObservationSimulator } from "../observation/observationSimulator";
import { PositionManager } from "../position/positionManager";
import { ProfitExhaustionDetector, type ManagedPosition } from "../position/profitExhaustion";
import { RiskEngine } from "../risk/riskEngine";
import { SetupStateMachine } from "../strategy/setupStateMachine";
import { SlTpEngine } from "../risk/slTpEngine";
import { StrategyEngine } from "../strategy/strategyEngine";
import { DIRECTIONS, type Candle, type MarketState } from "../strategy/strategyTypes";
import { AuditLogger } from "./logger";
import { CommandController } from "./commandController";

export class FtmoBot {
  config: BotConfig;
  logger: AuditLogger;
  broker: any;
  commandController: CommandController;
  accountManager: AccountManager;
  marketDataEngine: MarketDataEngine;
  directionValidator: DirectionValidator;
  slTpEngine: SlTpEngine;
  riskEngine: RiskEngine;
  executionEngine: ExecutionEngine;
  setupStateMachine: SetupStateMachine;
  strategyEngine: StrategyEngine;
  observationSimulator: ObservationSimulator;
  profitExhaustionDetector: ProfitExhaustionDetector;
  positionManager: PositionManager;
  marketShiftDetector: MarketShiftDetector;

  constructor({ config = {}, broker, logger = new AuditLogger() }: {
    config?: Partial<BotConfig>;
    broker: any;
    logger?: AuditLogger;
  }) {
    this.config = createBotConfig(config);
    this.logger = logger;
    this.broker = broker;
    this.commandController = new CommandController({ config: this.config, logger });
    this.accountManager = new AccountManager({ config: this.config, broker, logger });
    this.marketDataEngine = new MarketDataEngine({ broker, symbol: this.config.symbol });
    this.directionValidator = new DirectionValidator();
    this.slTpEngine = new SlTpEngine({ config: this.config });
    this.riskEngine = new RiskEngine({ config: this.config, accountManager: this.accountManager, logger });
    this.executionEngine = new ExecutionEngine({
      config: this.config,
      commandController: this.commandController,
      broker,
      directionValidator: this.directionValidator,
      accountManager: this.accountManager,
      logger
    });
    this.setupStateMachine = new SetupStateMachine({ logger });
    this.strategyEngine = new StrategyEngine({ config: this.config, logger, setupStateMachine: this.setupStateMachine });
    this.observationSimulator = new ObservationSimulator({ config: this.config, logger });
    this.profitExhaustionDetector = new ProfitExhaustionDetector();
    this.positionManager = new PositionManager({
      config: this.config,
      commandController: this.commandController,
      broker,
      logger,
      profitExhaustionDetector: this.profitExhaustionDetector
    });
    this.marketShiftDetector = new MarketShiftDetector();
  }

  async scanAndMaybeTrade({ candles5m = [], candles1m = [], candles15m = [], market, openPositions = 0 }: {
    candles5m?: Candle[];
    candles1m?: Candle[];
    candles15m?: Candle[];
    market: MarketState;
    openPositions?: number;
  }): Promise<Record<string, unknown>> {
    if (!this.commandController.canScan({ dashboardRequest: false })) {
      return { acted: false, reason: "bot is OFF" };
    }

    const marketShift = market.marketShift || this.marketShiftDetector.detect({ candles15m, candles5m });
    const setup = this.strategyEngine.detectSetup({
      candles5m,
      candles1m,
      currentPrice: market.currentPrice,
      marketShift
    });

    if (!setup) {
      return { acted: false, reason: "no valid setup" };
    }

    const entry = Number(((setup.entryZone.low + setup.entryZone.high) / 2).toFixed(5));
    const levels = this.slTpEngine.build({
      direction: setup.direction,
      entry,
      structuralStop: setup.structuralStop,
      model: setup.model,
      opposingLiquidityPrice: market.opposingLiquidityPrice
    });

    if (!levels.valid) {
      this.logger.noTrade({
        state: "sltp_validation",
        currentPrice: market.currentPrice,
        spread: market.spreadPips,
        mode: this.config.mode,
        direction: setup.direction,
        reason: levels.reason,
        entryZone: setup.entryZone,
        marketShift,
        rr: levels.rrToTp2,
        model: setup.model
      });
      return { acted: false, reason: levels.reason };
    }

    const orderSide = sideForDirection(setup.direction);
    const directionValidation = this.directionValidator.validate({
      setupDirection: setup.direction,
      orderSide,
      entry: levels.entry,
      stopLoss: levels.stopLoss,
      tp1: levels.tp1,
      tp2: levels.tp2
    });
    const riskPlan = this.riskEngine.evaluateTrade({
      setup,
      levels,
      market: { ...market, marketShift },
      openPositions,
      dailyPnlState: market.dailyPnlState,
      cooldownActive: market.cooldownActive,
      directionValidation
    });

    if (!riskPlan.allowed) {
      return { acted: false, reason: riskPlan.reasons.join("; ") };
    }

    const projection = buildTradeProjection({ setup, levels, riskPlan });
    this.logger.tradeProjection(projection as unknown as Record<string, unknown>);

    if (this.config.mode === "OBSERVATION") {
      return this.observationSimulator.recordHypotheticalTrade({
        setup,
        levels,
        sizing: riskPlan,
        market: { ...market, marketShift },
        projection
      });
    }

    return this.executionEngine.placeOrder({
      symbol: this.config.symbol,
      setupDirection: setup.direction,
      orderSide,
      entry: levels.entry,
      stopLoss: levels.stopLoss,
      stopLossPips: levels.stopLossPips,
      tp1: levels.tp1,
      tp2: levels.tp2,
      rrToTp2: levels.rrToTp2,
      lotSize: riskPlan.lotSize,
      dollarRisk: riskPlan.expectedDollarLoss,
      manualOverrideUsed: riskPlan.manualOverrideUsed,
      tradeReason: projection.tradeReason,
      projection
    }, projection.tradeReason);
  }
}

export class NewFtmoTradingBot {
  name = "obedience-ftmo-bot";
  config: BotConfig;
  logger: AuditLogger;
  symbol: "EURUSD";
  scanIntervalMs: number;
  candleLimits: { M1: number; M5: number; M15: number };
  core: FtmoBot;
  broker: any;
  interval: NodeJS.Timeout | null = null;
  lastTick: unknown = null;
  lastError: Error | null = null;

  constructor({
    broker,
    config = {},
    logger = new AuditLogger(),
    symbol = "EURUSD",
    scanIntervalMs = 60_000,
    candleLimits = { M1: 80, M5: 120, M15: 80 }
  }: {
    broker: any;
    config?: Partial<BotConfig>;
    logger?: AuditLogger;
    symbol?: "EURUSD";
    scanIntervalMs?: number;
    candleLimits?: { M1: number; M5: number; M15?: number };
  }) {
    if (!broker) {
      throw new Error("NewFtmoTradingBot requires a broker adapter");
    }

    this.config = createBotConfig({ ...config, symbol });
    this.logger = logger;
    this.symbol = symbol;
    this.scanIntervalMs = scanIntervalMs;
    this.candleLimits = { M15: 80, ...candleLimits };
    this.core = new FtmoBot({ config: this.config, broker, logger });
    this.broker = broker;
  }

  async start({ runImmediately = true } = {}): Promise<Record<string, unknown>> {
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
      this.tick().catch((error: Error) => {
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

  stop(reason = "manual stop"): Record<string, unknown> {
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

  isRunning(): boolean {
    return this.interval !== null;
  }

  setMode(mode: BotMode, reason = "manual mode change"): Record<string, unknown> {
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

  async tick(): Promise<Record<string, unknown>> {
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
      candles15m: state.candles15m,
      market: state.market,
      openPositions: state.positions.length
    });

    let managementResults: unknown[] = [];
    if (this.config.mode === MODES.LIVE) {
      managementResults = await this.manageOpenPositions(state.positions, state.market);
    }

    this.lastTick = {
      timestamp: new Date().toISOString(),
      state,
      tradeResult,
      managementResults
    };

    return this.lastTick as Record<string, unknown>;
  }

  async buildReadOnlyState(): Promise<{
    accountInfo: unknown;
    price: Record<string, number>;
    candles5m: Candle[];
    candles1m: Candle[];
    candles15m: Candle[];
    positions: any[];
    market: MarketState;
  }> {
    const [accountInfo, price, candles5m, candles1m, candles15m, positions] = await Promise.all([
      this.core.marketDataEngine.getAccountInfo(),
      this.core.marketDataEngine.getPrice(this.symbol),
      this.core.marketDataEngine.getCandles({ symbol: this.symbol, timeframe: "5m", limit: this.candleLimits.M5 }) as Promise<Candle[]>,
      this.core.marketDataEngine.getCandles({ symbol: this.symbol, timeframe: "1m", limit: this.candleLimits.M1 }) as Promise<Candle[]>,
      this.core.marketDataEngine.getCandles({ symbol: this.symbol, timeframe: "15m", limit: this.candleLimits.M15 }) as Promise<Candle[]>,
      this.core.marketDataEngine.getOpenPositions(this.symbol)
    ]);
    const market = buildMarketState({ symbol: this.symbol, price, marketDataEngine: this.core.marketDataEngine });
    market.marketShift = this.core.marketShiftDetector.detect({ candles15m, candles5m });
    market.htfBias = market.marketShift.bias;

    return { accountInfo, price, candles5m, candles1m, candles15m, positions, market };
  }

  async manageOpenPositions(positions: any[], market: MarketState): Promise<unknown[]> {
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

  normalizePosition(position: any): ManagedPosition | null {
    const side = position.type || position.positionType || position.side;
    const direction = side === "POSITION_TYPE_SELL" || side === "SELL" ? DIRECTIONS.SHORT : DIRECTIONS.LONG;
    const id = position.id || position.positionId;
    if (!id) {
      return null;
    }

    return {
      id,
      direction,
      entry: Number(position.entry || position.openPrice || position.price),
      stopLoss: Number(position.stopLoss || position.sl),
      tp1Hit: Boolean(position.tp1Hit),
      raw: position
    };
  }

  async getDashboardSnapshot(): Promise<Record<string, unknown>> {
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
      lastTickAt: (this.lastTick as any)?.timestamp,
      lastError: this.lastError?.message
    };
  }

  getSessionLabel(date: Date): string {
    return getSessionLabel(date);
  }
}
