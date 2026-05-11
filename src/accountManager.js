"use strict";

const { ACCOUNT_PRESETS } = require("./config");

class AccountManager {
  constructor({ config, broker, logger }) {
    this.config = config;
    this.broker = broker;
    this.logger = logger;
    this.dailyStats = {};
    this.haltState = null;
    this.trackedPositions = new Map();
    this.pnlReferenceData = null;
    this.brokerAccountInfo = null;
  }

  getDollarRisk() {
    return this.config.accountSize * (this.config.riskPercent / 100);
  }

  clearTransientState() {
    this.dailyStats = {};
    this.haltState = null;
    this.trackedPositions.clear();
    this.pnlReferenceData = null;
  }

  async reloadBrokerAccountInfo() {
    if (!this.broker || typeof this.broker.getAccountInfo !== "function") {
      return null;
    }

    this.brokerAccountInfo = await this.broker.getAccountInfo();
    return this.brokerAccountInfo;
  }

  async switchAccount({ accountSize, activeAccountId } = {}) {
    if (!ACCOUNT_PRESETS.includes(accountSize)) {
      throw new Error(`Unsupported account size: ${accountSize}`);
    }

    this.config.accountSize = accountSize;
    if (activeAccountId) {
      this.config.activeAccountId = activeAccountId;
    }

    this.clearTransientState();
    const accountInfo = await this.reloadBrokerAccountInfo();
    this.logger.log("ACCOUNT", "account_switched", {
      accountSize,
      activeAccountId: this.config.activeAccountId,
      brokerAccountId: accountInfo && (accountInfo.id || accountInfo.accountId || accountInfo.login)
    });

    return accountInfo;
  }

  async verifyActiveAccount() {
    if (!this.config.activeAccountId) {
      return true;
    }

    const accountInfo = await this.reloadBrokerAccountInfo();
    const brokerAccountId = accountInfo && (accountInfo.id || accountInfo.accountId || accountInfo.login);
    const verified = brokerAccountId === this.config.activeAccountId;

    if (!verified) {
      this.logger.log("BLOCKED", "active_account_verification", {
        expectedAccountId: this.config.activeAccountId,
        brokerAccountId,
        reason: "active account ID mismatch"
      });
    }

    return verified;
  }
}

module.exports = {
  AccountManager
};
