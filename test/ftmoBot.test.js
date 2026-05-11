"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  AccountManager,
  AuditLogger,
  BotWebServer,
  CommandController,
  DIRECTIONS,
  DirectionValidator,
  ExecutionEngine,
  MarketShiftDetector,
  NewFtmoTradingBot,
  ORDER_SIDES,
  POSITION_TYPES,
  PaperBroker,
  PositionManager,
  ProfitExhaustionDetector,
  RiskEngine,
  SetupStateMachine,
  SlTpEngine,
  StrategyEngine,
  buildTradeProjection,
  createBotConfig,
  positionTypeForDirection,
  sideForDirection
} = require("../src");

function createFakeBroker() {
  const calls = {
    placeOrder: 0,
    closePosition: 0,
    partialClose: 0,
    modifyStopLoss: 0,
    modifyTakeProfit: 0,
    getAccountInfo: 0,
    getPrice: 0,
    getCandles: 0,
    getOpenPositions: 0
  };

  return {
    calls,
    async getAccountInfo() {
      calls.getAccountInfo += 1;
      return { id: "demo-account" };
    },
    async getPrice() {
      calls.getPrice += 1;
      return { bid: 1.1, ask: 1.1001 };
    },
    async getCandles({ timeframe }) {
      calls.getCandles += 1;
      return timeframe === "1m"
        ? [{ open: 1.1, high: 1.1003, low: 1.0999, close: 1.1001 }]
        : Array.from({ length: 30 }, () => ({ open: 1.1, high: 1.1004, low: 1.0996, close: 1.1001 }));
    },
    async getOpenPositions() {
      calls.getOpenPositions += 1;
      return [];
    },
    async placeOrder(order) {
      calls.placeOrder += 1;
      return { id: "order-1", order };
    },
    async closePosition(positionId) {
      calls.closePosition += 1;
      return { positionId };
    },
    async partialClose(positionId, volume) {
      calls.partialClose += 1;
      return { positionId, volume };
    },
    async modifyStopLoss(positionId, stopLoss) {
      calls.modifyStopLoss += 1;
      return { positionId, stopLoss };
    },
    async modifyTakeProfit(positionId, takeProfit) {
      calls.modifyTakeProfit += 1;
      return { positionId, takeProfit };
    }
  };
}

function createHarness(overrides = {}) {
  const config = createBotConfig(overrides);
  const logger = new AuditLogger();
  const broker = createFakeBroker();
  const commandController = new CommandController({ config, logger });
  const accountManager = new AccountManager({ config, broker, logger });
  const directionValidator = new DirectionValidator();
  const executionEngine = new ExecutionEngine({
    config,
    commandController,
    broker,
    directionValidator,
    accountManager,
    logger
  });
  const profitExhaustionDetector = new ProfitExhaustionDetector();
  const positionManager = new PositionManager({
    config,
    commandController,
    broker,
    logger,
    profitExhaustionDetector
  });
  const riskEngine = new RiskEngine({ config, accountManager, logger });
  const slTpEngine = new SlTpEngine({ config });
  const strategyEngine = new StrategyEngine({
    config,
    logger,
    setupStateMachine: new SetupStateMachine({ logger })
  });

  return { accountManager, broker, commandController, config, directionValidator, executionEngine, logger, positionManager, profitExhaustionDetector, riskEngine, slTpEngine, strategyEngine };
}

function validOrder(overrides = {}) {
  return {
    symbol: "EURUSD",
    setupDirection: DIRECTIONS.LONG,
    orderSide: ORDER_SIDES.BUY,
    entry: 1.1,
    stopLoss: 1.099,
    stopLossPips: 10,
    tp1: 1.101,
    tp2: 1.1015,
    rrToTp2: 1.5,
    lotSize: 10,
    dollarRisk: 100,
    tradeReason: "Bullish scalp setup with sweep, displacement, retracement, and 1m confirmation.",
    ...overrides
  };
}

function validSetup(overrides = {}) {
  return {
    valid: true,
    direction: DIRECTIONS.LONG,
    model: "SCALP",
    sweptLevel: 1.0996,
    structuralStop: 1.099,
    entryZone: { low: 1.0999, high: 1.1001 },
    reason: "Bullish scalp setup with full confirmation.",
    ...overrides
  };
}

function validLevels(overrides = {}) {
  return {
    valid: true,
    reason: "valid",
    entry: 1.1,
    stopLoss: 1.099,
    stopLossPips: 10,
    tp1: 1.101,
    tp2: 1.1015,
    rrToTp1: 1,
    rrToTp2: 1.5,
    rr: 1.5,
    ...overrides
  };
}

