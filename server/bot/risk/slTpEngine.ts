import type { BotConfig } from "../config/botConfig";
import { DEFAULT_PIP_SIZE, pipsBetween, roundPrice, shiftByPips } from "../market/candleUtils";
import { DIRECTIONS, type SetupType, type TradeDirection } from "../strategy/strategyTypes";

export interface SlTpPlan {
  entry: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  stopLossPips: number;
  rrToTp1: number;
  rrToTp2: number;
  valid: boolean;
  reason: string;
  rr?: number;
  tp1Pips?: number;
  tp2Pips?: number;
}

export class SlTpEngine {
  config: BotConfig;
  pipSize: number;

  constructor({ config, pipSize = DEFAULT_PIP_SIZE }: { config: BotConfig; pipSize?: number }) {
    this.config = config;
    this.pipSize = pipSize;
  }

  build({ direction, entry, structuralStop, model = "SCALP", opposingLiquidityPrice }: {
    direction: TradeDirection;
    entry: number;
    structuralStop: number;
    model?: SetupType;
    opposingLiquidityPrice?: number;
  }): SlTpPlan {
    const maxStopLossPips = model === "SNIPER" ? Math.max(this.config.maxStopLossPips, 15) : this.config.maxStopLossPips;
    const orientation = this.validateOrientation({ direction, entry, stopLoss: structuralStop });
    if (!orientation.valid) {
      return invalidPlan(entry, orientation.reason);
    }

    const structuralStopPips = pipsBetween(entry, structuralStop, this.pipSize);
    if (structuralStopPips > maxStopLossPips) {
      return invalidPlan(entry, "structural stop loss exceeds maxStopLossPips", structuralStopPips);
    }

    let stopLoss = structuralStop;
    if (structuralStopPips < this.config.minStopLossPips) {
      stopLoss = direction === DIRECTIONS.LONG
        ? shiftByPips(entry, this.config.minStopLossPips, "DOWN", this.pipSize)
        : shiftByPips(entry, this.config.minStopLossPips, "UP", this.pipSize);
    }

    const stopLossPips = pipsBetween(entry, stopLoss, this.pipSize);
    const minRR = model === "SNIPER" ? this.config.sniperMinRR : this.config.scalpMinRR;
    const tp1 = direction === DIRECTIONS.LONG
      ? shiftByPips(entry, stopLossPips, "UP", this.pipSize)
      : shiftByPips(entry, stopLossPips, "DOWN", this.pipSize);
    let tp2 = direction === DIRECTIONS.LONG
      ? shiftByPips(entry, stopLossPips * minRR, "UP", this.pipSize)
      : shiftByPips(entry, stopLossPips * minRR, "DOWN", this.pipSize);

    if (opposingLiquidityPrice) {
      const opposingBeforeTp2 = direction === DIRECTIONS.LONG
        ? opposingLiquidityPrice > entry && opposingLiquidityPrice < tp2
        : opposingLiquidityPrice < entry && opposingLiquidityPrice > tp2;

      if (opposingBeforeTp2) {
        tp2 = roundPrice(opposingLiquidityPrice);
      }
    }

    const sanity = this.validateSaneLevels({ direction, entry, stopLoss, tp1, tp2, model });
    if (!sanity.valid) {
      return sanity;
    }

    return {
      ...sanity,
      valid: true,
      reason: "SL/TP plan is risk-first and valid",
      entry,
      stopLoss,
      tp1,
      tp2,
      rr: sanity.rrToTp2
    };
  }

  validateOrientation({ direction, entry, stopLoss, tp1, tp2 }: {
    direction: TradeDirection;
    entry: number;
    stopLoss: number;
    tp1?: number;
    tp2?: number;
  }): { valid: boolean; reason: string } {
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

    return { valid: true, reason: "orientation valid" };
  }

  validateSaneLevels({ direction, entry, stopLoss, tp1, tp2, model = "SCALP" }: {
    direction: TradeDirection;
    entry: number;
    stopLoss: number;
    tp1: number;
    tp2: number;
    model?: SetupType;
  }): SlTpPlan {
    const orientation = this.validateOrientation({ direction, entry, stopLoss, tp1, tp2 });
    if (!orientation.valid) {
      return invalidPlan(entry, orientation.reason);
    }

    const stopLossPips = pipsBetween(entry, stopLoss, this.pipSize);
    const tp1Pips = pipsBetween(entry, tp1, this.pipSize);
    const tp2Pips = pipsBetween(entry, tp2, this.pipSize);
    const rrToTp1 = tp1Pips / stopLossPips;
    const rrToTp2 = tp2Pips / stopLossPips;
    const minRR = model === "SNIPER" ? this.config.sniperMinRR : this.config.scalpMinRR;
    const maxRR = model === "SNIPER" ? 3 : 2;
    const maxStopLossPips = model === "SNIPER" ? Math.max(this.config.maxStopLossPips, 15) : this.config.maxStopLossPips;

    if (stopLossPips > maxStopLossPips) {
      return invalidPlan(entry, "stop loss exceeds maxStopLossPips", stopLossPips);
    }

    if (stopLossPips < this.config.minStopLossPips) {
      return invalidPlan(entry, "stop loss is below minStopLossPips", stopLossPips);
    }

    if (rrToTp2 < minRR) {
      return { ...invalidPlan(entry, "RR is below minimum", stopLossPips), rrToTp1, rrToTp2, tp1Pips, tp2Pips };
    }

    if (rrToTp2 > maxRR) {
      return { ...invalidPlan(entry, "TP2 is unrealistically far for configured model", stopLossPips), rrToTp1, rrToTp2, tp1Pips, tp2Pips };
    }

    return {
      valid: true,
      reason: "SL/TP levels are sane",
      entry,
      stopLoss,
      tp1,
      tp2,
      stopLossPips,
      rrToTp1,
      rrToTp2,
      rr: rrToTp2,
      tp1Pips,
      tp2Pips
    };
  }
}

function invalidPlan(entry: number, reason: string, stopLossPips = 0): SlTpPlan {
  return {
    valid: false,
    reason,
    entry,
    stopLoss: 0,
    tp1: 0,
    tp2: 0,
    stopLossPips,
    rrToTp1: 0,
    rrToTp2: 0,
    rr: 0
  };
}

export { pipsBetween, shiftByPips };
