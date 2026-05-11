"use strict";

const DIRECTIONS = Object.freeze({
  LONG: "LONG",
  SHORT: "SHORT"
});

const ORDER_SIDES = Object.freeze({
  BUY: "BUY",
  SELL: "SELL"
});

const POSITION_TYPES = Object.freeze({
  POSITION_TYPE_BUY: "POSITION_TYPE_BUY",
  POSITION_TYPE_SELL: "POSITION_TYPE_SELL"
});

function sideForDirection(direction) {
  if (direction === DIRECTIONS.LONG) {
    return ORDER_SIDES.BUY;
  }

  if (direction === DIRECTIONS.SHORT) {
    return ORDER_SIDES.SELL;
  }

  return null;
}

function positionTypeForDirection(direction) {
  if (direction === DIRECTIONS.LONG) {
    return POSITION_TYPES.POSITION_TYPE_BUY;
  }

  if (direction === DIRECTIONS.SHORT) {
    return POSITION_TYPES.POSITION_TYPE_SELL;
  }

  return null;
}

class DirectionValidator {
  validate({ setupDirection, orderSide, entry, stopLoss, tp1, tp2 }) {
    const details = { setupDirection, orderSide, entry, stopLoss, tp1, tp2 };
    const expectedSide = sideForDirection(setupDirection);

    if (!expectedSide) {
      return { valid: false, reason: "unknown setup direction", details };
    }

    if (orderSide !== expectedSide) {
      return {
        valid: false,
        reason: `order side ${orderSide} does not match setup direction ${setupDirection}`,
        details
      };
    }

    if (setupDirection === DIRECTIONS.LONG) {
      if (!(stopLoss < entry)) {
        return { valid: false, reason: "BUY requires SL below entry", details };
      }

      if (!(tp1 > entry && tp2 > entry)) {
        return { valid: false, reason: "BUY requires TP1 and TP2 above entry", details };
      }
    }

    if (setupDirection === DIRECTIONS.SHORT) {
      if (!(stopLoss > entry)) {
        return { valid: false, reason: "SELL requires SL above entry", details };
      }

      if (!(tp1 < entry && tp2 < entry)) {
        return { valid: false, reason: "SELL requires TP1 and TP2 below entry", details };
      }
    }

    return {
      valid: true,
      reason: "direction, side, SL, and TP agree",
      details: {
        ...details,
        positionType: positionTypeForDirection(setupDirection)
      }
    };
  }
}

module.exports = {
  DIRECTIONS,
  ORDER_SIDES,
  POSITION_TYPES,
  DirectionValidator,
  positionTypeForDirection,
  sideForDirection
};
