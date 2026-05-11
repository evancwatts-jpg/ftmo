import type { NoTradeLogDetails } from "../strategy/strategyTypes";

export interface AuditEvent {
  timestamp: string;
  state: string;
  action: string;
  [key: string]: unknown;
}

export class AuditLogger {
  events: AuditEvent[] = [];
  private sink?: (event: AuditEvent) => void;

  constructor({ sink }: { sink?: (event: AuditEvent) => void } = {}) {
    this.sink = sink;
  }

  log(state: string, action: string, details: Record<string, unknown> = {}): AuditEvent {
    const event = {
      timestamp: new Date().toISOString(),
      state,
      action,
      ...details
    };

    this.events.push(event);
    if (this.sink) {
      this.sink(event);
    }

    return event;
  }

  logBlockedAction(details: { action: string; reason: string; blockedBecause: string; mode?: string }): AuditEvent {
    return this.log("BLOCKED", details.action, {
      reason: details.reason,
      blockReason: details.blockedBecause,
      mode: details.mode
    });
  }

  noTrade(details: NoTradeLogDetails): AuditEvent {
    return this.log("NO_TRADE", "setup_scan", details as unknown as Record<string, unknown>);
  }

  rejectedOrder(details: Record<string, unknown>): AuditEvent {
    return this.log("REJECTED", "order_validation", details);
  }

  tradeProjection(details: Record<string, unknown>): AuditEvent {
    return this.log("PROJECTION", "trade_projection", details);
  }

  executedOrder(details: Record<string, unknown>): AuditEvent {
    return this.log("EXECUTED", "order_placed", details);
  }

  profitExit(details: Record<string, unknown>): AuditEvent {
    return this.log("PROFIT_EXIT", "position_closed", details);
  }
}
