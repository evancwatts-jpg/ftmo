"use strict";

const { MODES } = require("./config");

class ObservationSimulator {
  constructor({ config, logger }) {
    this.config = config;
    this.logger = logger;
    this.hypotheticalTrades = [];
  }

  recordHypotheticalTrade({ setup, levels, sizing, market }) {
    if (this.config.mode !== MODES.OBSERVATION) {
      return { recorded: false, reason: "not in observation mode" };
    }

    const trade = {
      timestamp: new Date().toISOString(),
      setup,
      levels,
      sizing,
      market
    };

    this.hypotheticalTrades.push(trade);
    this.logger.log("OBSERVATION", "hypothetical_trade", {
      direction: setup.direction,
      entry: levels.entry,
      sl: levels.stopLoss,
      tp1: levels.tp1,
      tp2: levels.tp2,
      rr: levels.rr,
      lotSize: sizing.lotSize
    });

    return { recorded: true, trade };
  }
}

module.exports = {
  ObservationSimulator
};
