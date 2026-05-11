#!/usr/bin/env node
"use strict";

const { AuditLogger } = require("../src/auditLogger");
const { MODES } = require("../src/config");
const { NewFtmoTradingBot } = require("../src/newBot");
const { createBrokerFromEnv, loadConfigFromEnv, parseNumber } = require("../src/runtimeConfig");

async function main() {
  const logger = new AuditLogger({
    sink: (event) => {
      process.stdout.write(`${JSON.stringify(event)}\n`);
    }
  });
  const config = loadConfigFromEnv(process.env);
  const broker = await createBrokerFromEnv(process.env);
  const bot = new NewFtmoTradingBot({
    broker,
    config,
    logger,
    symbol: process.env.FTMO_SYMBOL || "EURUSD",
    scanIntervalMs: parseNumber(process.env.FTMO_SCAN_INTERVAL_MS, 60_000)
  });

  process.on("SIGINT", () => {
    bot.stop("SIGINT");
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    bot.stop("SIGTERM");
    process.exit(0);
  });

  if (config.mode === MODES.OFF) {
    const snapshot = await bot.getDashboardSnapshot();
    process.stdout.write(`${JSON.stringify({ state: "SNAPSHOT", snapshot })}\n`);
    return;
  }

  await bot.start({ runImmediately: true });
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exit(1);
});
