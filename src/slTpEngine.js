"use strict";

const { DIRECTIONS } = require("./directionValidator");
const { DEFAULT_PIP_SIZE } = require("./marketDataEngine");

function roundPrice(value) {
  return Number(value.toFixed(5));
}

function pipsBetween(a, b, pipSize = DEFAULT_PIP_SIZE) {
  return Math.abs(a - b) / pipSize;
}

function shiftByPips(price, pips, direction, pipSize = DEFAULT_PIP_SIZE) {
  const delta = pips * pipSize;
  return roundPrice(direction === "UP" ? price + delta : price - delta);
}

class SlTpEngine {
  constructor({ config, pipSize = DEFAULT_PIP_SIZE }) {
    this.config = config;
    this.pipSize = pipSize;
  }

  build({ direction, entry, structuralStop, model = "SCALP", opposingLiquidityPrice }) {
    const orientation = this.validateOrientation({ direction, entry, stopLoss: structuralStop });
    if (!orientation.valid) {
      return { valid: false, reason: orientation.reason };
    }

    const structuralStopPips = pipsBetween(entry, structuralStop, this.pipSize);
    if (structuralStopPips > this.config.maxStopLossPips) {
      return {
        valid: false,
        reason: "structural stop loss exceeds maxStopLossPips",
        stopLossPips: structuralStopPips
      };
    }

    let stopLoss = structuralStop;
    if (structuralStopPips < this.config.minStopLossPips) {
      stopLoss =
        direction === DIRECTIONS.LONG
          ? shiftByPips(entry, this.config.minStopLossPips, "DOWN", this.pipSize)
          : shiftByPips(entry, this.config.minStopLossPips, "UP", this.pipSize);
    }

    const stopLossPips = pipsBetween(entry, stopLoss, this.pipSize);
    const tp1 = direction === DIRECTIONS.LONG
      ? shiftByPips(entry, stopLossPips, "UP", this.pipSize)
      : shiftByPips(entry, stopLossPips, "DOWN", this.pipSize);
    const targetRR = model === "SNIPER" ? this.config.sniperMinRR : this.config.scalpMinRR;
    let tp2 = direction === DIRECTIONS.LONG
      ? shiftByPips(entry, stopLossPips * targetRR, "UP", this.pipSize)
      : shiftByPips(entry, stopLossPips * targetRR, "DOWN", this.pipSize);

    if (opposingLiquidityPrice) {
      const opposingIsBeforeTp2 =
        direction === DIRECTIONS.LONG
          ? opposingLiquidityPrice > entry && opposingLiquidityPrice < tp2
          : opposingLiquidityPrice < entry && opposingLiquidityPrice > tp2;

      if (opposingIsBeforeTp2) {
        tp2 = roundPrice(opposingLiquidityPrice);
      }
    }

    const sanity = this.validateSaneLevels({ direction, entry, stopLoss, tp1, tp2, model });
    if (!sanity.valid) {
      return sanity;
    }

    return {
      valid: true,
      entry,
      stopLoss,
      tp1,
      tp2,
      stopLossPips: sanity.stopLossPips,
      tp1Pips: sanity.tp1Pips,
      tp2Pips: sanity.tp2Pips,
      rr: sanity.rr
    };
  }

  validateOrientation({ direction, entry, stopLoss, tp1, tp2 }) {
    if (direction === DIRECTIONS.LONG) {
      if (!(stopLoss < entry)) {
        return { valid: false, reason: "LONG stop loss must be below entry" };
      }

      if (tp1 !== undefined && tp2 !== undefined && !(tp1 > entry && tp2 > entry)) {
        return { valid: false, reason: "LONG take profits must be above entry" };
      }
    }

    if (direction === DIRECTIONS.SHORT) {
      if (!(stopLoss > entry)) {
        return { valid: false, reason: "SHORT stop loss must be above entry" };
      }

      if (tp1 !== undefined && tp2 !== undefined && !(tp1 < entry && tp2 < entry)) {
        return { valid: false, reason: "SHORT take profits must be below entry" };
      }
    }

    return { valid: true };
  }

  validateSaneLevels({ direction, entry, stopLoss, tp1, tp2, model = "SCALP" }) {
    const orientation = this.validateOrientation({ direction, entry, stopLoss, tp1, tp2 });
    if (!orientation.valid) {
      return orientation;
    }

    const stopLossPips = pipsBetween(entry, stopLoss, this.pipSize);
    const tp1Pips = pipsBetween(entry, tp1, this.pipSize);
    const tp2Pips = pipsBetween(entry, tp2, this.pipSize);
    const rr = tp2Pips / stopLossPips;
    const minRR = model === "SNIPER" ? this.config.sniperMinRR : this.config.scalpMinRR;
    const maxRR = model === "SNIPER" ? 3.0 : 2.0;

    if (stopLossPips > this.config.maxStopLossPips) {
      return { valid: false, reason: "stop loss exceeds maxStopLossPips", stopLossPips };
    }

    if (stopLossPips < this.config.minStopLossPips) {
      return { valid: false, reason: "stop loss is below minStopLossPips", stopLossPips };
    }

    if (rr < minRR) {
      return { valid: false, reason: "RR is below minimum", rr, minRR, stopLossPips, tp1Pips, tp2Pips };
    }

    if (rr > maxRR) {
      return {
        valid: false,
        reason: "TP2 is unrealistically far for configured model",
        rr,
        maxRR,
        stopLossPips,
        tp1Pips,
        tp2Pips
      };
    }

    return { valid: true, stopLossPips, tp1Pips, tp2Pips, rr };
  }
}

module.exports = {
  SlTpEngine,
  pipsBetween,
  shiftByPips
};
