const cron = require("node-cron");
const Coin = require("../models/coinModel");
const PriceSnapshot = require("../models/priceSnapshotModel");
const { getLiveTickersBySymbols } = require("../services/priceService");
const { normalizeSymbol, safeNumber, toBinancePair } = require("../utils/helpers");

async function runSnapshotNow() {
  const coins = await Coin.find({}, { _id: 0, symbol: 1, binance_pair: 1 }).lean();

  if (coins.length === 0) {
    return;
  }

  const symbols = coins.map((coin) => normalizeSymbol(coin.symbol));
  const pairs = coins.map((coin) => normalizeSymbol(coin.binance_pair) || toBinancePair(coin.symbol));
  const tickers = await getLiveTickersBySymbols(pairs);
  const timestamp = new Date();

  const docs = [];

  for (let i = 0; i < symbols.length; i += 1) {
    const symbol = symbols[i];
    const pair = pairs[i];
    const ticker = tickers.get(pair);

    if (!ticker) {
      continue;
    }

    docs.push({
      symbol,
      price: safeNumber(ticker.price),
      timestamp,
    });
  }

  if (docs.length === 0) {
    return;
  }

  await PriceSnapshot.insertMany(docs, { ordered: false });
  console.log(`[SnapshotJob] Inserted ${docs.length} snapshots`);
}

function startSnapshotJob() {
  cron.schedule("*/5 * * * *", () => {
    runSnapshotNow().catch((error) => {
      console.error("[SnapshotJob] Error:", error.message);
    });
  });

  console.log("[SnapshotJob] Scheduled every 5 minutes");
}

module.exports = {
  runSnapshotNow,
  startSnapshotJob,
};
