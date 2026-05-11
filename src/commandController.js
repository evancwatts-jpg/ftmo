"use strict";

const { MODES } = require("./config");

function normalizeReason(reason) {
  if (typeof reason === "string") {
    return reason;
  }

  try {
    return JSON.stringify(reason);
  } catch (_error) {
    return String(reason);
  }
}

class CommandController {
  constructor({ config, logger }) {
    this.config = config;
    this.logger = logger;
  }

  setMode(mode) {
    if (!Object.values(MODES).includes(mode)) {
      throw new Error(`Invalid mode: ${mode}`);
    }

    this.config.mode = mode;
    this.logger.log("MODE", "mode_changed", { mode });
  }

  canScan({ dashboardRequest = false } = {}) {
    if (this.config.mode === MODES.OFF) {
      return Boolean(dashboardRequest);
    }

    return true;
  }

  canExecuteBrokerAction(action, reason = "") {
    const reasonText = normalizeReason(reason);

    if (this.config.mode !== MODES.LIVE) {
      this.logger.log("BLOCKED", action, {
        reason: reasonText,
        blockReason: "mode is not LIVE",
        mode: this.config.mode
      });
      return false;
    }

    const lowerReason = reasonText.toLowerCase();
    if (
      lowerReason.includes("daily p&l warning") ||
      lowerReason.includes("daily pnl warning") ||
      lowerReason.includes("informational warning") ||
      lowerReason.includes("dashboard warning")
    ) {
      this.logger.log("BLOCKED", action, {
        reason: reasonText,
        blockReason: "informational warning cannot execute",
        mode: this.config.mode
      });
      return false;
    }

    return true;
  }
}

module.exports = {
  CommandController
};
