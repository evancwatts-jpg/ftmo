"use strict";

const { createBotConfig } = require("./config");
const { AccountManager } = require("./accountManager");
const { AuditLogger } = require("./auditLogger");
const { CommandController } = require("./commandController");
const { DirectionValidator, sideForDirection } = require("./directionValidator");
const { ExecutionEngine } = require("./executionEngine");
const { MarketDataEngine } = require("./marketDataEngine");
const { ObservationSimulator } = require("./observationSimulator");
const { PositionManager } = require("./positionManager");
const { ProfitExhaustionDetector } = require("./profitExhaustionDetector");
const { RiskEngine } = require("./riskEngine");
const { SetupStateMachine } = require("./setupStateMachine");
const { SlTpEngine } = require("./slTpEngine");
const { StrategyEngine } = require("./strategyEngine");

class FtmoBot {
  constructor({ config = {}, broker, logger = new AuditLogger() } = {}) {
    this.config = createBotConfig(config);
    this.logger = logger;
    this.broker = broker;
    this.commandController = new CommandController({ config: this.config, logger });
    this.accountManager = new AccountManager({ config: this.config, broker, logger });
    this.marketDataEngine = new MarketDataEngine({ broker });
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
    this.strategyEngine = new StrategyEngine({
      config: this.config,
      logger,
      setupStateMachine: this.setupStateMachine
    });
    this.observationSimulator = new ObservationSimulator({ config: this.config, logger });
    this.profitExhaustionDetector = new ProfitExhaustionDetector();
    this.positionManager = new PositionManager({
      config: this.config,
      commandController: this.commandController,
      broker,
      logger,
      profitExhaustionDetector: this.profitExhaustionDetector
    });
  }

  async scanAndMaybeTrade({ candles5m, candles1m, market, openPositions = 0 }) {
    if (!this.commandController.canScan({ dashboardRequest: false })) {
      return { acted: false, reason: "bot is OFF" };
    }

    const setup = this.strategyEngine.detectSetup({
      candles5m,
      candles1m,
      currentPrice: market.currentPrice
    });

    if (!setup || !setup.valid) {
      return { acted: false, reason: setup && setup.reason };
    }

    const entry = (setup.entryZone.low + setup.entryZone.high) / 2;
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
        direction: setup.direction,
        reason: levels.reason,
        currentPrice: market.currentPrice,
        entryZone: setup.entryZone,
        spread: market.spreadPips,
        rr: levels.rr,
        mode: this.config.mode
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
      market,
      openPositions,
      dailyPnlState: market.dailyPnlState,
      cooldownActive: market.cooldownActive,
      directionValidation
    });

    if (!riskPlan.allowed) {
      return { acted: false, reason: riskPlan.reasons.join("; ") };
    }

    if (this.config.mode === "OBSERVATION") {
      return this.observationSimulator.recordHypotheticalTrade({
        setup,
        levels,
        sizing: riskPlan,
        market
      });
    }

    return this.executionEngine.placeOrder({
      symbol: market.symbol || "EURUSD",
      setupDirection: setup.direction,
      orderSide,
      entry: levels.entry,
      stopLoss: levels.stopLoss,
      stopLossPips: levels.stopLossPips,
      tp1: levels.tp1,
      tp2: levels.tp2,
      rr: levels.rr,
      lotSize: riskPlan.lotSize,
      dollarRisk: riskPlan.dollarRisk
    });
  }
}

module.exports = {
  FtmoBot
};
