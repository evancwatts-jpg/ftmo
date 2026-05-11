"use strict";

class MetaApiBrokerAdapter {
  constructor({ connection, account }) {
    this.connection = connection;
    this.account = account;
  }

  async getAccountInfo() {
    if (this.account && typeof this.account.getAccountInformation === "function") {
      return this.account.getAccountInformation();
    }

    return this.connection.getAccountInformation();
  }

  async getPrice(symbol) {
    return this.connection.getSymbolPrice(symbol);
  }

  async getCandles({ symbol, timeframe, limit }) {
    return this.connection.getHistoricalCandles(symbol, timeframe, undefined, limit);
  }

  async getOpenPositions(symbol) {
    const positions = await this.connection.getPositions();
    return symbol ? positions.filter((position) => position.symbol === symbol) : positions;
  }

  async placeOrder(order) {
    if (order.orderSide === "BUY") {
      return this.connection.createMarketBuyOrder(order.symbol, order.lotSize, order.stopLoss, order.tp2, {
        comment: order.comment || "ftmo-rebuild"
      });
    }

    return this.connection.createMarketSellOrder(order.symbol, order.lotSize, order.stopLoss, order.tp2, {
      comment: order.comment || "ftmo-rebuild"
    });
  }

  async closePosition(positionId) {
    return this.connection.closePosition(positionId);
  }

  async partialClose(positionId, volume) {
    return this.connection.closePositionPartially(positionId, volume);
  }

  async modifyStopLoss(positionId, stopLoss) {
    return this.connection.modifyPosition(positionId, stopLoss, undefined);
  }

  async modifyTakeProfit(positionId, takeProfit) {
    return this.connection.modifyPosition(positionId, undefined, takeProfit);
  }
}

module.exports = {
  MetaApiBrokerAdapter
};
