import type { BotConfig } from "../config/botConfig";
import type { AuditLogger } from "../core/logger";
import type { AccountManager } from "../account/accountManager";
import { DIRECTIONS, type MarketState, type StrategySetup } from "../strategy/strategyTypes";
import type { DirectionValidationResult } from "./directionValidator";
import type { SlTpPlan } from "./slTpEngine";

export interface RiskPlan {
  accountSize: number;
  riskPercent: number;
  maxRiskDollars: number;
  stopLossPips: number;
  lotSize: number;
  manualOverrideUsed: boolean;
  expectedDollarLoss: number;
  valid: boolean;
  reason: string;
  allowed: boolean;
  reasons: string[];
  dollarRisk: number;
  minRR?: number;
}

export class RiskEngine {
  config: BotConfig;
  accountManager: AccountManager;
  logger: AuditLogger;

  constructor({ config, accountManager, logger }: { config: BotConfig; accountManager: AccountManager; logger: AuditLogger }) {
    this.config = config;
    this.accountManager = accountManager;
    this.logger = logger;
  }

  calculateLotSize(stopLossPips: number): { dollarRisk: number; lotSize: number } {
    const plan = this.buildRiskPlan(stopLossPips);
    return { dollarRisk: plan.maxRiskDollars, lotSize: plan.lotSize };
  }

  buildRiskPlan(stopLossPips: number): RiskPlan {
    if (!stopLossPips || stopLossPips <= 0) {
      throw new Error("stopLossPips must be greater than 0");
    }

    const maxRiskDollars = this.accountManager.getMaxAllowedRiskDollars();
    const manualOverrideUsed = this.config.manualLotOverrideEnabled && this.config.manualLotSize !== null;
    const lotSize = manualOverrideUsed
      ? Number(this.config.manualLotSize)
      : Number((maxRiskDollars / stopLossPips).toFixed(2));
    const expectedDollarLoss = Number((lotSize * stopLossPips).toFixed(2));
    const valid = expectedDollarLoss <= maxRiskDollars;
    const reason = valid
      ? "risk plan is valid"
      : "manual lot override exceeds max allowed risk dollars";

    return {
      accountSize: this.config.accountSize,
      riskPercent: this.config.riskPercent,
      maxRiskDollars,
      stopLossPips,
      lotSize,
      manualOverrideUsed,
      expectedDollarLoss,
      valid,
      reason,
      allowed: valid,
      reasons: valid ? [] : [reason],
      dollarRisk: maxRiskDollars
    };
  }

  dailyPnlAllowsTrade({ dailyPnlState }: { dailyPnlState?: MarketState["dailyPnlState"] } = {}): boolean {
    if (!this.config.enableDailyPnLBlocks) {
      return true;
    }

    return !dailyPnlState?.blockTrading;
  }

  cooldownAllowsTrade({ cooldownActive }: { cooldownActive?: boolean } = {}): boolean {
    if (!this.config.enableCooldown) {
      return true;
    }

    return !cooldownActive;
  }

  sessionAllowsTrade({ sessionLabel, model }: { sessionLabel?: string; model?: string } = {}): boolean {
    if (!this.config.sessionAdjustedRules) {
      return true;
    }

    return !(sessionLabel === "OFF_HOURS" && model === "SCALP");
  }

  htfBiasAllowsTrade({ htfBias, direction }: { htfBias?: string; direction?: string } = {}): boolean {
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

  evaluateTrade(params: {
    setup: StrategySetup;
    levels: SlTpPlan;
    market?: MarketState;
    openPositions?: number;
    dailyPnlState?: MarketState["dailyPnlState"];
    cooldownActive?: boolean;
    directionValidation?: DirectionValidationResult;
  }): RiskPlan {
    const market = params.market || {} as MarketState;
    const reasons: string[] = [];
    const minRR = params.setup.model === "SNIPER" ? this.config.sniperMinRR : this.config.scalpMinRR;

    if ((params.openPositions || 0) >= this.config.maxOpenPositions) {
      reasons.push("max open positions reached");
    }

    if (market.spreadPips !== undefined && market.spreadPips > this.config.spreadMaxPips) {
      reasons.push("spread exceeds max");
    }

    if (market.inNewsBlackout) {
      reasons.push("news blackout active");
    }

    if (!params.levels.valid) {
      reasons.push(params.levels.reason);
    }

    if (params.levels.rrToTp2 < minRR) {
      reasons.push("RR is below minimum");
    }

    if (!this.dailyPnlAllowsTrade({ dailyPnlState: params.dailyPnlState })) {
      reasons.push("daily P&L block active");
    }

    if (!this.cooldownAllowsTrade({ cooldownActive: params.cooldownActive })) {
      reasons.push("cooldown active");
    }

    if (!this.sessionAllowsTrade({ sessionLabel: market.sessionLabel, model: params.setup.model })) {
      reasons.push("session-adjusted rule blocks trade");
    }

    if (!this.htfBiasAllowsTrade({ htfBias: market.htfBias, direction: params.setup.direction })) {
      reasons.push("strict HTF bias blocks trade");
    }

    if (!params.directionValidation?.valid) {
      reasons.push(params.directionValidation ? params.directionValidation.reason : "direction validation missing");
    }

    const sizing = this.buildRiskPlan(params.levels.stopLossPips);
    if (!sizing.valid) {
      reasons.push(sizing.reason);
    }

    if (reasons.length > 0) {
      this.logger.noTrade({
        state: "risk_validation",
        currentPrice: market.currentPrice,
        spread: market.spreadPips,
        mode: this.config.mode,
        direction: params.setup.direction,
        reason: reasons.join("; "),
        entryZone: params.setup.entryZone,
        marketShift: market.marketShift,
        rr: params.levels.rrToTp2,
        model: params.setup.model
      });
    }

    return {
      ...sizing,
      allowed: reasons.length === 0,
      valid: reasons.length === 0,
      reasons,
      reason: reasons.length === 0 ? sizing.reason : reasons.join("; "),
      minRR
    };
  }
}
