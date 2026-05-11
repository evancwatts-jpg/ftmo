import { ACCOUNT_PRESETS, type BotConfig } from "../config/botConfig";
import type { AuditLogger } from "../core/logger";
import type { BrokerDataAdapter } from "../market/marketData";

export class AccountManager {
  config: BotConfig;
  broker?: BrokerDataAdapter;
  logger: AuditLogger;
  brokerAccountInfo: unknown = null;

  constructor({ config, broker, logger }: { config: BotConfig; broker?: BrokerDataAdapter; logger: AuditLogger }) {
    this.config = config;
    this.broker = broker;
    this.logger = logger;
  }

  getDollarRisk(): number {
    return Number((this.config.accountSize * (this.config.riskPercent / 100)).toFixed(2));
  }

  getMaxAllowedRiskDollars(): number {
    return this.getDollarRisk();
  }

  async reloadBrokerAccountInfo(): Promise<unknown> {
    if (!this.broker) {
      return null;
    }

    this.brokerAccountInfo = await this.broker.getAccountInfo();
    return this.brokerAccountInfo;
  }

  async switchAccount({ accountSize, activeAccountId }: {
    accountSize: BotConfig["accountSize"];
    activeAccountId?: string;
  }): Promise<unknown> {
    if (!(ACCOUNT_PRESETS as readonly number[]).includes(accountSize)) {
      throw new Error(`Unsupported account size: ${accountSize}`);
    }

    this.config.accountSize = accountSize;
    if (activeAccountId) {
      this.config.activeAccountId = activeAccountId;
    }

    const accountInfo = await this.reloadBrokerAccountInfo();
    this.logger.log("ACCOUNT", "account_switched", {
      accountSize,
      activeAccountId: this.config.activeAccountId,
      brokerAccountId: getBrokerAccountId(accountInfo)
    });

    return accountInfo;
  }

  async verifyActiveAccount(): Promise<boolean> {
    if (!this.config.activeAccountId) {
      return true;
    }

    const accountInfo = await this.reloadBrokerAccountInfo();
    const brokerAccountId = getBrokerAccountId(accountInfo);
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

function getBrokerAccountId(accountInfo: unknown): string | undefined {
  if (!accountInfo || typeof accountInfo !== "object") {
    return undefined;
  }

  const record = accountInfo as Record<string, unknown>;
  return String(record.id || record.accountId || record.login || "") || undefined;
}
