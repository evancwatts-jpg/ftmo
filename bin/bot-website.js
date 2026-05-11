#!/usr/bin/env node
"use strict";

const {
  AuditLogger,
  BotWebServer,
  NewFtmoTradingBot,
  createBrokerFromEnv,
  loadConfigFromEnv,
  parseNumber
} = require("../dist/server/bot");

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
  const webServer = new BotWebServer({
    bot,
    logger,
    host: process.env.FTMO_WEB_HOST || "0.0.0.0",
    port: parseNumber(process.env.FTMO_WEB_PORT, 3000)
  });

  const shutdown = async (signal) => {
    bot.stop(signal);
    await webServer.stop().catch(() => null);
    process.exit(0);
  };

  process.on("SIGINT", () => {
    shutdown("SIGINT");
  });
  process.on("SIGTERM", () => {
    shutdown("SIGTERM");
  });

  const result = await webServer.start();
  const address = result.address;
  process.stdout.write(`Bot website running on http://${address.address}:${address.port}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exit(1);
});
