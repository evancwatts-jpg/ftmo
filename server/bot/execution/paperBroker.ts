import type { Candle } from "../strategy/strategyTypes";

export class PaperBroker {
  accountInfo: unknown;
  price: Record<string, number>;
  candles1m: Candle[];
  candles5m: Candle[];
  positions: any[];
  writeAttempts: any[] = [];

  constructor({
    accountInfo = { id: "paper-account", balance: 10000, equity: 10000 },
    price = { bid: 1.1000, ask: 1.1001 },
    candles1m,
    candles5m,
    positions = []
  }: {
    accountInfo?: unknown;
    price?: Record<string, number>;
    candles1m?: Candle[];
    candles5m?: Candle[];
    positions?: any[];
  } = {}) {
    this.accountInfo = accountInfo;
    this.price = price;
    this.candles1m = candles1m || buildFlatCandles(90, 1.1000, 0.0002);
    this.candles5m = candles5m || buildFlatCandles(140, 1.1000, 0.0004);
    this.positions = positions;
  }

  async getAccountInfo(): Promise<unknown> {
    return this.accountInfo;
  }

  async getPrice(): Promise<Record<string, number>> {
    return this.price;
  }

  async getCandles({ timeframe, limit = 100 }: { timeframe: string; limit?: number }): Promise<Candle[]> {
    const source = timeframe === "1m" ? this.candles1m : this.candles5m;
    return source.slice(-limit);
  }

  async getOpenPositions(): Promise<any[]> {
    return this.positions;
  }

  async placeOrder(order: unknown): Promise<unknown> {
    this.writeAttempts.push({ action: "placeOrder", order });
    return { paper: true, order };
  }

  async closePosition(positionId: string): Promise<unknown> {
    this.writeAttempts.push({ action: "closePosition", positionId });
    return { paper: true, positionId };
  }

  async partialClose(positionId: string, volume: number): Promise<unknown> {
    this.writeAttempts.push({ action: "partialClose", positionId, volume });
    return { paper: true, positionId, volume };
  }

  async modifyStopLoss(positionId: string, stopLoss: number): Promise<unknown> {
    this.writeAttempts.push({ action: "modifyStopLoss", positionId, stopLoss });
    return { paper: true, positionId, stopLoss };
  }

  async modifyTakeProfit(positionId: string, takeProfit: number): Promise<unknown> {
    this.writeAttempts.push({ action: "modifyTakeProfit", positionId, takeProfit });
    return { paper: true, positionId, takeProfit };
  }
}

export function buildFlatCandles(count: number, basePrice: number, range: number): Candle[] {
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
