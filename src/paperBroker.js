"use strict";

class PaperBroker {
  constructor({
    accountInfo = { id: "paper-account", balance: 10000, equity: 10000 },
    price = { bid: 1.1000, ask: 1.1001 },
    candles1m,
    candles5m,
    positions = []
  } = {}) {
    this.accountInfo = accountInfo;
    this.price = price;
    this.candles1m = candles1m || buildFlatCandles(90, 1.1000, 0.0002);
    this.candles5m = candles5m || buildFlatCandles(140, 1.1000, 0.0004);
    this.positions = positions;
    this.writeAttempts = [];
  }

  async getAccountInfo() {
    return this.accountInfo;
  }

  async getPrice() {
    return this.price;
  }

  async getCandles({ timeframe, limit }) {
    const source = timeframe === "1m" ? this.candles1m : this.candles5m;
    return source.slice(-limit);
  }

  async getOpenPositions() {
    return this.positions;
  }

  async placeOrder(order) {
    this.writeAttempts.push({ action: "placeOrder", order });
    return { paper: true, order };
  }

  async closePosition(positionId) {
    this.writeAttempts.push({ action: "closePosition", positionId });
    return { paper: true, positionId };
  }

  async partialClose(positionId, volume) {
    this.writeAttempts.push({ action: "partialClose", positionId, volume });
    return { paper: true, positionId, volume };
  }

  async modifyStopLoss(positionId, stopLoss) {
    this.writeAttempts.push({ action: "modifyStopLoss", positionId, stopLoss });
    return { paper: true, positionId, stopLoss };
  }

  async modifyTakeProfit(positionId, takeProfit) {
    this.writeAttempts.push({ action: "modifyTakeProfit", positionId, takeProfit });
    return { paper: true, positionId, takeProfit };
  }
}

function buildFlatCandles(count, basePrice, range) {
  return Array.from({ length: count }, (_item, index) => {
    const open = basePrice + ((index % 5) - 2) * 0.00001;
    const close = open + (index % 2 === 0 ? 0.00002 : -0.00002);

    return {
      time: new Date(Date.now() - (count - index) * 60_000).toISOString(),
      open: Number(open.toFixed(5)),
      high: Number((Math.max(open, close) + range / 2).toFixed(5)),
      low: Number((Math.min(open, close) - range / 2).toFixed(5)),
      close: Number(close.toFixed(5))
    };
  });
}

module.exports = {
  PaperBroker,
  buildFlatCandles
};
