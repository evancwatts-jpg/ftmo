import type { BotConfig } from "../config/botConfig";

export type TradeDirection = "LONG" | "SHORT";
export type OrderSide = "BUY" | "SELL";
export type PositionType = "POSITION_TYPE_BUY" | "POSITION_TYPE_SELL";
export type SetupType = "SCALP" | "SNIPER";
export type Timeframe = "1m" | "5m" | "15m" | "1h" | "4h";

export interface Candle {
  time?: string | number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface EntryZone {
  low: number;
  high: number;
  source?: "OB" | "FVG" | "DISPLACEMENT_50";
}

export interface StrategySetup {
  valid: boolean;
  model: SetupType;
  direction: TradeDirection;
  sweptLevel: number;
  structuralStop: number;
  entryZone: EntryZone;
  reason: string;
  state?: string;
  execution?: OneMinuteExecutionResult;
  marketShift?: MarketShiftState;
}

export interface OneMinuteExecutionResult {
  passes: boolean;
  reason: string;
  confirmations: {
    rejection: boolean;
    microBos: boolean;
    closeBack: boolean;
  };
}

export interface MarketShiftState {
  regime: "BULL_TREND" | "BEAR_TREND" | "RANGE" | "EXPANSION" | "CHOP" | "REVERSAL_RISK";
  bias: "BULLISH" | "BEARISH" | "NEUTRAL";
  volatility: "LOW" | "NORMAL" | "HIGH" | "EXTREME";
  confidence: number;
  reasons: string[];
}

export interface MarketState {
  symbol: BotConfig["symbol"];
  currentPrice: number;
  bid?: number;
  ask?: number;
  spreadPips?: number;
  sessionLabel?: string;
  inNewsBlackout?: boolean;
  htfBias?: MarketShiftState["bias"];
  dailyPnlState?: {
    blockTrading?: boolean;
    mustClose?: boolean;
  };
  cooldownActive?: boolean;
  opposingLiquidityPrice?: number;
  approachesMajorOpposingLiquidity?: boolean;
  reachesMajorOpposingLiquidity?: boolean;
  momentumWeakens?: boolean;
  wickRejectsContinuation?: boolean;
  chochAgainstPosition?: boolean;
  momentumDivergence?: boolean;
  volumeOrMomentumDecreases?: boolean;
  failedNewExtreme?: boolean;
  sharpRetraceAfterOneR?: boolean;
  marketShift?: MarketShiftState;
}

export interface NoTradeLogDetails {
  state: string;
  currentPrice?: number;
  spread?: number;
  mode: string;
  direction?: TradeDirection | null;
  reason: string;
  entryZone?: EntryZone | null;
  htfContext?: unknown;
  marketShift?: MarketShiftState;
  rr?: number;
  model?: SetupType;
}

export const DIRECTIONS = Object.freeze({
  LONG: "LONG" as TradeDirection,
  SHORT: "SHORT" as TradeDirection
});

export const ORDER_SIDES = Object.freeze({
  BUY: "BUY" as OrderSide,
  SELL: "SELL" as OrderSide
});

export const POSITION_TYPES = Object.freeze({
  POSITION_TYPE_BUY: "POSITION_TYPE_BUY" as PositionType,
  POSITION_TYPE_SELL: "POSITION_TYPE_SELL" as PositionType
});
