import { average, candleBody, candleRange } from "../market/candleUtils";
import type { Candle, MarketShiftState } from "./strategyTypes";

export class MarketShiftDetector {
  detect({ candles15m = [], candles5m = [] }: { candles15m?: Candle[]; candles5m?: Candle[] }): MarketShiftState {
    const candles = candles5m.length >= 12 ? candles5m : candles15m;
    if (candles.length < 6) {
      return {
        regime: "RANGE",
        bias: "NEUTRAL",
        volatility: "NORMAL",
        confidence: 25,
        reasons: ["not enough candles for strong market shift read"]
      };
    }

    const recent = candles.slice(-6);
    const prior = candles.slice(-12, -6);
    const highsRising = recent[recent.length - 1].high > recent[0].high;
    const lowsRising = recent[recent.length - 1].low > recent[0].low;
    const highsFalling = recent[recent.length - 1].high < recent[0].high;
    const lowsFalling = recent[recent.length - 1].low < recent[0].low;
    const recentRange = average(recent.map(candleRange));
    const priorRange = average(prior.length ? prior.map(candleRange) : recent.map(candleRange));
    const bodyShare = average(recent.map((candle) => candleBody(candle) / Math.max(candleRange(candle), 0.00001)));
    const rangeExpansion = priorRange > 0 ? recentRange / priorRange : 1;
    const reasons: string[] = [];

    let bias: MarketShiftState["bias"] = "NEUTRAL";
    let regime: MarketShiftState["regime"] = "RANGE";

    if (highsRising && lowsRising) {
      bias = "BULLISH";
      regime = rangeExpansion > 1.35 ? "EXPANSION" : "BULL_TREND";
      reasons.push("recent highs and lows are rising");
    } else if (highsFalling && lowsFalling) {
      bias = "BEARISH";
      regime = rangeExpansion > 1.35 ? "EXPANSION" : "BEAR_TREND";
      reasons.push("recent highs and lows are falling");
    } else if (bodyShare < 0.28) {
      regime = "CHOP";
      reasons.push("small candle bodies show chop");
    } else {
      regime = "RANGE";
      reasons.push("mixed highs/lows show range");
    }

    if (rangeExpansion > 1.8 && bodyShare < 0.35) {
      regime = "REVERSAL_RISK";
      reasons.push("expanded range with weak bodies suggests reversal risk");
    }

    const volatility = rangeExpansion >= 2
      ? "EXTREME"
      : rangeExpansion >= 1.35
        ? "HIGH"
        : rangeExpansion <= 0.65
          ? "LOW"
          : "NORMAL";

    return {
      regime,
      bias,
      volatility,
      confidence: Math.min(95, Math.round(45 + Math.abs(rangeExpansion - 1) * 25 + bodyShare * 30)),
      reasons
    };
  }
}
