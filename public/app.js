"use strict";

const state = {
  refreshTimer: null
};

const elements = {
  balance: document.querySelector("#balance"),
  botMode: document.querySelector("#botMode"),
  botRunning: document.querySelector("#botRunning"),
  commandMessage: document.querySelector("#commandMessage"),
  configGrid: document.querySelector("#configGrid"),
  confirmLive: document.querySelector("#confirmLive"),
  connectionState: document.querySelector("#connectionState"),
  equity: document.querySelector("#equity"),
  logs: document.querySelector("#logs"),
  manualScan: document.querySelector("#manualScan"),
  positionCount: document.querySelector("#positionCount"),
  positionsTable: document.querySelector("#positionsTable"),
  price: document.querySelector("#price"),
  spread: document.querySelector("#spread"),
  startBot: document.querySelector("#startBot"),
  stopBot: document.querySelector("#stopBot"),
  symbol: document.querySelector("#symbol")
};

document.querySelectorAll("[data-mode]").forEach((button) => {
  button.addEventListener("click", () => setMode(button.dataset.mode));
});
elements.startBot.addEventListener("click", () => postCommand("/api/start"));
elements.stopBot.addEventListener("click", () => postCommand("/api/stop"));
elements.manualScan.addEventListener("click", () => manualScan());

refresh();
state.refreshTimer = setInterval(refresh, 5000);

async function refresh() {
  try {
    const [status, config] = await Promise.all([
      apiGet("/api/status"),
      apiGet("/api/config")
    ]);
    renderStatus(status);
    renderConfig(config);
    setConnection("Connected", false);
  } catch (error) {
    setConnection("Disconnected", true);
    setMessage(error.message, true);
  }
}

async function setMode(mode) {
  await postCommand("/api/mode", { mode });
}

async function manualScan() {
  const headers = elements.confirmLive.checked
    ? { "x-confirm-live-action": "true" }
    : {};
  await postCommand("/api/tick", {}, headers);
}

async function postCommand(path, body = {}, headers = {}) {
  try {
    const result = await apiPost(path, body, headers);
    setMessage(result.reason || result.error || "Command accepted", Boolean(result.error));
    await refresh();
  } catch (error) {
    setMessage(error.message, true);
  }
}

async function apiGet(path) {
  const response = await fetch(path, { cache: "no-store" });
  return parseResponse(response);
}

async function apiPost(path, body, headers = {}) {
  const response = await fetch(path, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...headers
    },
    body: JSON.stringify(body || {})
  });
  return parseResponse(response);
}

async function parseResponse(response) {
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "Request failed");
  }

  return data;
}

function renderStatus(status) {
  elements.botMode.textContent = status.mode;
  elements.botRunning.textContent = status.running ? "Running" : "Stopped";
  elements.symbol.textContent = status.symbol;
  elements.balance.textContent = formatMoney(status.accountInfo && status.accountInfo.balance);
  elements.equity.textContent = formatMoney(status.accountInfo && status.accountInfo.equity);
  elements.spread.textContent = status.market && status.market.spreadPips !== undefined
    ? `${status.market.spreadPips} pips`
    : "--";
  elements.price.textContent = status.market && status.market.currentPrice
    ? String(status.market.currentPrice)
    : "--";

  renderPositions(status.positions || []);
  renderLogs(status.recentLogs || []);
}

function renderConfig(config) {
  const visibleKeys = [
    "accountSize",
    "riskPercent",
    "strategyMode",
    "maxOpenPositions",
    "spreadMaxPips",
    "minStopLossPips",
    "maxStopLossPips",
    "scalpMinRR",
    "sniperMinRR",
    "enableDailyPnLBlocks",
    "enableCooldown",
    "sessionAdjustedRules",
    "strictHTFBias",
    "enableStructureExit",
    "enableOneMinuteExecution",
    "enableProfitExhaustionExit"
  ];

  elements.configGrid.innerHTML = visibleKeys.map((key) => `
    <div class="config-item">
      <span>${escapeHtml(labelFor(key))}</span>
      <strong>${escapeHtml(String(config[key]))}</strong>
    </div>
  `).join("");
}

function renderPositions(positions) {
  elements.positionCount.textContent = `${positions.length} position${positions.length === 1 ? "" : "s"}`;

  if (positions.length === 0) {
    elements.positionsTable.innerHTML = "<tr><td colspan=\"6\">No open positions.</td></tr>";
    return;
  }

  elements.positionsTable.innerHTML = positions.map((position) => `
    <tr>
      <td>${escapeHtml(position.id || position.positionId || "--")}</td>
      <td>${escapeHtml(position.symbol || "--")}</td>
      <td>${escapeHtml(position.type || position.positionType || position.side || "--")}</td>
      <td>${escapeHtml(String(position.entry || position.openPrice || position.price || "--"))}</td>
      <td>${escapeHtml(String(position.stopLoss || position.sl || "--"))}</td>
      <td>${escapeHtml(String(position.takeProfit || position.tp || "--"))}</td>
    </tr>
  `).join("");
}

function renderLogs(logs) {
  if (logs.length === 0) {
    elements.logs.textContent = "No audit events yet.";
    return;
  }

  elements.logs.textContent = logs
    .slice()
    .reverse()
    .map((event) => JSON.stringify(event, null, 2))
    .join("\n\n");
}

function setConnection(text, isError) {
  elements.connectionState.textContent = text;
  elements.connectionState.classList.toggle("muted", isError);
}

function setMessage(text, isError = false) {
  elements.commandMessage.textContent = text;
  elements.commandMessage.style.color = isError ? "#ffb3b3" : "#8fa4c0";
}

function formatMoney(value) {
  if (!Number.isFinite(Number(value))) {
    return "--";
  }

  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD"
  }).format(Number(value));
}

function labelFor(key) {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (letter) => letter.toUpperCase());
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
