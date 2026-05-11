import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { URL } from "node:url";
import { MODES, type BotConfig } from "../config/botConfig";
import type { AuditLogger } from "./logger";
import type { NewFtmoTradingBot } from "./botRunner";

const CONTENT_TYPES: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

export class BotWebServer {
  bot: NewFtmoTradingBot;
  logger: AuditLogger;
  host: string;
  port: number;
  publicDir: string;
  server: http.Server;

  constructor({ bot, logger, host = "0.0.0.0", port = 3000, publicDir = path.join(__dirname, "../../../../public") }: {
    bot: NewFtmoTradingBot;
    logger?: AuditLogger;
    host?: string;
    port?: number;
    publicDir?: string;
  }) {
    if (!bot) {
      throw new Error("BotWebServer requires a bot instance");
    }

    this.bot = bot;
    this.logger = logger || bot.logger;
    this.host = host;
    this.port = port;
    this.publicDir = publicDir;
    this.server = http.createServer(this.handleRequest.bind(this));
  }

  start(): Promise<Record<string, any>> {
    if (this.isRunning()) {
      return Promise.resolve({ started: false, reason: "web server is already running" });
    }

    return new Promise((resolve, reject) => {
      const onError = (error: Error) => {
        this.server.off("listening", onListening);
        reject(error);
      };
      const onListening = () => {
        this.server.off("error", onError);
        const address = this.server.address();
        this.logger.log("STARTED", "web_server_start", { host: this.host, port: typeof address === "object" && address ? address.port : undefined });
        resolve({ started: true, address });
      };

      this.server.once("error", onError);
      this.server.once("listening", onListening);
      this.server.listen(this.port, this.host);
    });
  }

  stop(): Promise<Record<string, unknown>> {
    if (!this.isRunning()) {
      return Promise.resolve({ stopped: false, reason: "web server is not running" });
    }

    return new Promise((resolve, reject) => {
      this.server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        this.logger.log("STOPPED", "web_server_stop", { host: this.host, port: this.port });
        resolve({ stopped: true });
      });
    });
  }

  isRunning(): boolean {
    return this.server.listening;
  }

  async handleRequest(request: http.IncomingMessage, response: http.ServerResponse): Promise<void> {
    try {
      const requestUrl = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);

      if (requestUrl.pathname.startsWith("/api/")) {
        await this.handleApiRequest(request, response, requestUrl);
        return;
      }

      await this.serveStatic(requestUrl.pathname, response);
    } catch (error) {
      const err = error as Error;
      this.logger.log("ERROR", "web_request", { message: err.message, stack: err.stack });
      sendJson(response, 500, { error: "internal server error", message: err.message });
    }
  }

  async handleApiRequest(request: http.IncomingMessage, response: http.ServerResponse, requestUrl: URL): Promise<void> {
    if (request.method === "GET" && requestUrl.pathname === "/api/status") {
      sendJson(response, 200, await this.bot.getDashboardSnapshot());
      return;
    }

    if (request.method === "GET" && requestUrl.pathname === "/api/config") {
      sendJson(response, 200, safeConfig(this.bot.config));
      return;
    }

    if (request.method === "POST" && requestUrl.pathname === "/api/mode") {
      const body = await readJsonBody(request);
      const mode = body.mode;
      if (!Object.values(MODES).includes(mode)) {
        sendJson(response, 400, { error: `Invalid mode: ${mode}` });
        return;
      }

      sendJson(response, 200, this.bot.setMode(mode, "mode changed from dashboard"));
      return;
    }

    if (request.method === "POST" && requestUrl.pathname === "/api/start") {
      sendJson(response, 200, await this.bot.start({ runImmediately: false }));
      return;
    }

    if (request.method === "POST" && requestUrl.pathname === "/api/stop") {
      sendJson(response, 200, this.bot.stop("dashboard manual stop"));
      return;
    }

    if (request.method === "POST" && requestUrl.pathname === "/api/tick") {
      if (this.bot.config.mode === MODES.LIVE && request.headers["x-confirm-live-action"] !== "true") {
        sendJson(response, 409, { error: "LIVE manual scan requires x-confirm-live-action: true" });
        return;
      }

      sendJson(response, 200, await this.bot.tick());
      return;
    }

    sendJson(response, 404, { error: "not found" });
  }

  async serveStatic(pathname: string, response: http.ServerResponse): Promise<void> {
    const normalizedPath = pathname === "/" ? "/index.html" : pathname;
    const resolvedPath = path.resolve(this.publicDir, `.${normalizedPath}`);
    const publicRoot = path.resolve(this.publicDir);

    if (!resolvedPath.startsWith(publicRoot)) {
      sendText(response, 403, "Forbidden");
      return;
    }

    try {
      const data = await fs.readFile(resolvedPath);
      const ext = path.extname(resolvedPath);
      response.writeHead(200, {
        "content-type": CONTENT_TYPES[ext] || "application/octet-stream",
        "cache-control": "no-store"
      });
      response.end(data);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        sendText(response, 404, "Not found");
        return;
      }

      throw error;
    }
  }
}

export function safeConfig(config: BotConfig): Partial<BotConfig> {
  return {
    mode: config.mode,
    symbol: config.symbol,
    accountSize: config.accountSize,
    riskPercent: config.riskPercent,
    manualLotOverrideEnabled: config.manualLotOverrideEnabled,
    manualLotSize: config.manualLotSize,
    strategyMode: config.strategyMode,
    trade24Five: config.trade24Five,
    sessionAdjustedRules: config.sessionAdjustedRules,
    strictHTFBias: config.strictHTFBias,
    enableDailyPnLBlocks: config.enableDailyPnLBlocks,
    enableCooldown: config.enableCooldown,
    enableStructureExit: config.enableStructureExit,
    enableOneMinuteExecution: config.enableOneMinuteExecution,
    enableProfitExhaustionExit: config.enableProfitExhaustionExit,
    maxOpenPositions: config.maxOpenPositions,
    spreadMaxPips: config.spreadMaxPips,
    newsBlackoutMinutes: config.newsBlackoutMinutes,
    maxStopLossPips: config.maxStopLossPips,
    minStopLossPips: config.minStopLossPips,
    scalpMinRR: config.scalpMinRR,
    sniperMinRR: config.sniperMinRR,
    monteCarloEnabled: config.monteCarloEnabled
  };
}

function readJsonBody(request: http.IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        request.destroy(new Error("request body too large"));
      }
    });
    request.on("end", () => {
      if (!body) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });
    request.on("error", reject);
  });
}

function sendJson(response: http.ServerResponse, statusCode: number, payload: unknown): void {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  response.end(JSON.stringify(payload));
}

function sendText(response: http.ServerResponse, statusCode: number, text: string): void {
  response.writeHead(statusCode, {
    "content-type": "text/plain; charset=utf-8",
    "cache-control": "no-store"
  });
  response.end(text);
}
