import type { Candle } from "../strategy/strategyTypes";

export const DEFAULT_PIP_SIZE = 0.0001;

export function roundPrice(value: number): number {
  return Number(value.toFixed(5));
}

export function pipsBetween(a: number, b: number, pipSize = DEFAULT_PIP_SIZE): number {
  return Math.abs(a - b) / pipSize;
}

export function shiftByPips(price: number, pips: number, direction: "UP" | "DOWN", pipSize = DEFAULT_PIP_SIZE): number {
  const delta = pips * pipSize;
  return roundPrice(direction === "UP" ? price + delta : price - delta);
}

export function candleRange(candle: Candle): number {
  return Math.abs(candle.high - candle.low);
}

export function candleBody(candle: Candle): number {
  return Math.abs(candle.close - candle.open);
}

export function isBullish(candle: Candle): boolean {
  return candle.close > candle.open;
}

export function isBearish(candle: Candle): boolean {
  return candle.close < candle.open;
}

export function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
