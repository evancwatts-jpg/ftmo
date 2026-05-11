import type { BotConfig } from "../config/botConfig";
import type { AuditLogger } from "../core/logger";
import type { AccountManager } from "../account/accountManager";
import type { BrokerOrder } from "./mt5Executor";
import type { CommandController } from "../core/commandController";
import type { DirectionValidator } from "../risk/directionValidator";
import type { OrderSide, TradeDirection } from "../strategy/strategyTypes";
import type { TradeProjection } from "../analytics/tradeProjection";

export interface OrderRequest extends BrokerOrder {
  setupDirection: TradeDirection;
  orderSide: OrderSide;
  entry: number;
  stopLoss: number;
  stopLossPips: number;
  tp1: number;
  tp2: number;
  rr?: number;
  rrToTp2?: number;
  lotSize: number;
  dollarRisk: number;
  riskPercent?: number;
  manualOverrideUsed?: boolean;
  tradeReason?: string;
  projection?: TradeProjection;
}

export class ExecutionEngine {
  config: BotConfig;
  commandController: CommandController;
  broker: { placeOrder(order: OrderRequest): Promise<unknown> };
  directionValidator: DirectionValidator;
  accountManager: AccountManager;
  logger: AuditLogger;

  constructor({ config, commandController, broker, directionValidator, accountManager, logger }: {
    config: BotConfig;
    commandController: CommandController;
    broker: { placeOrder(order: OrderRequest): Promise<unknown> };
    directionValidator: DirectionValidator;
    accountManager: AccountManager;
    logger: AuditLogger;
  }) {
    this.config = config;
    this.commandController = commandController;
    this.broker = broker;
    this.directionValidator = directionValidator;
    this.accountManager = accountManager;
    this.logger = logger;
  }

  async placeOrder(order: OrderRequest, reason = "strategy setup"): Promise<Record<string, unknown>> {
    if (!this.commandController.canExecuteBrokerAction("place order", reason)) {
      return { executed: false, blocked: true, reason: "broker action guard blocked order" };
    }

    if (!(await this.accountManager.verifyActiveAccount())) {
      return { executed: false, blocked: true, reason: "active account verification failed" };
    }

    const validation = this.directionValidator.validate({
      setupDirection: order.setupDirection,
      orderSide: order.orderSide,
      entry: order.entry,
      stopLoss: order.stopLoss,
      tp1: order.tp1,
      tp2: order.tp2
    });

    if (!validation.valid) {
      this.logger.rejectedOrder({
        setupDirection: order.setupDirection,
        orderSide: order.orderSide,
        entry: order.entry,
        stopLoss: order.stopLoss,
        tp1: order.tp1,
        tp2: order.tp2,
        rr: order.rrToTp2 || order.rr,
        rejectionReason: validation.reason
      });
      return { executed: false, blocked: true, validation };
    }

    const brokerResult = await this.broker.placeOrder(order);
    this.logger.executedOrder({
      accountSize: this.config.accountSize,
      riskPercent: this.config.riskPercent,
      lotSize: order.lotSize,
      manualOverrideUsed: Boolean(order.manualOverrideUsed),
      direction: order.setupDirection,
      orderSide: order.orderSide,
      setupType: order.projection?.setupType,
      entry: order.entry,
      sl: order.stopLoss,
      slPips: order.stopLossPips,
      tp1: order.tp1,
      tp2: order.tp2,
      rr: order.rrToTp2 || order.rr,
      tradeReason: order.tradeReason,
      projection: order.projection,
      validationResult: validation.reason
    });

    return { executed: true, brokerResult, validation };
  }
}
