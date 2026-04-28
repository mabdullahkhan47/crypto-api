const { getRedisClient, isRedisReady } = require("../config/redis");
const { normalizeSymbol } = require("../utils/helpers");

const LIVE_TICKER_KEY = "crypto:live:tickers";
const COMPUTED_COIN_HASH_KEY = "crypto:computed:coin";
const COMPUTED_COIN_LIST_KEY = "crypto:computed:list";

const memoryLiveTickers = new Map();
const memoryComputedCoinMap = new Map();
let memoryComputedCoinList = [];
const EventEmitter = require('events');
const computedEmitter = new EventEmitter();

function safeJsonParse(rawValue) {
  if (!rawValue) {
    return null;
  }

  try {
    return JSON.parse(rawValue);
  } catch (_error) {
    return null;
  }
}

async function setLiveTicker(pairSymbol, payload) {
  const symbol = normalizeSymbol(pairSymbol);

  if (!symbol) {
    return;
  }

  const value = JSON.stringify(payload);

  if (isRedisReady()) {
    await getRedisClient().hSet(LIVE_TICKER_KEY, symbol, value);
    return;
  }

  memoryLiveTickers.set(symbol, payload);
}

async function getLiveTicker(pairSymbol) {
  const symbol = normalizeSymbol(pairSymbol);

  if (!symbol) {
    return null;
  }

  if (isRedisReady()) {
    const value = await getRedisClient().hGet(LIVE_TICKER_KEY, symbol);
    return safeJsonParse(value);
  }

  return memoryLiveTickers.get(symbol) || null;
}

async function getLiveTickersBySymbols(pairSymbols) {
  const normalized = pairSymbols.map(normalizeSymbol).filter(Boolean);

  if (normalized.length === 0) {
    return new Map();
  }

  if (isRedisReady()) {
    const values = await getRedisClient().hmGet(LIVE_TICKER_KEY, normalized);
    const result = new Map();

    for (let i = 0; i < normalized.length; i += 1) {
      const parsed = safeJsonParse(values[i]);
      if (parsed) {
        result.set(normalized[i], parsed);
      }
    }

    return result;
  }

  const result = new Map();

  for (const key of normalized) {
    const payload = memoryLiveTickers.get(key);
    if (payload) {
      result.set(key, payload);
    }
  }

  return result;
}

async function setComputedCoins(coins) {
  const list = Array.isArray(coins) ? coins : [];

  if (isRedisReady()) {
    const redis = getRedisClient();
    const multi = redis.multi();

    multi.set(COMPUTED_COIN_LIST_KEY, JSON.stringify(list), { EX: 300 });

    for (const coin of list) {
      multi.hSet(COMPUTED_COIN_HASH_KEY, normalizeSymbol(coin.symbol), JSON.stringify(coin));
    }

    multi.expire(COMPUTED_COIN_HASH_KEY, 300);
    await multi.exec();
    return;
  }

  memoryComputedCoinList = list;
  memoryComputedCoinMap.clear();

  for (const coin of list) {
    memoryComputedCoinMap.set(normalizeSymbol(coin.symbol), coin);
  }

  // emit update for subscribers (always emit, even when using redis)
  try {
    computedEmitter.emit('updated', list);
  } catch (_e) {}
}

async function getComputedCoins() {
  if (isRedisReady()) {
    const value = await getRedisClient().get(COMPUTED_COIN_LIST_KEY);
    return safeJsonParse(value) || [];
  }

  return memoryComputedCoinList;
}

async function getComputedCoin(symbol) {
  const normalized = normalizeSymbol(symbol);

  if (!normalized) {
    return null;
  }

  if (isRedisReady()) {
    const value = await getRedisClient().hGet(COMPUTED_COIN_HASH_KEY, normalized);
    return safeJsonParse(value);
  }

  return memoryComputedCoinMap.get(normalized) || null;
}

module.exports = {
  setLiveTicker,
  getLiveTicker,
  getLiveTickersBySymbols,
  setComputedCoins,
  getComputedCoins,
  getComputedCoin,
  onComputedUpdate: (fn) => computedEmitter.on('updated', fn),
};
