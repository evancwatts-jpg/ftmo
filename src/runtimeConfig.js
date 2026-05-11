"use strict";

const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { createBotConfig } = require("./config");
const { PaperBroker } = require("./paperBroker");

function parseBoolean(value, fallback) {
  if (value === undefined) {
    return fallback;
  }

  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

function parseNumber(value, fallback) {
  if (value === undefined || value === "") {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Expected number but received: ${value}`);
  }

  return parsed;
}

function loadConfigFromEnv(env = process.env) {
  return createBotConfig({
    mode: env.FTMO_BOT_MODE || undefined,
    accountSize: parseNumber(env.FTMO_ACCOUNT_SIZE, undefined),
    riskPercent: parseNumber(env.FTMO_RISK_PERCENT, undefined),
    strategyMode: env.FTMO_STRATEGY_MODE || undefined,
    trade24Five: parseBoolean(env.FTMO_TRADE_24_FIVE, undefined),
    sessionAdjustedRules: parseBoolean(env.FTMO_SESSION_ADJUSTED_RULES, undefined),
    strictHTFBias: parseBoolean(env.FTMO_STRICT_HTF_BIAS, undefined),
    enableDailyPnLBlocks: parseBoolean(env.FTMO_ENABLE_DAILY_PNL_BLOCKS, undefined),
    enableCooldown: parseBoolean(env.FTMO_ENABLE_COOLDOWN, undefined),
    enableStructureExit: parseBoolean(env.FTMO_ENABLE_STRUCTURE_EXIT, undefined),
    enableOneMinuteExecution: parseBoolean(env.FTMO_ENABLE_1M_EXECUTION, undefined),
    enableProfitExhaustionExit: parseBoolean(env.FTMO_ENABLE_PROFIT_EXHAUSTION_EXIT, undefined),
    maxOpenPositions: parseNumber(env.FTMO_MAX_OPEN_POSITIONS, undefined),
    spreadMaxPips: parseNumber(env.FTMO_SPREAD_MAX_PIPS, undefined),
    newsBlackoutMinutes: parseNumber(env.FTMO_NEWS_BLACKOUT_MINUTES, undefined),
    maxStopLossPips: parseNumber(env.FTMO_MAX_STOP_LOSS_PIPS, undefined),
    minStopLossPips: parseNumber(env.FTMO_MIN_STOP_LOSS_PIPS, undefined),
    scalpMinRR: parseNumber(env.FTMO_SCALP_MIN_RR, undefined),
    sniperMinRR: parseNumber(env.FTMO_SNIPER_MIN_RR, undefined),
    activeAccountId: env.FTMO_ACTIVE_ACCOUNT_ID || undefined
  });
}

async function createBrokerFromEnv(env = process.env) {
  if (env.FTMO_BROKER_FACTORY) {
    const factoryPath = path.resolve(env.FTMO_BROKER_FACTORY);
    const brokerModule = await import(pathToFileURL(factoryPath).href);
    const factory = brokerModule.createBroker || brokerModule.default || brokerModule;

    if (typeof factory !== "function") {
      throw new Error("FTMO_BROKER_FACTORY must export a createBroker function or default function");
    }

    return factory({ env });
  }

  return new PaperBroker();
}

module.exports = {
  createBrokerFromEnv,
  loadConfigFromEnv,
  parseBoolean,
  parseNumber
};
