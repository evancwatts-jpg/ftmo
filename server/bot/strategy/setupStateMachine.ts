import type { AuditLogger } from "../core/logger";

export const SETUP_STATES = Object.freeze({
  WAITING: "WAITING",
  SWEEP_DETECTED: "SWEEP_DETECTED",
  DISPLACEMENT_CONFIRMED: "DISPLACEMENT_CONFIRMED",
  WAITING_FOR_RETRACEMENT: "WAITING_FOR_RETRACEMENT",
  ENTRY_ARMED: "ENTRY_ARMED",
  EXECUTE: "EXECUTE",
  MANAGING: "MANAGING",
  INVALIDATED: "INVALIDATED"
});

export type SetupState = typeof SETUP_STATES[keyof typeof SETUP_STATES];

export class SetupStateMachine {
  state: SetupState = SETUP_STATES.WAITING;
  reason: string | null = null;
  logger: AuditLogger;

  constructor({ logger }: { logger: AuditLogger }) {
    this.logger = logger;
  }

  reset(): void {
    this.state = SETUP_STATES.WAITING;
    this.reason = null;
  }

  advance(input: {
    hasSweep: boolean;
    hasDisplacement: boolean;
    hasRetracement: boolean;
    hasExecutionConfirmation: boolean;
    invalidated?: boolean;
  }): { accepted: boolean; state: SetupState; reason: string } {
    this.reset();

    if (input.invalidated) {
      return this.invalidate("setup invalidated");
    }

    if (!input.hasSweep) {
      return this.wait("no sweep, no trade");
    }
    this.state = SETUP_STATES.SWEEP_DETECTED;

    if (!input.hasDisplacement) {
      return this.wait("no displacement, no trade");
    }
    this.state = SETUP_STATES.DISPLACEMENT_CONFIRMED;

    if (!input.hasRetracement) {
      this.state = SETUP_STATES.WAITING_FOR_RETRACEMENT;
      return this.wait("no retracement, no trade");
    }

    if (!input.hasExecutionConfirmation) {
      this.state = SETUP_STATES.ENTRY_ARMED;
      return this.wait("no 1m execution confirmation, no trade");
    }

    this.state = SETUP_STATES.EXECUTE;
    return { accepted: true, state: this.state, reason: "setup ready to execute" };
  }

  private wait(reason: string): { accepted: false; state: SetupState; reason: string } {
    this.reason = reason;
    this.logger.log("NO_TRADE", "setup_state_machine", { state: this.state, reason });
    return { accepted: false, state: this.state, reason };
  }

  private invalidate(reason: string): { accepted: false; state: SetupState; reason: string } {
    this.state = SETUP_STATES.INVALIDATED;
    this.reason = reason;
    this.logger.log("NO_TRADE", "setup_state_machine", { state: this.state, reason });
    return { accepted: false, state: this.state, reason };
  }
}
