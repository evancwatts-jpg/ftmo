import type { BotConfig } from "../config/botConfig";
import type { AuditLogger } from "../core/logger";
import type { Candle, MarketShiftState, StrategySetup } from "./strategyTypes";
import { OneMinuteExecution } from "./oneMinuteExecution";
import { SetupStateMachine } from "./setupStateMachine";
import { ScalpStrategy } from "./scalpStrategy";
import { SniperStrategy } from "./sniperStrategy";

export class StrategyEngine {
  config: BotConfig;
  logger: AuditLogger;
  setupStateMachine: SetupStateMachine;
  scalpStrategy: ScalpStrategy;
  sniperStrategy: SniperStrategy;
  oneMinuteExecution: OneMinuteExecution;

  constructor({ config, logger, setupStateMachine }: {
    config: BotConfig;
    logger: AuditLogger;
    setupStateMachine: SetupStateMachine;
  }) {
    this.config = config;
    this.logger = logger;
    this.setupStateMachine = setupStateMachine;
    this.oneMinuteExecution = new OneMinuteExecution();
    this.scalpStrategy = new ScalpStrategy({ config, logger, setupStateMachine });
    this.sniperStrategy = new SniperStrategy({ config, logger, setupStateMachine });
  }

  detectSetup({ candles5m = [], candles1m = [], currentPrice, marketShift }: {
    candles5m?: Candle[];
    candles1m?: Candle[];
    currentPrice: number;
    marketShift?: MarketShiftState;
  }): StrategySetup | null {
    const candidates: Array<StrategySetup | null> = [];

    if (this.config.strategyMode === "SCALP" || this.config.strategyMode === "BOTH") {
      candidates.push(this.scalpStrategy.detect({ candles5m, candles1m, currentPrice, marketShift }));
    }

    if (this.config.strategyMode === "SNIPER" || this.config.strategyMode === "BOTH") {
      candidates.push(this.sniperStrategy.detect({ candles5m, candles1m, currentPrice, marketShift }));
    }

    return candidates.find((candidate) => candidate?.valid) || null;
  }

  validateOneMinuteExecution(input: Parameters<OneMinuteExecution["validate"]>[0]) {
    return this.oneMinuteExecution.validate(input);
  }
}
