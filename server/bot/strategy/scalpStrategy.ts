import type { BotConfig } from "../config/botConfig";
import type { AuditLogger } from "../core/logger";
import { average, candleBody, candleRange } from "../market/candleUtils";
import { DIRECTIONS, type Candle, type EntryZone, type StrategySetup, type TradeDirection } from "./strategyTypes";
import { OneMinuteExecution } from "./oneMinuteExecution";
import { SetupStateMachine } from "./setupStateMachine";
import type { MarketShiftState } from "./strategyTypes";

export class ScalpStrategy {
  config: BotConfig;
  logger: AuditLogger;
  oneMinuteExecution: OneMinuteExecution;
  stateMachine: SetupStateMachine;

  constructor({ config, logger, setupStateMachine }: {
    config: BotConfig;
    logger: AuditLogger;
    setupStateMachine: SetupStateMachine;
  }) {
    this.config = config;
    this.logger = logger;
    this.oneMinuteExecution = new OneMinuteExecution();
    this.stateMachine = setupStateMachine;
  }

  detect({ candles5m, candles1m, currentPrice, marketShift }: {
    candles5m: Candle[];
    candles1m: Candle[];
    currentPrice: number;
    marketShift?: MarketShiftState;
  }): StrategySetup | null {
    return this.detectSweepDisplacementModel({
      model: "SCALP",
      candles5m,
      candles1m,
      currentPrice,
      marketShift,
      lookback: 12,
      displacementMultiplier: 0.8
    });
  }

  detectSweepDisplacementModel(input: {
    model: "SCALP";
    candles5m: Candle[];
    candles1m: Candle[];
    currentPrice: number;
    marketShift?: MarketShiftState;
    lookback: number;
    displacementMultiplier: number;
  }): StrategySetup | null {
    const { candles5m, candles1m, currentPrice, lookback, displacementMultiplier, marketShift } = input;
    if (candles5m.length < lookback + 2) {
      this.noTrade({ reason: "not enough 5m candles", currentPrice, marketShift });
      return null;
    }

    const prior = candles5m.slice(-(lookback + 1), -1);
    const last = candles5m[candles5m.length - 1];
    const meaningfulLow = Math.min(...prior.map((candle) => candle.low));
    const meaningfulHigh = Math.max(...prior.map((candle) => candle.high));
    const averageRange = average(prior.map(candleRange));
    const bullishDisplacement = last.close > last.open && candleBody(last) >= averageRange * displacementMultiplier;
    const bearishDisplacement = last.close < last.open && candleBody(last) >= averageRange * displacementMultiplier;
    const sweptLow = last.low < meaningfulLow && last.close > meaningfulLow;
    const sweptHigh = last.high > meaningfulHigh && last.close < meaningfulHigh;

    let direction: TradeDirection | null = null;
    let sweptLevel = 0;
    let structuralStop = 0;

    if (sweptLow && bullishDisplacement) {
      direction = DIRECTIONS.LONG;
      sweptLevel = meaningfulLow;
      structuralStop = last.low;
    } else if (sweptHigh && bearishDisplacement) {
      direction = DIRECTIONS.SHORT;
      sweptLevel = meaningfulHigh;
      structuralStop = last.high;
    }

    const entryZone = direction ? createEntryZoneFromDisplacement(last) : null;
    const entry = entryZone ? (entryZone.low + entryZone.high) / 2 : currentPrice;
    const tp1 = direction === DIRECTIONS.SHORT ? entry - candleRange(last) : entry + candleRange(last);
    const execution = direction && entryZone
      ? this.oneMinuteExecution.validate({ direction, entryZone, candles1m, currentPrice, entry, tp1 })
      : undefined;

    const state = this.stateMachine.advance({
      hasSweep: sweptLow || sweptHigh,
      hasDisplacement: bullishDisplacement || bearishDisplacement,
      hasRetracement: Boolean(direction && entryZone && this.oneMinuteExecution.priceInOrNearZone({ price: currentPrice, entryZone, tolerancePips: 2 })),
      hasExecutionConfirmation: !this.config.enableOneMinuteExecution || Boolean(execution?.passes)
    });

    if (!state.accepted || !direction || !entryZone) {
      this.noTrade({
        reason: state.reason,
        currentPrice,
        direction,
        entryZone,
        marketShift
      });
      return null;
    }

    return {
      valid: true,
      model: "SCALP",
      direction,
      sweptLevel,
      structuralStop,
      entryZone,
      execution,
      state: state.state,
      marketShift,
      reason: `${direction === DIRECTIONS.LONG ? "Bullish" : "Bearish"} scalp setup: liquidity swept, displacement confirmed, retracement entered the zone, and 1m timing confirmed.`
    };
  }

  private noTrade(details: {
    reason: string;
    currentPrice?: number;
    direction?: TradeDirection | null;
    entryZone?: EntryZone | null;
    marketShift?: MarketShiftState;
  }): void {
    this.logger.noTrade({
      state: "strategy_scan",
      currentPrice: details.currentPrice,
      spread: undefined,
      mode: this.config.mode,
      direction: details.direction,
      reason: details.reason,
      entryZone: details.entryZone,
      marketShift: details.marketShift,
      model: "SCALP"
    });
  }
}

export function createEntryZoneFromDisplacement(candle: Candle): EntryZone {
  const midpoint = (candle.open + candle.close) / 2;
  return {
    low: Number(Math.min(candle.open, midpoint).toFixed(5)),
    high: Number(Math.max(candle.open, midpoint).toFixed(5)),
    source: "DISPLACEMENT_50"
  };
}
