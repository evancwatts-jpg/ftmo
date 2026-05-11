import type { BotMode } from "../config/botConfig";
import type { AuditLogger } from "../core/logger";

export function canExecuteBrokerAction(params: {
  mode: BotMode;
  action: string;
  reason: string;
  logger?: AuditLogger;
}): boolean {
  const { mode, action, reason, logger } = params;

  if (mode !== "LIVE") {
    logger?.logBlockedAction({
      action,
      reason,
      blockedBecause: `Mode is ${mode}, not LIVE`,
      mode
    });
    return false;
  }

  const lowerReason = reason.toLowerCase();
  const forbiddenInformationalReasons = [
    "daily pnl",
    "daily p&l",
    "daily loss",
    "daily profit",
    "reference limit",
    "informational",
    "dashboard warning",
    "best day warning"
  ];

  if (forbiddenInformationalReasons.some((item) => lowerReason.includes(item))) {
    logger?.logBlockedAction({
      action,
      reason,
      blockedBecause: "Informational metric cannot trigger broker execution",
      mode
    });
    return false;
  }

  return true;
}
