import type { MarketState } from "../strategy/strategyTypes";
import type { MarketDataEngine } from "./marketData";

export function buildMarketState(params: {
  symbol?: "EURUSD";
  price: Record<string, number>;
  marketDataEngine: MarketDataEngine;
  now?: Date;
}): MarketState {
  const symbol = params.symbol || "EURUSD";
  const bid = Number(params.price.bid);
  const ask = Number(params.price.ask);
  const currentPrice = Number.isFinite(bid) && Number.isFinite(ask)
    ? Number(((bid + ask) / 2).toFixed(5))
    : Number(params.price.price || params.price.close);

  return {
    symbol,
    currentPrice,
    bid,
    ask,
    spreadPips: Number.isFinite(bid) && Number.isFinite(ask)
      ? params.marketDataEngine.calculateSpreadPips({ bid, ask })
      : undefined,
    sessionLabel: getSessionLabel(params.now || new Date()),
    inNewsBlackout: false
  };
}

export function getSessionLabel(date: Date): string {
  const day = date.getUTCDay();
  if (day === 0 || day === 6) {
    return "OFF_HOURS";
  }

  return "REGULAR";
}
