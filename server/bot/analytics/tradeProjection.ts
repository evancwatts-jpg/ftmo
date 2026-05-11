import type { RiskPlan } from "../risk/riskEngine";
import type { SlTpPlan } from "../risk/slTpEngine";
import { DIRECTIONS, type StrategySetup, type TradeDirection } from "../strategy/strategyTypes";

export interface TradeProjection {
  direction: TradeDirection;
  setupType: "SCALP" | "SNIPER";
  entry: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  stopLossPips: number;
  riskDollars: number;
  lotSize: number;
  rrToTp1: number;
  rrToTp2: number;
  projectedProfitTp1: number;
  projectedProfitTp2: number;
  invalidationReason: string;
  tradeReason: string;
  expectedPath: string;
  managementPlan: string;
}

export function buildTradeProjection({ setup, levels, riskPlan }: {
  setup: StrategySetup;
  levels: SlTpPlan;
  riskPlan: RiskPlan;
}): TradeProjection {
  const projectedProfitTp1 = Number((riskPlan.expectedDollarLoss * levels.rrToTp1).toFixed(2));
  const projectedProfitTp2 = Number((riskPlan.expectedDollarLoss * levels.rrToTp2).toFixed(2));
  const directionWord = setup.direction === DIRECTIONS.LONG ? "move toward upside liquidity" : "move toward downside liquidity";

  return {
    direction: setup.direction,
    setupType: setup.model,
    entry: levels.entry,
    stopLoss: levels.stopLoss,
    tp1: levels.tp1,
    tp2: levels.tp2,
    stopLossPips: Number(levels.stopLossPips.toFixed(2)),
    riskDollars: riskPlan.expectedDollarLoss,
    lotSize: riskPlan.lotSize,
    rrToTp1: Number(levels.rrToTp1.toFixed(2)),
    rrToTp2: Number(levels.rrToTp2.toFixed(2)),
    projectedProfitTp1,
    projectedProfitTp2,
    invalidationReason: "Setup invalidates if opposite displacement forms, price reaches target area before entry, RR degrades, or the entry zone is no longer respected.",
    tradeReason: setup.reason,
    expectedPath: `Expected path: ${directionWord} after the sweep, displacement, and retracement complete.`,
    managementPlan: "If TP1 hits, close partial, move stop to breakeven, trail after TP1 when enabled, and allow profit exhaustion to close only winning remainder."
  };
}
