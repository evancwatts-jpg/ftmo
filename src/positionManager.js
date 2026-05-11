"use strict";

class PositionManager {
  constructor({ config, commandController, broker, logger, profitExhaustionDetector }) {
    this.config = config;
    this.commandController = commandController;
    this.broker = broker;
    this.logger = logger;
    this.profitExhaustionDetector = profitExhaustionDetector;
  }

  async closePosition(position, reason = "approved exit rule") {
    if (!this.canAct("close order", reason)) {
      return { closed: false, blocked: true };
    }

    const result = await this.broker.closePosition(position.id);
    return { closed: true, result };
  }

  async closeAll(positions, reason = "approved exit rule") {
    if (!this.canAct("close all", reason)) {
      return { closed: false, blocked: true };
    }

    const results = [];
    for (const position of positions) {
      results.push(await this.broker.closePosition(position.id));
    }

    return { closed: true, results };
  }

  async partialClose(position, volume, reason = "TP1 partial close") {
    if (!this.canAct("partial close", reason)) {
      return { closed: false, blocked: true };
    }

    const result = await this.broker.partialClose(position.id, volume);
    return { closed: true, result };
  }

  async modifyStopLoss(position, stopLoss, reason = "approved stop update") {
    if (!this.canAct("modify SL", reason)) {
      return { modified: false, blocked: true };
    }

    const result = await this.broker.modifyStopLoss(position.id, stopLoss);
    return { modified: true, result };
  }

  async modifyTakeProfit(position, takeProfit, reason = "approved target update") {
    if (!this.canAct("modify TP", reason)) {
      return { modified: false, blocked: true };
    }

    const result = await this.broker.modifyTakeProfit(position.id, takeProfit);
    return { modified: true, result };
  }

  async moveStopToBreakeven(position, reason = "profit protection after +1R") {
    return this.modifyStopLoss(position, position.entry, reason);
  }

  async trailStop(position, stopLoss, reason = "profit protection trailing stop") {
    return this.modifyStopLoss(position, stopLoss, reason);
  }

  async handleDailyPnl(position, dailyPnlState) {
    if (!this.config.enableDailyPnLBlocks) {
      this.logger.log("NO_ACTION", "daily_pnl", {
        reason: "daily P&L blocks are disabled",
        dailyPnlState
      });
      return { closed: false, blocked: true };
    }

    if (dailyPnlState && dailyPnlState.mustClose) {
      return this.closePosition(position, "daily P&L hard limit");
    }

    return { closed: false, blocked: false };
  }

  async handleProfitExhaustion(position, market) {
    if (!this.config.enableProfitExhaustionExit) {
      return { closed: false, reason: "profit exhaustion disabled" };
    }

    const evaluation = this.profitExhaustionDetector.evaluate({ position, market });
    if (!evaluation.shouldClose) {
      return { closed: false, evaluation };
    }

    const closeResult = await this.closePosition(position, "profit exhaustion exit");
    if (closeResult.closed) {
      this.logger.profitExit({
        currentRMultiple: evaluation.rMultiple,
        exhaustionScore: evaluation.score,
        signalsDetected: evaluation.signals,
        reasonClosed: evaluation.reason
      });
    }

    return { ...closeResult, evaluation };
  }

  canAct(action, reason) {
    const reasonText = String(reason || "").toLowerCase();

    if (reasonText.includes("daily p&l") && !this.config.enableDailyPnLBlocks) {
      this.logger.log("BLOCKED", action, {
        reason,
        blockReason: "daily P&L blocks are disabled",
        mode: this.config.mode
      });
      return false;
    }

    if (reasonText.includes("structure") && !this.config.enableStructureExit) {
      this.logger.log("BLOCKED", action, {
        reason,
        blockReason: "structure exits are disabled",
        mode: this.config.mode
      });
      return false;
    }

    return this.commandController.canExecuteBrokerAction(action, reason);
  }
}

module.exports = {
  PositionManager
};
