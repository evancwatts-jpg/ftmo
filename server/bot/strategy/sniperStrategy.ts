import type { BotConfig } from "../config/botConfig";
import type { AuditLogger } from "../core/logger";
import { ScalpStrategy } from "./scalpStrategy";
import { SetupStateMachine } from "./setupStateMachine";
import type { Candle, MarketShiftState, StrategySetup } from "./strategyTypes";

export class SniperStrategy {
  private delegate: ScalpStrategy;

  constructor({ config, logger, setupStateMachine }: {
    config: BotConfig;
    logger: AuditLogger;
    setupStateMachine: SetupStateMachine;
  }) {
    this.delegate = new ScalpStrategy({ config, logger, setupStateMachine });
  }

  detect({ candles5m, candles1m, currentPrice, marketShift }: {
    candles5m: Candle[];
    candles1m: Candle[];
    currentPrice: number;
    marketShift?: MarketShiftState;
  }): StrategySetup | null {
    const setup = this.delegate.detectSweepDisplacementModel({
      model: "SCALP",
      candles5m,
      candles1m,
      currentPrice,
      marketShift,
      lookback: 24,
      displacementMultiplier: 1.1
    });

    if (!setup) {
      return null;
    }

    return {
      ...setup,
      model: "SNIPER",
      reason: setup.reason.replace("scalp", "sniper")
    };
  }
}
