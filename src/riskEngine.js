"use strict";

const { DIRECTIONS } = require("./directionValidator");

class RiskEngine {
  constructor({ config, accountManager, logger }) {
    this.config = config;
    this.accountManager = accountManager;
    this.logger = logger;
  }

  calculateLotSize(stopLossPips) {
    if (!stopLossPips || stopLossPips <= 0) {
      throw new Error("stopLossPips must be greater than 0");
    }

    const dollarRisk = this.accountManager.getDollarRisk();
    const lotSize = dollarRisk / stopLossPips;

    return {
      dollarRisk,
      lotSize: Number(lotSize.toFixed(2))
    };
  }

  dailyPnlAllowsTrade({ dailyPnlState } = {}) {
    if (!this.config.enableDailyPnLBlocks) {
      return true;
    }

    return !(dailyPnlState && dailyPnlState.blockTrading);
  }

  cooldownAllowsTrade({ cooldownActive } = {}) {
    if (!this.config.enableCooldown) {
      return true;
    }

    return !cooldownActive;
  }

  sessionAllowsTrade({ sessionLabel, model } = {}) {
    if (!this.config.sessionAdjustedRules) {
      return true;
    }

    if (sessionLabel === "OFF_HOURS" && model === "SCALP") {
      return false;
    }

    return true;
  }

  htfBiasAllowsTrade({ htfBias, direction } = {}) {
    if (!this.config.strictHTFBias) {
      return true;
    }

    if (htfBias === "BULLISH" && direction === DIRECTIONS.SHORT) {
      return false;
    }

    if (htfBias === "BEARISH" && direction === DIRECTIONS.LONG) {
      return false;
    }

    return true;
  }

  evaluateTrade({
    setup,
    levels,
    market = {},
    openPositions = 0,
    dailyPnlState,
    cooldownActive = false,
    directionValidation
  }) {
    const reasons = [];
    const minRR = setup.model === "SNIPER" ? this.config.sniperMinRR : this.config.scalpMinRR;

    if (openPositions >= this.config.maxOpenPositions) {
      reasons.push("max open positions reached");
    }

    if (market.spreadPips !== undefined && market.spreadPips > this.config.spreadMaxPips) {
      reasons.push("spread exceeds max");
    }

    if (market.inNewsBlackout) {
      reasons.push("news blackout active");
    }

    if (!levels || !levels.stopLoss || !levels.tp1 || !levels.tp2) {
      reasons.push("SL and TP are required");
    }

    if (levels && levels.rr < minRR) {
      reasons.push("RR is below minimum");
    }

    if (!this.dailyPnlAllowsTrade({ dailyPnlState })) {
      reasons.push("daily P&L block active");
    }

    if (!this.cooldownAllowsTrade({ cooldownActive })) {
      reasons.push("cooldown active");
    }

    if (!this.sessionAllowsTrade({ sessionLabel: market.sessionLabel, model: setup.model })) {
      reasons.push("session-adjusted rule blocks trade");
    }

    if (!this.htfBiasAllowsTrade({ htfBias: market.htfBias, direction: setup.direction })) {
      reasons.push("strict HTF bias blocks trade");
    }

    if (!directionValidation || !directionValidation.valid) {
      reasons.push(directionValidation ? directionValidation.reason : "direction validation missing");
    }

    if (reasons.length > 0) {
      this.logger.noTrade({
        state: "risk_validation",
        direction: setup.direction,
        reason: reasons.join("; "),
        currentPrice: market.currentPrice,
        entryZone: setup.entryZone,
        spread: market.spreadPips,
        rr: levels && levels.rr,
        mode: this.config.mode
      });

      return { allowed: false, reasons };
    }

    const sizing = this.calculateLotSize(levels.stopLossPips);

    return {
      allowed: true,
      reasons: [],
      dollarRisk: sizing.dollarRisk,
      lotSize: sizing.lotSize,
      minRR
    };
  }
}

module.exports = {
  RiskEngine
};