function validRiskInput(overrides = {}) {
  return {
    setup: validSetup(),
    levels: validLevels(),
    market: { symbol: "EURUSD", currentPrice: 1.1, spreadPips: 1 },
    openPositions: 0,
    directionValidation: { valid: true, reason: "valid" },
    ...overrides
  };
}

test("observation mode cannot place orders", async () => {
  const { executionEngine, broker } = createHarness({ mode: "OBSERVATION" });
  const result = await executionEngine.placeOrder(validOrder(), "strategy setup");
  assert.equal(result.executed, false);
  assert.equal(result.blocked, true);
  assert.equal(broker.calls.placeOrder, 0);
});

test("observation mode cannot close orders", async () => {
  const { positionManager, broker } = createHarness({ mode: "OBSERVATION" });
  const result = await positionManager.closePosition({ id: "pos-1" }, "manual close");
  assert.equal(result.closed, false);
  assert.equal(result.blocked, true);
  assert.equal(broker.calls.closePosition, 0);
});

test("observation mode cannot modify SL", async () => {
  const { positionManager, broker } = createHarness({ mode: "OBSERVATION" });
  const result = await positionManager.modifyStopLoss({ id: "pos-1" }, 1.1, "move SL to breakeven");
  assert.equal(result.modified, false);
  assert.equal(result.blocked, true);
  assert.equal(broker.calls.modifyStopLoss, 0);
});

test("daily P&L cannot close trades when disabled", async () => {
  const { positionManager, broker } = createHarness({ mode: "LIVE", enableDailyPnLBlocks: false });
  const result = await positionManager.handleDailyPnl({ id: "pos-1" }, { mustClose: true });
  assert.equal(result.closed, false);
  assert.equal(result.blocked, true);
  assert.equal(broker.calls.closePosition, 0);
});

test("daily P&L cannot block trades when disabled", () => {
  const { riskEngine } = createHarness({ mode: "LIVE", enableDailyPnLBlocks: false });
  const result = riskEngine.evaluateTrade(validRiskInput({ dailyPnlState: { blockTrading: true } }));
  assert.equal(result.allowed, true);
});

test("cooldown disabled means no cooldown blocking", () => {
  const { riskEngine } = createHarness({ mode: "LIVE", enableCooldown: false });
  const result = riskEngine.evaluateTrade(validRiskInput({ cooldownActive: true }));
  assert.equal(result.allowed, true);
});

test("off-hours does not block scalps when sessionAdjustedRules=false", () => {
  const { riskEngine } = createHarness({ mode: "LIVE", sessionAdjustedRules: false });
  const result = riskEngine.evaluateTrade(validRiskInput({ market: { symbol: "EURUSD", currentPrice: 1.1, spreadPips: 1, sessionLabel: "OFF_HOURS" } }));
  assert.equal(result.allowed, true);
});

test("H4 bullish does not hard-block shorts when strictHTFBias=false", () => {
  const { riskEngine } = createHarness({ mode: "LIVE", strictHTFBias: false });
  const result = riskEngine.evaluateTrade(validRiskInput({
    setup: validSetup({ direction: DIRECTIONS.SHORT }),
    market: { symbol: "EURUSD", currentPrice: 1.1, spreadPips: 1, htfBias: "BULLISH" }
  }));
  assert.equal(result.allowed, true);
});

test("H4 bearish does not hard-block longs when strictHTFBias=false", () => {
  const { riskEngine } = createHarness({ mode: "LIVE", strictHTFBias: false });
  const result = riskEngine.evaluateTrade(validRiskInput({ market: { symbol: "EURUSD", currentPrice: 1.1, spreadPips: 1, htfBias: "BEARISH" } }));
  assert.equal(result.allowed, true);
});

test("BUY cannot execute with SL above entry", async () => {
  const { executionEngine, broker } = createHarness({ mode: "LIVE" });
  const result = await executionEngine.placeOrder(validOrder({ stopLoss: 1.101 }), "strategy setup");
  assert.equal(result.executed, false);
  assert.equal(broker.calls.placeOrder, 0);
  assert.match(result.validation.reason, /SL below entry/);
});

test("SELL cannot execute with SL below entry", async () => {
  const { executionEngine, broker } = createHarness({ mode: "LIVE" });
  const result = await executionEngine.placeOrder(validOrder({ setupDirection: DIRECTIONS.SHORT, orderSide: ORDER_SIDES.SELL, stopLoss: 1.099, tp1: 1.099, tp2: 1.0985 }), "strategy setup");
  assert.equal(result.executed, false);
  assert.equal(broker.calls.placeOrder, 0);
  assert.match(result.validation.reason, /SL above entry/);
});

