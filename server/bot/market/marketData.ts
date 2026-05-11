import { DEFAULT_PIP_SIZE } from "./candleUtils";

export interface BrokerDataAdapter {
  getAccountInfo(): Promise<unknown>;
  getPrice(symbol?: string): Promise<Record<string, number>>;
  getCandles(params: { symbol?: string; timeframe: string; limit?: number }): Promise<unknown[]>;
  getOpenPositions(symbol?: string): Promise<unknown[]>;
}

export class MarketDataEngine {
  broker: BrokerDataAdapter;
  symbol: "EURUSD";
  pipSize: number;

  constructor({ broker, symbol = "EURUSD", pipSize = DEFAULT_PIP_SIZE }: {
    broker: BrokerDataAdapter;
    symbol?: "EURUSD";
    pipSize?: number;
  }) {
    this.broker = broker;
    this.symbol = symbol;
    this.pipSize = pipSize;
  }

  getAccountInfo(): Promise<unknown> {
    return this.broker.getAccountInfo();
  }

  getPrice(symbol = this.symbol): Promise<Record<string, number>> {
    return this.broker.getPrice(symbol);
  }

  getCandles(params: { symbol?: string; timeframe: string; limit?: number }): Promise<unknown[]> {
    return this.broker.getCandles({ symbol: params.symbol || this.symbol, timeframe: params.timeframe, limit: params.limit });
  }

  getOpenPositions(symbol = this.symbol): Promise<unknown[]> {
    return this.broker.getOpenPositions(symbol);
  }

  calculateSpreadPips({ bid, ask }: { bid: number; ask: number }): number {
    return Number(((ask - bid) / this.pipSize).toFixed(2));
  }
}
