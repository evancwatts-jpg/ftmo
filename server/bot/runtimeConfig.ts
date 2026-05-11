import path from "node:path";
import { pathToFileURL } from "node:url";
import { createBotConfig } from "./config/botConfig";
import { PaperBroker } from "./execution/paperBroker";

export function parseBoolean(value: string | undefined, fallback?: boolean): boolean | undefined {
  if (value === undefined) {
    return fallback;
  }

  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

export function parseNumber(value: string | undefined, fallback?: number): number | undefined {
  if (value === undefined || value === "") {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Expected number but received: ${value}`);
  }

  return parsed;
}

export function loadConfigFromEnv(env: NodeJS.ProcessEnv = process.env) {
  return createBotConfig({
    mode: env.FTMO_BOT_MODE as any || undefined,
    symbol: env.FTMO_SYMBOL as any || undefined,
    accountSize: parseNumber(env.FTMO_ACCOUNT_SIZE, undefined) as any,
    riskPercent: parseNumber(env.FTMO_RISK_PERCENT, undefined),
    manualLotOverrideEnabled: parseBoolean(env.FTMO_MANUAL_LOT_OVERRIDE_ENABLED, undefined),
    manualLotSize: parseNumber(env.FTMO_MANUAL_LOT_SIZE, undefined) as any,
    strategyMode: env.FTMO_STRATEGY_MODE as any || undefined,
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

export async function createBrokerFromEnv(env: NodeJS.ProcessEnv = process.env): Promise<any> {
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
