import { DIRECTIONS, ORDER_SIDES, POSITION_TYPES, type OrderSide, type PositionType, type TradeDirection } from "../strategy/strategyTypes";

export interface DirectionValidationInput {
  setupDirection: TradeDirection;
  orderSide: OrderSide;
  entry: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
}

export interface DirectionValidationResult {
  valid: boolean;
  reason: string;
  details?: DirectionValidationInput & { positionType?: PositionType };
}

export function sideForDirection(direction: TradeDirection): OrderSide {
  return direction === DIRECTIONS.LONG ? ORDER_SIDES.BUY : ORDER_SIDES.SELL;
}

export function positionTypeForDirection(direction: TradeDirection): PositionType {
  return direction === DIRECTIONS.LONG ? POSITION_TYPES.POSITION_TYPE_BUY : POSITION_TYPES.POSITION_TYPE_SELL;
}

export class DirectionValidator {
  validate(input: DirectionValidationInput): DirectionValidationResult {
    const expectedSide = sideForDirection(input.setupDirection);

    if (input.orderSide !== expectedSide) {
      return {
        valid: false,
        reason: `order side ${input.orderSide} does not match setup direction ${input.setupDirection}`,
        details: input
      };
    }

    if (input.setupDirection === DIRECTIONS.LONG) {
      if (!(input.stopLoss < input.entry)) {
        return { valid: false, reason: "BUY requires SL below entry", details: input };
      }

      if (!(input.tp1 > input.entry && input.tp2 > input.entry)) {
        return { valid: false, reason: "BUY requires TP1 and TP2 above entry", details: input };
      }
    }

    if (input.setupDirection === DIRECTIONS.SHORT) {
      if (!(input.stopLoss > input.entry)) {
        return { valid: false, reason: "SELL requires SL above entry", details: input };
      }

      if (!(input.tp1 < input.entry && input.tp2 < input.entry)) {
        return { valid: false, reason: "SELL requires TP1 and TP2 below entry", details: input };
      }
    }

    return {
      valid: true,
      reason: "direction, side, SL, and TP agree",
      details: {
        ...input,
        positionType: positionTypeForDirection(input.setupDirection)
      }
    };
  }
}

export { DIRECTIONS, ORDER_SIDES, POSITION_TYPES };
