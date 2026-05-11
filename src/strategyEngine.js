"use strict";

const { DIRECTIONS } = require("./directionValidator");
const { DEFAULT_PIP_SIZE } = require("./marketDataEngine");
const { pipsBetween } = require("./slTpEngine");

function candleRange(candle) {
  return Math.abs(candle.high - candle.low);
}

function candleBody(candle) {
  return Math.abs(candle.close - candle.open);
}

function isBullish(candle) {
  return candle.close > candle.open;
}

function isBearish(candle) {
  return candle.close < candle.open;
}

class StrategyEngine {
  constructor({ config, logger, setupStateMachine, pipSize = DEFAULT_PIP_SIZE }) {
    this.config = config;
    this.logger = logger;
    this.setupStateMachine = setupStateMachine;
    this.pipSize = pipSize;
  }

  detectSetup({ candles5m = [], candles1m = [], currentPrice }) {
    const candidates = [];

    if (this.config.strategyMode === "SCALP" || this.config.strategyMode === "BOTH") {
      candidates.push(this.detectScalp({ candles5m, candles1m, currentPrice }));
    }

    if (this.config.strategyMode === "SNIPER" || this.config.strategyMode === "BOTH") {
      candidates.push(this.detectSniper({ candles5m, candles1m, currentPrice }));
    }

    return candidates.find((candidate) => candidate && candidate.valid) || null;
  }

  detectScalp({ candles5m, candles1m, currentPrice }) {
    return this.detectSweepDisplacementModel({
      model: "SCALP",
      candles5m,
      candles1m,
      currentPrice,
      lookback: 12,
      displacementMultiplier: 0.8
    });
  }

  detectSniper({ candles5m, candles1m, currentPrice }) {
    return this.detectSweepDisplacementModel({
      model: "SNIPER",
      candles5m,
      candles1m,
      currentPrice,
      lookback: 24,
      displacementMultiplier: 1.1
    });
  }

  detectSweepDisplacementModel({ model, candles5m, candles1m, currentPrice, lookback, displacementMultiplier }) {
    if (candles5m.length < lookback + 2) {
      return this.noTrade({ model, reason: "not enough 5m candles", currentPrice });
    }

    const prior = candles5m.slice(-(lookback + 1), -1);
    const last = candles5m[candles5m.length - 1];
    const meaningfulLow = Math.min(...prior.map((candle) => candle.low));
    const meaningfulHigh = Math.max(...prior.map((candle) => candle.high));
    const averageRange = prior.reduce((sum, candle) => sum + candleRange(candle), 0) / prior.length;
    const hasBullishDisplacement = isBullish(last) && candleBody(last) >= averageRange * displacementMultiplier;
    const hasBearishDisplacement = isBearish(last) && candleBody(last) >= averageRange * displacementMultiplier;

    const sweptLow = last.low < meaningfulLow && last.close > meaningfulLow;
    const sweptHigh = last.high > meaningfulHigh && last.close < meaningfulHigh;

    let direction = null;
    let sweptLevel = null;
    let structuralStop = null;

    if (sweptLow && hasBullishDisplacement) {
      direction = DIRECTIONS.LONG;
      sweptLevel = meaningfulLow;
      structuralStop = last.low;
    } else if (sweptHigh && hasBearishDisplacement) {
      direction = DIRECTIONS.SHORT;
      sweptLevel = meaningfulHigh;
      structuralStop = last.high;
    }

    const entryZone = this.createEntryZoneFromDisplacement(last, direction);
    const execution = direction
      ? this.validateOneMinuteExecution({
        direction,
        entryZone,
        candles1m,
        currentPrice,
        entry: (entryZone.low + entryZone.high) / 2,
        tp1: direction === DIRECTIONS.LONG
          ? ((entryZone.low + entryZone.high) / 2) + candleRange(last)
          : ((entryZone.low + entryZone.high) / 2) - candleRange(last)
      })
      : { passes: false };

    const state = this.setupStateMachine.advance({
      hasSweep: sweptLow || sweptHigh,
      hasDisplacement: hasBullishDisplacement || hasBearishDisplacement,
      hasRetracement: direction ? this.priceInOrNearZone({ price: currentPrice, entryZone, tolerancePips: 2 }) : false,
      hasExecutionConfirmation: !this.config.enableOneMinuteExecution || execution.passes
    });

    if (!state.accepted) {
      return this.noTrade({
        model,
        direction,
        reason: state.reason,
        currentPrice,
        entryZone
      });
    }

    return {
      valid: true,
      model,
      direction,
      sweptLevel,
      structuralStop,
      entryZone,
      execution
    };
  }

