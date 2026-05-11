"use strict";

const { DIRECTIONS } = require("./directionValidator");

class ProfitExhaustionDetector {
  calculateRMultiple(position, currentPrice) {
    const risk = Math.abs(position.entry - position.stopLoss);
    if (!risk) {
      return 0;
    }

    const favorableMove =
      position.direction === DIRECTIONS.LONG
        ? currentPrice - position.entry
        : position.entry - currentPrice;

    return favorableMove / risk;
  }

  evaluate({ position, market }) {
    const currentPrice = market.currentPrice;
    const rMultiple = this.calculateRMultiple(position, currentPrice);

    if (rMultiple <= 0) {
      return {
        shouldClose: false,
        score: 0,
        rMultiple,
        signals: [],
        reason: "profit exhaustion is inactive on losing trades"
      };
    }

    const signalWeights = {
      approachesMajorOpposingLiquidity: 25,
      momentumWeakens: 15,
      wickRejectsContinuation: 15,
      chochAgainstPosition: 20,
      momentumDivergence: 15,
      volumeOrMomentumDecreases: 10,
      failedNewExtreme: 15,
      sharpRetraceAfterOneR: rMultiple >= 1 ? 20 : 0
    };

    const signals = [];
    let score = 0;
    for (const [signal, weight] of Object.entries(signalWeights)) {
      if (market[signal] && weight > 0) {
        signals.push(signal);
        score += weight;
      }
    }

    score = Math.min(score, 100);
    const tp1Hit = Boolean(position.tp1Hit || rMultiple >= 1);
    let shouldClose = false;
    let reason = "exhaustion score below close threshold";

    if (!tp1Hit && rMultiple >= 0.8 && score >= 85) {
      shouldClose = true;
      reason = "pre-TP1 exhaustion score >= 85 at +0.8R or better";
    } else if (tp1Hit && score >= 65) {
      shouldClose = true;
      reason = "post-TP1 exhaustion score >= 65";
    } else if (tp1Hit && market.reachesMajorOpposingLiquidity) {
      shouldClose = true;
      reason = "price reached major opposing liquidity after TP1";
    } else if (rMultiple >= 1 && market.sharpRetraceAfterOneR && score >= 45) {
      shouldClose = true;
      reason = "profit sharply retraced after +1R";
    }

    return {
      shouldClose,
      score,
      rMultiple,
      signals,
      reason
    };
  }
}

module.exports = {
  ProfitExhaustionDetector
};
