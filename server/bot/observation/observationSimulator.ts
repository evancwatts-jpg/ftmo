import type { BotConfig } from "../config/botConfig";
import type { AuditLogger } from "../core/logger";
import type { TradeProjection } from "../analytics/tradeProjection";
import type { MarketState, StrategySetup } from "../strategy/strategyTypes";
import type { RiskPlan } from "../risk/riskEngine";
import type { SlTpPlan } from "../risk/slTpEngine";

export class ObservationSimulator {
  config: BotConfig;
  logger: AuditLogger;
  hypotheticalTrades: unknown[] = [];

  constructor({ config, logger }: { config: BotConfig; logger: AuditLogger }) {
    this.config = config;
    this.logger = logger;
  }

  recordHypotheticalTrade({ setup, levels, sizing, market, projection }: {
    setup: StrategySetup;
    levels: SlTpPlan;
    sizing: RiskPlan;
    market: MarketState;
    projection: TradeProjection;
  }): { recorded: boolean; trade?: unknown; reason?: string } {
    if (this.config.mode !== "OBSERVATION") {
      return { recorded: false, reason: "not in observation mode" };
    }

    const trade = {
      timestamp: new Date().toISOString(),
      setup,
      levels,
      sizing,
      market,
      projection,
      hypotheticalPnl: {
        lossAtStop: -sizing.expectedDollarLoss,
        profitAtTp1: projection.projectedProfitTp1,
        profitAtTp2: projection.projectedProfitTp2
      }
    };

    this.hypotheticalTrades.push(trade);
    this.logger.log("OBSERVATION", "hypothetical_trade", {
      direction: setup.direction,
      setupType: setup.model,
      entry: levels.entry,
      sl: levels.stopLoss,
      tp1: levels.tp1,
      tp2: levels.tp2,
      rr: levels.rrToTp2,
      lotSize: sizing.lotSize,
      tradeReason: projection.tradeReason,
      projection
    });

    return { recorded: true, trade };
  }
}