test("BUY cannot execute with TP below entry", async () => {
  const { executionEngine, broker } = createHarness({ mode: "LIVE" });
  const result = await executionEngine.placeOrder(validOrder({ tp1: 1.099, tp2: 1.098 }), "strategy setup");
  assert.equal(result.executed, false);
  assert.equal(broker.calls.placeOrder, 0);
  assert.match(result.validation.reason, /TP1 and TP2 above entry/);
});

test("SELL cannot execute with TP above entry", async () => {
  const { executionEngine, broker } = createHarness({ mode: "LIVE" });
  const result = await executionEngine.placeOrder(validOrder({ setupDirection: DIRECTIONS.SHORT, orderSide: ORDER_SIDES.SELL, stopLoss: 1.101, tp1: 1.101, tp2: 1.102 }), "strategy setup");
  assert.equal(result.executed, false);
  assert.equal(broker.calls.placeOrder, 0);
  assert.match(result.validation.reason, /TP1 and TP2 below entry/);
});

test("huge SL is rejected", () => {
  const { slTpEngine } = createHarness();
  const result = slTpEngine.build({ direction: DIRECTIONS.LONG, entry: 1.1, structuralStop: 1.098, model: "SCALP" });
  assert.equal(result.valid, false);
  assert.match(result.reason, /maxStopLossPips/);
});

test("huge TP is capped or rejected", () => {
  const { slTpEngine } = createHarness();
  const result = slTpEngine.validateSaneLevels({ direction: DIRECTIONS.LONG, entry: 1.1, stopLoss: 1.0992, tp1: 1.1008, tp2: 1.12, model: "SCALP" });
  assert.equal(result.valid, false);
  assert.match(result.reason, /unrealistically far/);
});

test("manual lot override works", () => {
  const { riskEngine } = createHarness({ manualLotOverrideEnabled: true, manualLotSize: 5 });
  const result = riskEngine.buildRiskPlan(10);
  assert.equal(result.manualOverrideUsed, true);
  assert.equal(result.lotSize, 5);
  assert.equal(result.expectedDollarLoss, 50);
  assert.equal(result.valid, true);
});

test("manual lot override is blocked if risk exceeds max", () => {
  const { riskEngine } = createHarness({ manualLotOverrideEnabled: true, manualLotSize: 20 });
  const result = riskEngine.buildRiskPlan(10);
  assert.equal(result.valid, false);
  assert.equal(result.expectedDollarLoss, 200);
  assert.match(result.reason, /exceeds/);
});

test("10k account max loss defaults to $100 at 1%", () => {
  const { riskEngine } = createHarness({ accountSize: 10000, riskPercent: 1 });
  assert.equal(riskEngine.buildRiskPlan(10).maxRiskDollars, 100);
});

test("25k account max loss defaults to $250 at 1%", () => {
  const { riskEngine } = createHarness({ accountSize: 25000, riskPercent: 1 });
  assert.equal(riskEngine.buildRiskPlan(10).maxRiskDollars, 250);
});

test("50k account max loss defaults to $500 at 1%", () => {
  const { riskEngine } = createHarness({ accountSize: 50000, riskPercent: 1 });
  assert.equal(riskEngine.buildRiskPlan(10).maxRiskDollars, 500);
});

test("profit exhaustion does not close losing trades", async () => {
  const { positionManager, broker } = createHarness({ mode: "LIVE", enableProfitExhaustionExit: true });
  const result = await positionManager.handleProfitExhaustion({ id: "pos-1", direction: DIRECTIONS.LONG, entry: 1.1, stopLoss: 1.099, tp1Hit: true }, {
    symbol: "EURUSD",
    currentPrice: 1.0995,
    approachesMajorOpposingLiquidity: true,
    momentumWeakens: true,
    wickRejectsContinuation: true,
    chochAgainstPosition: true
  });
  assert.equal(result.closed, false);
  assert.equal(broker.calls.closePosition, 0);
});

test("profit exhaustion can close winning trades after TP1", async () => {
  const { positionManager, broker } = createHarness({ mode: "LIVE", enableProfitExhaustionExit: true });
  const result = await positionManager.handleProfitExhaustion({ id: "pos-1", direction: DIRECTIONS.LONG, entry: 1.1, stopLoss: 1.099, tp1Hit: true }, {
    symbol: "EURUSD",
    currentPrice: 1.1012,
    approachesMajorOpposingLiquidity: true,
    momentumWeakens: true,
    wickRejectsContinuation: true,
    chochAgainstPosition: true
  });
  assert.equal(result.closed, true);
  assert.equal(broker.calls.closePosition, 1);
});

