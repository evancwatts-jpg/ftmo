import type { OrderSide } from "../strategy/strategyTypes";

export interface BrokerOrder {
  symbol: "EURUSD";
  orderSide: OrderSide;
  lotSize: number;
  stopLoss: number;
  tp2: number;
  comment?: string;
}

export class MetaApiBrokerAdapter {
  connection: any;
  account: any;

  constructor({ connection, account }: { connection: any; account?: any }) {
    this.connection = connection;
    this.account = account;
  }

  getAccountInfo(): Promise<unknown> {
    if (this.account && typeof this.account.getAccountInformation === "function") {
      return this.account.getAccountInformation();
    }

    return this.connection.getAccountInformation();
  }

  getPrice(symbol: string): Promise<Record<string, number>> {
    return this.connection.getSymbolPrice(symbol);
  }

  getCandles({ symbol, timeframe, limit }: { symbol: string; timeframe: string; limit?: number }): Promise<unknown[]> {
    return this.connection.getHistoricalCandles(symbol, timeframe, undefined, limit);
  }

  async getOpenPositions(symbol?: string): Promise<unknown[]> {
    const positions = await this.connection.getPositions();
    return symbol
      ? positions.filter((position: Record<string, unknown>) => position.symbol === symbol)
      : positions;
  }

  placeOrder(order: BrokerOrder): Promise<unknown> {
    if (order.orderSide === "BUY") {
      return this.connection.createMarketBuyOrder(order.symbol, order.lotSize, order.stopLoss, order.tp2, {
        comment: order.comment || "ftmo-rebuild"
      });
    }

    return this.connection.createMarketSellOrder(order.symbol, order.lotSize, order.stopLoss, order.tp2, {
      comment: order.comment || "ftmo-rebuild"
    });
  }

  closePosition(positionId: string): Promise<unknown> {
    return this.connection.closePosition(positionId);
  }

  partialClose(positionId: string, volume: number): Promise<unknown> {
    return this.connection.closePositionPartially(positionId, volume);
  }

  modifyStopLoss(positionId: string, stopLoss: number): Promise<unknown> {
    return this.connection.modifyPosition(positionId, stopLoss, undefined);
  }

  modifyTakeProfit(positionId: string, takeProfit: number): Promise<unknown> {
    return this.connection.modifyPosition(positionId, undefined, takeProfit);
  }
}
