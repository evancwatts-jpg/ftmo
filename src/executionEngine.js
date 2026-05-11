"use strict";

class ExecutionEngine {
  constructor({ config, commandController, broker, directionValidator, accountManager, logger }) {
    this.config = config;
    this.commandController = commandController;
    this.broker = broker;
    this.directionValidator = directionValidator;
    this.accountManager = accountManager;
    this.logger = logger;
  }

  async placeOrder(order, reason = "strategy setup") {
    if (!this.commandController.canExecuteBrokerAction("place order", reason)) {
      return { executed: false, blocked: true, reason: "broker action guard blocked order" };
    }

    if (this.accountManager && !(await this.accountManager.verifyActiveAccount())) {
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
        reasonBlocked: validation.reason
      });
      return { executed: false, blocked: true, validation };
    }

    const brokerResult = await this.broker.placeOrder(order);
    this.logger.executedOrder({
      direction: order.setupDirection,
      orderSide: order.orderSide,
      entry: order.entry,
      sl: order.stopLoss,
      slPips: order.stopLossPips,
      tp1: order.tp1,
      tp2: order.tp2,
      rr: order.rr,
      lotSize: order.lotSize,
      accountSize: this.config.accountSize,
      riskDollars: order.dollarRisk,
      validationResult: validation.reason
    });

    return { executed: true, brokerResult, validation };
  }
}

module.exports = {
  ExecutionEngine
};
