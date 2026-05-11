import { type BotConfig, type BotMode, MODES } from "../config/botConfig";
import { canExecuteBrokerAction } from "../execution/executionGuard";
import type { AuditLogger } from "./logger";

export class CommandController {
  config: BotConfig;
  logger: AuditLogger;

  constructor({ config, logger }: { config: BotConfig; logger: AuditLogger }) {
    this.config = config;
    this.logger = logger;
  }

  setMode(mode: BotMode): void {
    if (!Object.values(MODES).includes(mode)) {
      throw new Error(`Invalid mode: ${mode}`);
    }

    this.config.mode = mode;
    this.logger.log("MODE", "mode_changed", { mode });
  }

  canScan({ dashboardRequest = false } = {}): boolean {
    if (this.config.mode === "OFF") {
      return dashboardRequest;
    }

    return true;
  }

  canExecuteBrokerAction(action: string, reason = ""): boolean {
    return canExecuteBrokerAction({
      mode: this.config.mode,
      action,
      reason: normalizeReason(reason),
      logger: this.logger
    });
  }
}

function normalizeReason(reason: unknown): string {
  if (typeof reason === "string") {
    return reason;
  }

  try {
    return JSON.stringify(reason);
  } catch (_error) {
    return String(reason);
  }
}
