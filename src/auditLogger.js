"use strict";

class AuditLogger {
  constructor({ sink } = {}) {
    this.events = [];
    this.sink = sink;
  }

  log(state, action, details = {}) {
    const event = {
      timestamp: new Date().toISOString(),
      state,
      action,
      ...details
    };

    this.events.push(event);

    if (typeof this.sink === "function") {
      this.sink(event);
    }

    return event;
  }

  noTrade(details) {
    return this.log("NO_TRADE", "setup_scan", details);
  }

  rejectedOrder(details) {
    return this.log("REJECTED", "order_validation", details);
  }

  executedOrder(details) {
    return this.log("EXECUTED", "order_placed", details);
  }

  profitExit(details) {
    return this.log("PROFIT_EXIT", "position_closed", details);
  }
}

module.exports = {
  AuditLogger
};
