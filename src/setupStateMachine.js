"use strict";

const SETUP_STATES = Object.freeze({
  IDLE: "IDLE",
  SWEEP_DETECTED: "SWEEP_DETECTED",
  DISPLACEMENT_CONFIRMED: "DISPLACEMENT_CONFIRMED",
  RETRACEMENT_READY: "RETRACEMENT_READY",
  EXECUTION_CONFIRMED: "EXECUTION_CONFIRMED",
  REJECTED: "REJECTED"
});

class SetupStateMachine {
  constructor({ logger }) {
    this.logger = logger;
    this.state = SETUP_STATES.IDLE;
    this.reason = null;
  }

  reset() {
    this.state = SETUP_STATES.IDLE;
    this.reason = null;
  }

  advance({ hasSweep, hasDisplacement, hasRetracement, hasExecutionConfirmation }) {
    this.reset();

    if (!hasSweep) {
      return this.reject("no sweep, no trade");
    }

    this.state = SETUP_STATES.SWEEP_DETECTED;

    if (!hasDisplacement) {
      return this.reject("no displacement, no trade");
    }

    this.state = SETUP_STATES.DISPLACEMENT_CONFIRMED;

    if (!hasRetracement) {
      return this.reject("no retracement, no trade");
    }

    this.state = SETUP_STATES.RETRACEMENT_READY;

    if (!hasExecutionConfirmation) {
      return this.reject("no 1m execution confirmation, no trade");
    }

    this.state = SETUP_STATES.EXECUTION_CONFIRMED;
    return { accepted: true, state: this.state };
  }

  reject(reason) {
    this.state = SETUP_STATES.REJECTED;
    this.reason = reason;
    this.logger.log("NO_TRADE", "setup_state_machine", { state: this.state, reason });
    return { accepted: false, state: this.state, reason };
  }
}

module.exports = {
  SETUP_STATES,
  SetupStateMachine
};
