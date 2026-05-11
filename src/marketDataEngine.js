"use strict";

const DEFAULT_PIP_SIZE = 0.0001;

class MarketDataEngine {
  constructor({ broker, symbol = "EURUSD", pipSize = DEFAULT_PIP_SIZE } = {}) {
    this.broker = broker;
    this.symbol = symbol;
    this.pipSize = pipSize;
  }

  async getAccountInfo() {
    return this.broker.getAccountInfo();
  }

  async getPrice(symbol = this.symbol) {
    return this.broker.getPrice(symbol);
  }

  async getCandles({ symbol = this.symbol, timeframe, limit }) {
    return this.broker.getCandles({ symbol, timeframe, limit });
  }

  async getOpenPositions(symbol = this.symbol) {
    return this.broker.getOpenPositions(symbol);
  }

  calculateSpreadPips({ bid, ask }) {
    return Number(((ask - bid) / this.pipSize).toFixed(2));
  }
}

module.exports = {
  DEFAULT_PIP_SIZE,
  MarketDataEngine
};
