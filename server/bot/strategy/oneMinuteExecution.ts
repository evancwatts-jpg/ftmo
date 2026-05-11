import type { Candle, EntryZone, OneMinuteExecutionResult, TradeDirection } from "./strategyTypes";
import { DIRECTIONS } from "./strategyTypes";
import { DEFAULT_PIP_SIZE, candleRange, isBearish, isBullish } from "../market/candleUtils";

export class OneMinuteExecution {
  pipSize: number;

  constructor({ pipSize = DEFAULT_PIP_SIZE } = {}) {
    this.pipSize = pipSize;
  }

  validate(input: {
    direction: TradeDirection;
    entryZone: EntryZone;
    candles1m?: Candle[];
    currentPrice: number;
    entry: number;
    tp1: number;
  }): OneMinuteExecutionResult {
    const candles1m = input.candles1m || [];
    if (!this.priceInOrNearZone({ price: input.currentPrice, entryZone: input.entryZone, tolerancePips: 2 })) {
      return fail("price is not inside or within 1-2 pips of 5m entry zone");
    }

    if (this.isChasing(input)) {
      return fail("price has moved more than 40% from entry toward TP1");
    }

    const rejection = this.hasRejectionCandle({ direction: input.direction, candles: candles1m });
    const microBos = this.hasMicroBos({ direction: input.direction, candles: candles1m });
    const closeBack = this.hasCloseBackInDirectionAfterTouch({
      direction: input.direction,
      candles: candles1m,
      entryZone: input.entryZone
    });

    if (rejection || microBos || closeBack) {
      return {
        passes: true,
        reason: "1m execution confirmation passed",
        confirmations: { rejection, microBos, closeBack }
      };
    }

    return fail("1m did not reject, micro BOS, or close back in direction");
  }

  priceInOrNearZone({ price, entryZone, tolerancePips = 2 }: {
    price: number;
    entryZone: EntryZone;
    tolerancePips?: number;
  }): boolean {
    const tolerance = tolerancePips * this.pipSize;
    return price >= entryZone.low - tolerance && price <= entryZone.high + tolerance;
  }

  isChasing({ direction, currentPrice, entry, tp1 }: {
    direction: TradeDirection;
    currentPrice: number;
    entry: number;
    tp1: number;
  }): boolean {
    if (entry === tp1) {
      return false;
    }

    const progress = direction === DIRECTIONS.LONG
      ? (currentPrice - entry) / (tp1 - entry)
      : (entry - currentPrice) / (entry - tp1);

    return progress > 0.4;
  }

  hasRejectionCandle({ direction, candles }: { direction: TradeDirection; candles: Candle[] }): boolean {
    const candle = candles[candles.length - 1];
    if (!candle) {
      return false;
    }

    const range = candleRange(candle);
    if (!range) {
      return false;
    }

    if (direction === DIRECTIONS.LONG) {
      const lowerWick = Math.min(candle.open, candle.close) - candle.low;
      return isBullish(candle) && lowerWick / range >= 0.35;
    }

    const upperWick = candle.high - Math.max(candle.open, candle.close);
    return isBearish(candle) && upperWick / range >= 0.35;
  }

  hasMicroBos({ direction, candles }: { direction: TradeDirection; candles: Candle[] }): boolean {
    if (candles.length < 4) {
      return false;
    }

    const last = candles[candles.length - 1];
    const prior = candles.slice(-4, -1);

    return direction === DIRECTIONS.LONG
      ? last.close > Math.max(...prior.map((candle) => candle.high))
      : last.close < Math.min(...prior.map((candle) => candle.low));
  }

  hasCloseBackInDirectionAfterTouch({ direction, candles, entryZone }: {
    direction: TradeDirection;
    candles: Candle[];
    entryZone: EntryZone;
  }): boolean {
    const last = candles[candles.length - 1];
    if (!last) {
      return false;
    }

    const touched = last.low <= entryZone.high && last.high >= entryZone.low;
    if (!touched) {
      return false;
    }

    return direction === DIRECTIONS.LONG ? last.close > entryZone.high : last.close < entryZone.low;
  }
}

function fail(reason: string): OneMinuteExecutionResult {
  return {
    passes: false,
    reason,
    confirmations: { rejection: false, microBos: false, closeBack: false }
  };
}
