const { WebSocketServer } = require('ws');
const { getComputedCoins, onComputedUpdate } = require('../services/priceService');

function setupLiveServer(server) {
  const wss = new WebSocketServer({ server });

  function buildPayload() {
    return JSON.stringify({
      type: 'tickers',
      tickers: getComputedCoinsSync(),
    });
  }

  // helper to get current computed coins synchronously from memory when Redis not ready
  function getComputedCoinsSync() {
    // getComputedCoins returns a promise; but priceService keeps memoryComputedCoinList we can't access here.
    // Instead, call getComputedCoins() synchronously is not possible; so we'll rely on async fetch in push
    return [];
  }

  // Send initial snapshot when a client connects
  wss.on('connection', async (ws) => {
    try {
      const list = await getComputedCoins();
      if (Array.isArray(list) && list.length > 0) {
        ws.send(JSON.stringify({ type: 'tickers', tickers: list }));
      }
    } catch (err) {
      // ignore
    }
  });

  // Push to all clients when computed list updates
  onComputedUpdate(async (list) => {
    const payload = JSON.stringify({ type: 'tickers', tickers: list });
    for (const client of wss.clients) {
      if (client.readyState === 1) client.send(payload);
    }
  });
}

module.exports = { setupLiveServer };