  createEntryZoneFromDisplacement(candle, direction) {
    if (!direction) {
      return null;
    }

    const midpoint = (candle.open + candle.close) / 2;

    if (direction === DIRECTIONS.LONG) {
      return {
        low: Number(Math.min(candle.open, midpoint).toFixed(5)),
        high: Number(Math.max(candle.open, midpoint).toFixed(5))
      };
    }

    return {
      low: Number(Math.min(candle.open, midpoint).toFixed(5)),
      high: Number(Math.max(candle.open, midpoint).toFixed(5))
    };
  }

  validateOneMinuteExecution({ direction, entryZone, candles1m = [], currentPrice, entry, tp1 }) {
    if (!entryZone || !this.priceInOrNearZone({ price: currentPrice, entryZone, tolerancePips: 2 })) {
      return { passes: false, reason: "price is not inside or within 1-2 pips of 5m entry zone" };
    }

    if (this.isChasing({ direction, currentPrice, entry, tp1 })) {
      return { passes: false, reason: "price has moved more than 40% from entry toward TP1" };
    }

    const rejection = this.hasRejectionCandle({ direction, candles: candles1m });
    const microBos = this.hasMicroBos({ direction, candles: candles1m });
    const closeBack = this.hasCloseBackInDirectionAfterTouch({ direction, candles: candles1m, entryZone });

    if (rejection || microBos || closeBack) {
      return {
        passes: true,
        confirmations: {
          rejection,
          microBos,
          closeBack
        }
      };
    }

    return { passes: false, reason: "1m did not reject, micro BOS, or close back in direction" };
  }

  priceInOrNearZone({ price, entryZone, tolerancePips = 2 }) {
    if (!entryZone) {
      return false;
    }

    const tolerance = tolerancePips * this.pipSize;
    return price >= entryZone.low - tolerance && price <= entryZone.high + tolerance;
  }

  isChasing({ direction, currentPrice, entry, tp1 }) {
    if (entry === undefined || tp1 === undefined || entry === tp1) {
      return false;
    }

    const progress =
      direction === DIRECTIONS.LONG
        ? (currentPrice - entry) / (tp1 - entry)
        : (entry - currentPrice) / (entry - tp1);

    return progress > 0.4;
  }

  hasRejectionCandle({ direction, candles }) {
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

  hasMicroBos({ direction, candles }) {
    if (candles.length < 4) {
      return false;
    }

    const last = candles[candles.length - 1];
    const prior = candles.slice(-4, -1);

    if (direction === DIRECTIONS.LONG) {
      return last.close > Math.max(...prior.map((candle) => candle.high));
    }

    return last.close < Math.min(...prior.map((candle) => candle.low));
  }

  hasCloseBackInDirectionAfterTouch({ direction, candles, entryZone }) {
    if (candles.length < 2) {
      return false;
    }

    const last = candles[candles.length - 1];
    const touched = last.low <= entryZone.high && last.high >= entryZone.low;

    if (!touched) {
      return false;
    }

    return direction === DIRECTIONS.LONG
      ? last.close > entryZone.high
      : last.close < entryZone.low;
  }

  noTrade({ model, direction, reason, currentPrice, entryZone }) {
    this.logger.noTrade({
      state: "strategy_scan",
      direction,
      reason,
      currentPrice,
      entryZone,
      spread: undefined,
      rr: undefined,
      mode: this.config.mode,
      model
    });
    return { valid: false, reason };
  }
}

module.exports = {
  StrategyEngine,
  candleBody,
  candleRange,
  pipsBetween
};
