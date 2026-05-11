export type BotMode = "OFF" | "OBSERVATION" | "LIVE";
export type StrategyMode = "SCALP" | "SNIPER" | "BOTH";

export interface BotConfig {
  mode: BotMode;
  symbol: "EURUSD";
  accountSize: 10000 | 25000 | 50000 | 100000;
  riskPercent: number;
  manualLotOverrideEnabled: boolean;
  manualLotSize: number | null;
  strategyMode: StrategyMode;
  trade24Five: boolean;
  sessionAdjustedRules: boolean;
  strictHTFBias: boolean;
  enableDailyPnLBlocks: boolean;
  enableCooldown: boolean;
  enableStructureExit: boolean;
  enableOneMinuteExecution: boolean;
  enableProfitExhaustionExit: boolean;
  maxOpenPositions: number;
  spreadMaxPips: number;
  newsBlackoutMinutes: number;
  minStopLossPips: number;
  maxStopLossPips: number;
  scalpMinRR: number;
  sniperMinRR: number;
  partialCloseAtTP1: boolean;
  moveStopToBreakevenAtTP1: boolean;
  trailAfterTP1: boolean;
  monteCarloEnabled: boolean;
  activeAccountId?: string;
}

export const MODES = Object.freeze({
  OFF: "OFF" as BotMode,
  OBSERVATION: "OBSERVATION" as BotMode,
  LIVE: "LIVE" as BotMode
});

export const STRATEGY_MODES = Object.freeze({
  SCALP: "SCALP" as StrategyMode,
  SNIPER: "SNIPER" as StrategyMode,
  BOTH: "BOTH" as StrategyMode
});

export const ACCOUNT_PRESETS = Object.freeze([10000, 25000, 50000, 100000] as const);

export const defaultBotConfig: BotConfig = {
  mode: "OBSERVATION",
  symbol: "EURUSD",
  accountSize: 10000,
  riskPercent: 1.0,
  manualLotOverrideEnabled: false,
  manualLotSize: null,
  strategyMode: "BOTH",
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
  minStopLossPips: 5,
  maxStopLossPips: 10,
  scalpMinRR: 1.5,
  sniperMinRR: 2.0,
  partialCloseAtTP1: true,
  moveStopToBreakevenAtTP1: true,
  trailAfterTP1: true,
  monteCarloEnabled: true
};

export const botConfig = defaultBotConfig;

export function createBotConfig(overrides: Partial<BotConfig> = {}): BotConfig {
  const definedOverrides = Object.fromEntries(
    Object.entries(overrides).filter(([, value]) => value !== undefined)
  ) as Partial<BotConfig>;
  const next = { ...defaultBotConfig, ...definedOverrides };

  if (!Object.values(MODES).includes(next.mode)) {
    throw new Error(`Invalid bot mode: ${next.mode}`);
  }

  if (next.symbol !== "EURUSD") {
    throw new Error(`Unsupported symbol: ${next.symbol}`);
  }

  if (!(ACCOUNT_PRESETS as readonly number[]).includes(next.accountSize)) {
    throw new Error(`Unsupported account size: ${next.accountSize}`);
  }

  if (!Object.values(STRATEGY_MODES).includes(next.strategyMode)) {
    throw new Error(`Invalid strategy mode: ${next.strategyMode}`);
  }

  if (next.riskPercent <= 0) {
    throw new Error("riskPercent must be greater than 0");
  }

  if (next.riskPercent > 1) {
    throw new Error("riskPercent must not exceed the 1% hard cap");
  }

  if (next.manualLotOverrideEnabled && (next.manualLotSize === null || next.manualLotSize <= 0)) {
    throw new Error("manualLotSize must be greater than 0 when manual override is enabled");
  }

  if (next.minStopLossPips <= 0 || next.maxStopLossPips < next.minStopLossPips) {
    throw new Error("Stop-loss bounds are invalid");
  }

  return next;
}
