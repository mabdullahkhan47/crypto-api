const Coin = require("../models/coinModel");
const PriceSnapshot = require("../models/priceSnapshotModel");
const { getLiveTickersBySymbols } = require("./priceService");
const {
  calculatePercentChange,
  normalizeSymbol,
  round,
  safeNumber,
  toBinancePair,
  isoDateMinutesAgo,
} = require("../utils/helpers");

async function getHistoricalPriceMap(symbols, minutesAgo) {
  const boundary = isoDateMinutesAgo(minutesAgo);

  const rows = await PriceSnapshot.aggregate([
    {
      $match: {
        symbol: { $in: symbols },
        timestamp: { $lte: boundary },
      },
    },
    {
      $sort: {
        symbol: 1,
        timestamp: -1,
      },
    },
    {
      $group: {
        _id: "$symbol",
        price: { $first: "$price" },
      },
    },
  ]);

  const result = new Map();

  for (const row of rows) {
    result.set(normalizeSymbol(row._id), safeNumber(row.price));
  }

  return result;
}

async function buildComputedCoins() {
  const coins = await Coin.find(
    {},
    {
      _id: 0,
      name: 1,
      symbol: 1,
      binance_pair: 1,
      logo: 1,
      circulating_supply: 1,
      total_supply: 1,
      source_rank: 1,
      source_market_cap: 1,
      source_price: 1,
      source_volume_24h: 1,
      source_change_1h: 1,
      source_change_24h: 1,
      source_change_7d: 1,
    }
  ).lean();

  if (coins.length === 0) {
    return [];
  }

  const symbols = coins.map((coin) => normalizeSymbol(coin.symbol));
  const pairs = coins.map((coin) => normalizeSymbol(coin.binance_pair) || toBinancePair(coin.symbol));

  const [liveTickerMap, history1h, history24h, history7d, history30d, history1y] = await Promise.all([
    getLiveTickersBySymbols(pairs),
    getHistoricalPriceMap(symbols, 60),
    getHistoricalPriceMap(symbols, 60 * 24),
    getHistoricalPriceMap(symbols, 60 * 24 * 7),
    getHistoricalPriceMap(symbols, 60 * 24 * 30),
    getHistoricalPriceMap(symbols, 60 * 24 * 365),
  ]);

  const computed = [];

  for (let idx = 0; idx < coins.length; idx += 1) {
    const coin = coins[idx];
    const symbol = normalizeSymbol(coin.symbol);
    const pair = pairs[idx];
    const ticker = liveTickerMap.get(pair);

    const livePrice = safeNumber(ticker?.price, null);
    const liveVolume = safeNumber(ticker?.volume, null);
    const price = livePrice > 0 ? livePrice : safeNumber(coin.source_price);
    const volume = liveVolume > 0 ? liveVolume : safeNumber(coin.source_volume_24h);
    const circulatingSupply = safeNumber(coin.circulating_supply);
    const computedMarketCap = round(price * circulatingSupply, 2);
    const marketCap = computedMarketCap > 0 ? computedMarketCap : round(safeNumber(coin.source_market_cap), 2);

    const computedChange1h = calculatePercentChange(price, history1h.get(symbol));
    const computedChange24h = calculatePercentChange(price, history24h.get(symbol));
    const computedChange7d = calculatePercentChange(price, history7d.get(symbol));
    const computedChange30d = calculatePercentChange(price, history30d.get(symbol));
    const computedChange1y = calculatePercentChange(price, history1y.get(symbol));

    computed.push({
      name: coin.name,
      symbol,
      pair,
      logo: coin.logo,
      price: round(price, 8),
      change_1h: computedChange1h ?? safeNumber(coin.source_change_1h, null),
      change_24h: computedChange24h ?? safeNumber(coin.source_change_24h, null),
      change_7d: computedChange7d ?? safeNumber(coin.source_change_7d, null),
      change_30d: computedChange30d,
      change_1y: computedChange1y,
      market_cap: marketCap,
      volume: round(volume > 0 ? volume : safeNumber(coin.source_volume_24h), 2),
      source_rank: safeNumber(coin.source_rank, null),
      circulating_supply: circulatingSupply,
      total_supply: safeNumber(coin.total_supply),
      updated_at: new Date().toISOString(),
    });
  }

  computed.sort((a, b) => b.market_cap - a.market_cap);

  for (let i = 0; i < computed.length; i += 1) {
    computed[i].rank = i + 1;
  }

  return computed;
}

module.exports = {
  buildComputedCoins,
};
