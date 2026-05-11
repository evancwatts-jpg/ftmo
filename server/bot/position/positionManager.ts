import type { BotConfig } from "../config/botConfig";
import type { CommandController } from "../core/commandController";
import type { AuditLogger } from "../core/logger";
import type { MarketState } from "../strategy/strategyTypes";
import { type ExhaustionSignal, type ManagedPosition, ProfitExhaustionDetector } from "./profitExhaustion";

export class PositionManager {
  config: BotConfig;
  commandController: CommandController;
  broker: any;
  logger: AuditLogger;
  profitExhaustionDetector: ProfitExhaustionDetector;

  constructor({ config, commandController, broker, logger, profitExhaustionDetector }: {
    config: BotConfig;
    commandController: CommandController;
    broker: any;
    logger: AuditLogger;
    profitExhaustionDetector?: ProfitExhaustionDetector;
  }) {
    this.config = config;
    this.commandController = commandController;
    this.broker = broker;
    this.logger = logger;
    this.profitExhaustionDetector = profitExhaustionDetector || new ProfitExhaustionDetector();
  }

  async closePosition(position: ManagedPosition, reason = "approved exit rule"): Promise<Record<string, unknown>> {
    if (!this.canAct("close order", reason)) {
      return { closed: false, blocked: true };
    }

    const result = await this.broker.closePosition(position.id);
    return { closed: true, result };
  }

  async closeAll(positions: ManagedPosition[], reason = "approved exit rule"): Promise<Record<string, unknown>> {
    if (!this.canAct("close all", reason)) {
      return { closed: false, blocked: true };
    }

    const results = [];
    for (const position of positions) {
      results.push(await this.broker.closePosition(position.id));
    }

    return { closed: true, results };
  }

  async partialClose(position: ManagedPosition, volume: number, reason = "TP1 partial close"): Promise<Record<string, unknown>> {
    if (!this.canAct("partial close", reason)) {
      return { closed: false, blocked: true };
    }

    const result = await this.broker.partialClose(position.id, volume);
    return { closed: true, result };
  }

  async modifyStopLoss(position: ManagedPosition, stopLoss: number, reason = "approved stop update"): Promise<Record<string, unknown>> {
    if (!this.canAct("modify SL", reason)) {
      return { modified: false, blocked: true };
    }

    const result = await this.broker.modifyStopLoss(position.id, stopLoss);
    return { modified: true, result };
  }

  async modifyTakeProfit(position: ManagedPosition, takeProfit: number, reason = "approved target update"): Promise<Record<string, unknown>> {
    if (!this.canAct("modify TP", reason)) {
      return { modified: false, blocked: true };
    }

    const result = await this.broker.modifyTakeProfit(position.id, takeProfit);
    return { modified: true, result };
  }

  moveStopToBreakeven(position: ManagedPosition, reason = "profit protection after +1R"): Promise<Record<string, unknown>> {
    return this.modifyStopLoss(position, position.entry, reason);
  }

  trailStop(position: ManagedPosition, stopLoss: number, reason = "profit protection trailing stop"): Promise<Record<string, unknown>> {
    return this.modifyStopLoss(position, stopLoss, reason);
  }

  async handleDailyPnl(position: ManagedPosition, dailyPnlState: MarketState["dailyPnlState"]): Promise<Record<string, unknown>> {
    if (!this.config.enableDailyPnLBlocks) {
      this.logger.log("NO_ACTION", "daily_pnl", {
        reason: "daily P&L blocks are disabled",
        dailyPnlState
      });
      return { closed: false, blocked: true };
    }

    if (dailyPnlState?.mustClose) {
      return this.closePosition(position, "daily P&L hard limit");
    }

    return { closed: false, blocked: false };
  }

  async handleProfitExhaustion(position: ManagedPosition, market: MarketState): Promise<Record<string, unknown> & { evaluation?: ExhaustionSignal }> {
    if (!this.config.enableProfitExhaustionExit) {
      return { closed: false, reason: "profit exhaustion disabled" };
    }

    const evaluation = this.profitExhaustionDetector.evaluate({ position, market });
    if (!evaluation.shouldClose) {
      return { closed: false, evaluation };
    }

    const closeResult = evaluation.shouldCloseFull
      ? await this.closePosition(position, "profit exhaustion exit")
      : await this.partialClose(position, 0.5, "profit exhaustion partial close");

    if (closeResult.closed) {
      this.logger.profitExit({
        currentR: evaluation.rMultiple,
        exhaustionScore: evaluation.score,
        reasons: evaluation.reasons,
        actionTaken: evaluation.shouldCloseFull ? "close full" : "close partial"
      });
    }

    return { ...closeResult, evaluation };
  }

  canAct(action: string, reason: string): boolean {
    const reasonText = String(reason || "").toLowerCase();

    if ((reasonText.includes("daily pnl") || reasonText.includes("daily p&l")) && !this.config.enableDailyPnLBlocks) {
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
