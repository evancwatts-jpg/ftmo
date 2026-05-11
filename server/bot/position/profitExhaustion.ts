import { DIRECTIONS, type MarketState, type TradeDirection } from "../strategy/strategyTypes";

export interface ManagedPosition {
  id: string;
  direction: TradeDirection;
  entry: number;
  stopLoss: number;
  tp1Hit?: boolean;
  raw?: unknown;
}

export interface ExhaustionSignal {
  score: number;
  reasons: string[];
  shouldClosePartial: boolean;
  shouldCloseFull: boolean;
  shouldClose?: boolean;
  rMultiple: number;
  signals?: string[];
  reason?: string;
}

export class ProfitExhaustionDetector {
  calculateRMultiple(position: ManagedPosition, currentPrice: number): number {
    const risk = Math.abs(position.entry - position.stopLoss);
    if (!risk) {
      return 0;
    }

    const favorableMove = position.direction === DIRECTIONS.LONG
      ? currentPrice - position.entry
      : position.entry - currentPrice;

    return favorableMove / risk;
  }

  evaluate({ position, market }: { position: ManagedPosition; market: MarketState }): ExhaustionSignal {
    const currentPrice = market.currentPrice;
    const rMultiple = this.calculateRMultiple(position, currentPrice);

    if (rMultiple <= 0) {
      return {
        score: 0,
        reasons: ["profit exhaustion is inactive on losing trades"],
        shouldClosePartial: false,
        shouldCloseFull: false,
        shouldClose: false,
        rMultiple,
        signals: [],
        reason: "profit exhaustion is inactive on losing trades"
      };
    }

    const weights: Array<[keyof MarketState, number, string]> = [
      ["approachesMajorOpposingLiquidity", 25, "price approaches major opposing liquidity"],
      ["momentumWeakens", 15, "momentum weakens"],
      ["wickRejectsContinuation", 15, "wicks reject continuation"],
      ["chochAgainstPosition", 20, "CHoCH appears against position"],
      ["momentumDivergence", 15, "momentum divergence appears"],
      ["volumeOrMomentumDecreases", 10, "volume or momentum decreases"],
      ["failedNewExtreme", 15, "price fails to make a new extreme"],
      ["sharpRetraceAfterOneR", rMultiple >= 1 ? 20 : 0, "sharp pullback after +1R"]
    ];
    const reasons: string[] = [];
    let score = 0;

    for (const [signal, weight, reason] of weights) {
      if (market[signal] && weight > 0) {
        reasons.push(reason);
        score += weight;
      }
    }

    score = Math.min(score, 100);
    const tp1Hit = Boolean(position.tp1Hit || rMultiple >= 1);
    let shouldClosePartial = false;
    let shouldCloseFull = false;
    let reason = "exhaustion score below close threshold";

    if (!tp1Hit && rMultiple >= 0.8 && score >= 85) {
      shouldClosePartial = true;
      reason = "pre-TP1 exhaustion score >= 85 at +0.8R or better";
    } else if (tp1Hit && score >= 65) {
      shouldCloseFull = true;
      reason = "post-TP1 exhaustion score >= 65";
    } else if (tp1Hit && market.reachesMajorOpposingLiquidity) {
      shouldCloseFull = true;
      reason = "price reached major opposing liquidity after TP1";
    } else if (rMultiple >= 1 && market.sharpRetraceAfterOneR && score >= 45) {
      shouldCloseFull = true;
      reason = "profit sharply retraced after +1R";
    }

    return {
      score,
      reasons,
      shouldClosePartial,
      shouldCloseFull,
      shouldClose: shouldClosePartial || shouldCloseFull,
      rMultiple,
      signals: reasons,
      reason
    };
  }
}
