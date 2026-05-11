"use strict";

const MODES = Object.freeze({
  OFF: "OFF",
  OBSERVATION: "OBSERVATION",
  LIVE: "LIVE"
});

const STRATEGY_MODES = Object.freeze({
  SCALP: "SCALP",
  SNIPER: "SNIPER",
  BOTH: "BOTH"
});

const ACCOUNT_PRESETS = Object.freeze([10000, 25000, 50000, 100000]);

const botConfig = {
  mode: MODES.OFF,
  accountSize: 10000,
  riskPercent: 0.25,
  strategyMode: STRATEGY_MODES.BOTH,
  trade24Five: true,
  sessionAdjustedRules: false,
  strictHTFBias: false,
  enableDailyPnLBlocks: false,
  enableCooldown: false,
  enableStructureExit: false,
  enableOneMinuteExecution: true,
  enableProfitExhaustionExit: true,
  maxOpenPositions: 1,
  spreadMaxPips: 2.0,
  newsBlackoutMinutes: 15,
  maxStopLossPips: 25,
  minStopLossPips: 5,
  scalpMinRR: 1.5,
  sniperMinRR: 2.0
};

function createBotConfig(overrides = {}) {
  const definedOverrides = Object.fromEntries(
    Object.entries(overrides).filter(([_key, value]) => value !== undefined)
  );
  const next = { ...botConfig, ...definedOverrides };

  if (!Object.values(MODES).includes(next.mode)) {
    throw new Error(`Invalid bot mode: ${next.mode}`);
  }

  if (!ACCOUNT_PRESETS.includes(next.accountSize)) {
    throw new Error(`Unsupported account size: ${next.accountSize}`);
  }

  if (!Object.values(STRATEGY_MODES).includes(next.strategyMode)) {
    throw new Error(`Invalid strategy mode: ${next.strategyMode}`);
  }

  if (next.riskPercent <= 0 || next.riskPercent > 0.75) {
    throw new Error("riskPercent must be greater than 0 and no more than 0.75");
  }

  if (next.minStopLossPips <= 0 || next.maxStopLossPips < next.minStopLossPips) {
    throw new Error("Stop-loss bounds are invalid");
  }

  return next;
}

module.exports = {
  ACCOUNT_PRESETS,
  MODES,
  STRATEGY_MODES,
  botConfig,
  createBotConfig
};
