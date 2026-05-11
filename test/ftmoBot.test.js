"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  AccountManager,
  AuditLogger,
  CommandController,
  DirectionValidator,
  DIRECTIONS,
  ExecutionEngine,
  ORDER_SIDES,
  PositionManager,
  ProfitExhaustionDetector,
  RiskEngine,
  SetupStateMachine,
  SlTpEngine,
  StrategyEngine,
  createBotConfig
} = require("../src");

function createFakeBroker() {
  const calls = {
    placeOrder: 0,
    closePosition: 0,
    partialClose: 0,
    modifyStopLoss: 0,
    modifyTakeProfit: 0
  };

  return {
    calls,
    async getAccountInfo() {
      return { id: "demo-account" };
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

  return {
    accountManager,
    broker,
    commandController,
    config,
    directionValidator,
    executionEngine,
    logger,
    positionManager,
    profitExhaustionDetector,
    riskEngine,
    slTpEngine,
    strategyEngine
  };
}

function validOrder(overrides = {}) {
  return {
    symbol: "EURUSD",
    setupDirection: DIRECTIONS.LONG,
    orderSide: ORDER_SIDES.BUY,
    entry: 1.1,
    stopLoss: 1.098,
    stopLossPips: 20,
    tp1: 1.102,
    tp2: 1.103,
    rr: 1.5,
    lotSize: 1,
    dollarRisk: 25,
    ...overrides
  };
}

function validRiskInput(overrides = {}) {
  return {
    setup: {
      direction: DIRECTIONS.LONG,
      model: "SCALP",
      entryZone: { low: 1.0998, high: 1.1002 }
    },
    levels: {
      entry: 1.1,
      stopLoss: 1.098,
      stopLossPips: 20,
      tp1: 1.102,
      tp2: 1.103,
      rr: 1.5
    },
    market: {
      currentPrice: 1.1,
      spreadPips: 1.1
    },
    openPositions: 0,
    directionValidation: { valid: true, reason: "valid" },
    ...overrides
  };
}

test("observation mode cannot place order", async () => {
  const { executionEngine, broker } = createHarness({ mode: "OBSERVATION" });

  const result = await executionEngine.placeOrder(validOrder(), "strategy setup");

  assert.equal(result.executed, false);
  assert.equal(result.blocked, true);
  assert.equal(broker.calls.placeOrder, 0);
});

test("observation mode cannot close order", async () => {
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

test("daily P&L cannot close trade when disabled", async () => {
  const { positionManager, broker } = createHarness({ mode: "LIVE", enableDailyPnLBlocks: false });

  const result = await positionManager.handleDailyPnl({ id: "pos-1" }, { mustClose: true });

  assert.equal(result.closed, false);
  assert.equal(result.blocked, true);
  assert.equal(broker.calls.closePosition, 0);
});

test("daily P&L cannot block trade when disabled", () => {
  const { riskEngine } = createHarness({ mode: "LIVE", enableDailyPnLBlocks: false });

  const result = riskEngine.evaluateTrade(validRiskInput({
    dailyPnlState: { blockTrading: true }
  }));

  assert.equal(result.allowed, true);
});

test("cooldown disabled means no trade cooldown", () => {
  const { riskEngine } = createHarness({ mode: "LIVE", enableCooldown: false });

  const result = riskEngine.evaluateTrade(validRiskInput({ cooldownActive: true }));

  assert.equal(result.allowed, true);
});

test("off-hours does not block scalps when sessionAdjustedRules=false", () => {
  const { riskEngine } = createHarness({ mode: "LIVE", sessionAdjustedRules: false });

  const result = riskEngine.evaluateTrade(validRiskInput({
    market: { currentPrice: 1.1, spreadPips: 1, sessionLabel: "OFF_HOURS" }
  }));

  assert.equal(result.allowed, true);
});

test("H4 bullish does not hard-block shorts when strictHTFBias=false", () => {
  const { riskEngine } = createHarness({ mode: "LIVE", strictHTFBias: false });

  const result = riskEngine.evaluateTrade(validRiskInput({
    setup: {
      direction: DIRECTIONS.SHORT,
      model: "SCALP",
      entryZone: { low: 1.0998, high: 1.1002 }
    },
    market: { currentPrice: 1.1, spreadPips: 1, htfBias: "BULLISH" }
  }));

  assert.equal(result.allowed, true);
});

test("H4 bearish does not hard-block longs when strictHTFBias=false", () => {
  const { riskEngine } = createHarness({ mode: "LIVE", strictHTFBias: false });

  const result = riskEngine.evaluateTrade(validRiskInput({
    market: { currentPrice: 1.1, spreadPips: 1, htfBias: "BEARISH" }
  }));

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

  const result = await executionEngine.placeOrder(validOrder({
    setupDirection: DIRECTIONS.SHORT,
    orderSide: ORDER_SIDES.SELL,
    stopLoss: 1.099,
    tp1: 1.098,
    tp2: 1.097
  }), "strategy setup");

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

  const result = await executionEngine.placeOrder(validOrder({
    setupDirection: DIRECTIONS.SHORT,
    orderSide: ORDER_SIDES.SELL,
    stopLoss: 1.102,
    tp1: 1.101,
    tp2: 1.102
  }), "strategy setup");

  assert.equal(result.executed, false);
  assert.equal(broker.calls.placeOrder, 0);
  assert.match(result.validation.reason, /TP1 and TP2 below entry/);
});

test("huge SL is rejected", () => {
  const { slTpEngine } = createHarness();

  const result = slTpEngine.build({
    direction: DIRECTIONS.LONG,
    entry: 1.1,
    structuralStop: 1.096,
    model: "SCALP"
  });

  assert.equal(result.valid, false);
  assert.match(result.reason, /exceeds maxStopLossPips/);
});

test("huge TP is capped or rejected", () => {
  const { slTpEngine } = createHarness();

  const result = slTpEngine.validateSaneLevels({
    direction: DIRECTIONS.LONG,
    entry: 1.1,
    stopLoss: 1.098,
    tp1: 1.102,
    tp2: 1.12,
    model: "SCALP"
  });

  assert.equal(result.valid, false);
  assert.match(result.reason, /unrealistically far/);
});

test("lot size calculates correctly for 10k", () => {
  const { riskEngine } = createHarness({ accountSize: 10000, riskPercent: 0.25 });

  assert.deepEqual(riskEngine.calculateLotSize(25), { dollarRisk: 25, lotSize: 1 });
});

test("lot size calculates correctly for 25k", () => {
  const { riskEngine } = createHarness({ accountSize: 25000, riskPercent: 0.25 });

  assert.deepEqual(riskEngine.calculateLotSize(25), { dollarRisk: 62.5, lotSize: 2.5 });
});

test("lot size calculates correctly for 50k", () => {
  const { riskEngine } = createHarness({ accountSize: 50000, riskPercent: 0.25 });

  assert.deepEqual(riskEngine.calculateLotSize(25), { dollarRisk: 125, lotSize: 5 });
});

test("profit exhaustion does not close losing trades", async () => {
  const { positionManager, broker } = createHarness({ mode: "LIVE", enableProfitExhaustionExit: true });

  const result = await positionManager.handleProfitExhaustion({
    id: "pos-1",
    direction: DIRECTIONS.LONG,
    entry: 1.1,
    stopLoss: 1.098,
    tp1Hit: true
  }, {
    currentPrice: 1.099,
    approachesMajorOpposingLiquidity: true,
    momentumWeakens: true,
    wickRejectsContinuation: true,
    chochAgainstPosition: true,
    failedNewExtreme: true
  });

  assert.equal(result.closed, false);
  assert.equal(broker.calls.closePosition, 0);
});

test("profit exhaustion can close profitable trade after TP1", async () => {
  const { positionManager, broker } = createHarness({ mode: "LIVE", enableProfitExhaustionExit: true });

  const result = await positionManager.handleProfitExhaustion({
    id: "pos-1",
    direction: DIRECTIONS.LONG,
    entry: 1.1,
    stopLoss: 1.098,
    tp1Hit: true
  }, {
    currentPrice: 1.1022,
    approachesMajorOpposingLiquidity: true,
    momentumWeakens: true,
    wickRejectsContinuation: true,
    chochAgainstPosition: true
  });

  assert.equal(result.closed, true);
  assert.equal(broker.calls.closePosition, 1);
  assert.equal(result.evaluation.shouldClose, true);
});

test("1m execution passes with zone touch + rejection", () => {
  const { strategyEngine } = createHarness();

  const result = strategyEngine.validateOneMinuteExecution({
    direction: DIRECTIONS.LONG,
    entryZone: { low: 1.1, high: 1.1005 },
    currentPrice: 1.1003,
    entry: 1.10025,
    tp1: 1.10225,
    candles1m: [
      { open: 1.1002, high: 1.1006, low: 1.0998, close: 1.1005 }
    ]
  });

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

  const result = strategyEngine.validateOneMinuteExecution({
    direction: DIRECTIONS.LONG,
    entryZone: { low: 1.1004, high: 1.1006 },
    currentPrice: 1.1005,
    entry: 1.1,
    tp1: 1.101,
    candles1m: [
      { open: 1.1002, high: 1.1007, low: 1.0999, close: 1.1006 }
    ]
  });

  assert.equal(result.passes, false);
  assert.match(result.reason, /40%/);
});