test("1m execution passes with zone touch + rejection", () => {
  const { strategyEngine } = createHarness();
  const result = strategyEngine.validateOneMinuteExecution({ direction: DIRECTIONS.LONG, entryZone: { low: 1.1, high: 1.1005 }, currentPrice: 1.1003, entry: 1.10025, tp1: 1.10225, candles1m: [{ open: 1.1002, high: 1.1006, low: 1.0998, close: 1.1005 }] });
  assert.equal(result.passes, true);
  assert.equal(result.confirmations.rejection, true);
});

test("1m execution passes with zone touch + micro BOS", () => {
  const { strategyEngine } = createHarness();
  const result = strategyEngine.validateOneMinuteExecution({
    direction: DIRECTIONS.LONG,
    entryZone: { low: 1.1, high: 1.1005 },
    currentPrice: 1.1003,
    entry: 1.10025,
    tp1: 1.10225,
    candles1m: [
      { open: 1.1001, high: 1.1003, low: 1.1, close: 1.1002 },
      { open: 1.1002, high: 1.10035, low: 1.1001, close: 1.1003 },
      { open: 1.1003, high: 1.1004, low: 1.1002, close: 1.10035 },
      { open: 1.10035, high: 1.1007, low: 1.1002, close: 1.1006 }
    ]
  });
  assert.equal(result.passes, true);
  assert.equal(result.confirmations.microBos, true);
});

test("1m execution fails when price is chasing too far", () => {
  const { strategyEngine } = createHarness();
  const result = strategyEngine.validateOneMinuteExecution({ direction: DIRECTIONS.LONG, entryZone: { low: 1.1004, high: 1.1006 }, currentPrice: 1.1005, entry: 1.1, tp1: 1.101, candles1m: [{ open: 1.1002, high: 1.1007, low: 1.0999, close: 1.1006 }] });
  assert.equal(result.passes, false);
  assert.match(result.reason, /40%/);
});

test("trade projection is generated before entry", () => {
  const { riskEngine } = createHarness();
  const projection = buildTradeProjection({ setup: validSetup(), levels: validLevels(), riskPlan: riskEngine.buildRiskPlan(10) });
  assert.equal(projection.entry, 1.1);
  assert.equal(projection.riskDollars, 100);
  assert.match(projection.expectedPath, /Expected path/);
});

test("trade reason is logged before entry", async () => {
  const { logger, riskEngine } = createHarness({ mode: "OBSERVATION" });
  const projection = buildTradeProjection({ setup: validSetup(), levels: validLevels(), riskPlan: riskEngine.buildRiskPlan(10) });
  logger.tradeProjection(projection);
  assert.match(logger.events.at(-1).tradeReason, /Bullish scalp setup/);
});

test("market shift detector outputs regime and bias", () => {
  const detector = new MarketShiftDetector();
  const result = detector.detect({ candles5m: Array.from({ length: 12 }, (_item, index) => ({ open: 1.1 + index * 0.0001, high: 1.1003 + index * 0.0001, low: 1.0998 + index * 0.0001, close: 1.1002 + index * 0.0001 })) });
  assert.ok(result.regime);
  assert.ok(result.bias);
});

test("BUY order maps to POSITION_TYPE_BUY", () => {
  assert.equal(sideForDirection(DIRECTIONS.LONG), ORDER_SIDES.BUY);
  assert.equal(positionTypeForDirection(DIRECTIONS.LONG), POSITION_TYPES.POSITION_TYPE_BUY);
});

test("SELL order maps to POSITION_TYPE_SELL", () => {
  assert.equal(sideForDirection(DIRECTIONS.SHORT), ORDER_SIDES.SELL);
  assert.equal(positionTypeForDirection(DIRECTIONS.SHORT), POSITION_TYPES.POSITION_TYPE_SELL);
});

test("website serves dashboard and read-only status API", async () => {
  const broker = createFakeBroker();
  const bot = new NewFtmoTradingBot({ broker, config: { mode: "OFF" } });
  const webServer = new BotWebServer({ bot, host: "127.0.0.1", port: 0 });
  const started = await webServer.start();
  const baseUrl = `http://127.0.0.1:${started.address.port}`;

  try {
    const page = await fetch(`${baseUrl}/`);
    const status = await fetch(`${baseUrl}/api/status`);
    const statusBody = await status.json();
    assert.equal(page.status, 200);
    assert.match(await page.text(), /FTMO Bot Dashboard/);
    assert.equal(status.status, 200);
    assert.equal(statusBody.mode, "OFF");
    assert.equal(broker.calls.placeOrder, 0);
    assert.equal(broker.calls.closePosition, 0);
  } finally {
    await webServer.stop();
  }
});
