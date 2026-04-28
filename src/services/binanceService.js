const WebSocket = require("ws");
const { safeNumber } = require("../utils/helpers");
const { setLiveTicker } = require("./priceService");

const BINANCE_WS_URL = "wss://stream.binance.com:9443/ws/!ticker@arr";
const BINANCE_TICKER_REST_URL = "https://api.binance.com/api/v3/ticker/24hr";
const NO_MESSAGE_THRESHOLD_MS = 30000;
const FALLBACK_POLL_MS = 60000;

let socket = null;
let reconnectAttempts = 0;
let reconnectTimer = null;
let manuallyStopped = false;
let lastMessageTs = 0;
let fallbackTimer = null;

async function hydrateFromRest(reason) {
  try {
    const response = await fetch(BINANCE_TICKER_REST_URL);

    if (!response.ok) {
      throw new Error(`REST status ${response.status}`);
    }

    const payload = await response.json();

    if (!Array.isArray(payload)) {
      throw new Error("REST payload is not an array");
    }

    const updates = [];

    for (const ticker of payload) {
      const symbol = String(ticker?.symbol || "").toUpperCase();

      if (!symbol) {
        continue;
      }

      updates.push(
        setLiveTicker(symbol, {
          symbol,
          price: safeNumber(ticker.lastPrice),
          volume: safeNumber(ticker.quoteVolume),
          lastUpdate: new Date().toISOString(),
          source: "rest-fallback",
        })
      );
    }

    if (updates.length > 0) {
      await Promise.allSettled(updates);
      console.warn(`[Binance] Fallback REST hydrated ${updates.length} tickers (${reason})`);
    }
  } catch (error) {
    console.error("[Binance] Fallback REST failed:", error.message);
  }
}

async function handleTickerBatch(message) {
  let payload;

  try {
    payload = JSON.parse(message.toString());
  } catch (_error) {
    return;
  }

  if (!Array.isArray(payload)) {
    return;
  }

  lastMessageTs = Date.now();

  const updates = [];

  for (const ticker of payload) {
    const symbol = String(ticker?.s || "").toUpperCase();

    if (!symbol) {
      continue;
    }

    updates.push(
      setLiveTicker(symbol, {
        symbol,
        price: safeNumber(ticker.c),
        volume: safeNumber(ticker.q),
        lastUpdate: new Date().toISOString(),
      })
    );
  }

  if (updates.length > 0) {
    await Promise.allSettled(updates);
  }
}

function scheduleReconnect() {
  if (manuallyStopped || reconnectTimer) {
    return;
  }

  reconnectAttempts += 1;
  const delayMs = Math.min(1000 * 2 ** reconnectAttempts, 30000);

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, delayMs);

  console.warn(`[Binance] Reconnecting in ${delayMs}ms (attempt ${reconnectAttempts})`);
}

function connect() {
  if (manuallyStopped) {
    return;
  }

  socket = new WebSocket(BINANCE_WS_URL);

  socket.on("open", () => {
    reconnectAttempts = 0;
    lastMessageTs = Date.now();
    console.log("[Binance] WebSocket connected");

    // Prime live cache quickly so compute/snapshot jobs are not empty on startup.
    hydrateFromRest("startup");
  });

  socket.on("message", (data) => {
    handleTickerBatch(data).catch((error) => {
      console.error("[Binance] Failed to process ticker batch:", error.message);
    });
  });

  socket.on("error", (error) => {
    console.error("[Binance] WebSocket error:", error.message);
  });

  socket.on("close", () => {
    console.warn("[Binance] WebSocket disconnected");
    scheduleReconnect();
  });
}

function startBinanceService() {
  manuallyStopped = false;

  if (socket && socket.readyState === WebSocket.OPEN) {
    return;
  }

  if (!fallbackTimer) {
    fallbackTimer = setInterval(() => {
      const silenceMs = Date.now() - lastMessageTs;

      if (silenceMs >= NO_MESSAGE_THRESHOLD_MS) {
        hydrateFromRest(`ws-silent-${silenceMs}ms`);
      }
    }, FALLBACK_POLL_MS);
  }

  connect();
}

function stopBinanceService() {
  manuallyStopped = true;

  if (fallbackTimer) {
    clearInterval(fallbackTimer);
    fallbackTimer = null;
  }

  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  if (socket) {
    socket.close();
    socket = null;
  }
}

module.exports = {
  startBinanceService,
  stopBinanceService,
};
