require("dotenv").config();

const { connectDB } = require("../config/db");
const Coin = require("../models/coinModel");
const { normalizeSymbol, safeNumber } = require("../utils/helpers");
const { loadCachedMetadata } = require("../utils/metadataUtils");

const BINANCE_TICKER_24H_URL = "https://api.binance.com/api/v3/ticker/24hr";

const QUOTE_PRIORITY = ["USDT", "FDUSD", "USDC", "BUSD", "TUSD", "USDP", "DAI"];
const KNOWN_BINANCE_QUOTES = [
  ...QUOTE_PRIORITY,
  "BTC",
  "ETH",
  "BNB",
  "TRY",
  "EUR",
  "BRL",
  "GBP",
  "AUD",
  "RUB",
  "KRW",
  "JPY",
  "IDR",
  "INR",
  "ZAR",
  "PLN",
  "NGN",
  "MXN",
  "ARS",
  "UAH",
  "COP",
  "PHP",
  "THB",
  "VND",
  "BIDR",
  "BKRW",
  "CHF",
  "RON",
  "CZK",
  "AED",
  "SEK",
  "NOK",
  "DKK",
  "HUF",
  "CAD",
  "NZD",
  "XAF",
  "XOF",
  "XPF",
].filter((value, index, array) => array.indexOf(value) === index).sort((left, right) => right.length - left.length);

const requestedLimit = Number(process.env.COIN_SEED_LIMIT || 1000);
const COIN_SEED_LIMIT = Number.isFinite(requestedLimit) && requestedLimit > 0 ? requestedLimit : 1000;

const demoCoins = [
  {
    name: "Bitcoin",
    symbol: "BTC",
    logo: "https://placehold.co/64x64?text=BTC",
    circulating_supply: 19750000,
    total_supply: 21000000,
  },
  {
    name: "Ethereum",
    symbol: "ETH",
    logo: "https://placehold.co/64x64?text=ETH",
    circulating_supply: 120500000,
    total_supply: 120500000,
  },
  {
    name: "BNB",
    symbol: "BNB",
    logo: "https://placehold.co/64x64?text=BNB",
    circulating_supply: 149000000,
    total_supply: 200000000,
  },
  {
    name: "Solana",
    symbol: "SOL",
    logo: "https://placehold.co/64x64?text=SOL",
    circulating_supply: 460000000,
    total_supply: 585000000,
  },
  {
    name: "XRP",
    symbol: "XRP",
    logo: "https://placehold.co/64x64?text=XRP",
    circulating_supply: 55000000000,
    total_supply: 100000000000,
  },
  {
    name: "Cardano",
    symbol: "ADA",
    logo: "https://placehold.co/64x64?text=ADA",
    circulating_supply: 36000000000,
    total_supply: 45000000000,
  },
  {
    name: "Dogecoin",
    symbol: "DOGE",
    logo: "https://placehold.co/64x64?text=DOGE",
    circulating_supply: 145000000000,
    total_supply: 145000000000,
  },
];

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}



async function fetchJsonWithRetry(url, options = {}, maxAttempts = 5) {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const response = await fetch(url, options);

    if (response.ok) {
      return response.json();
    }

    const retryable = response.status === 429 || response.status >= 500;

    if (!retryable || attempt === maxAttempts) {
      throw new Error(`${url} failed with status ${response.status}`);
    }

    const retryAfterHeader = response.headers.get("retry-after");
    const retryAfterSeconds = Number(retryAfterHeader);
    const backoffMs = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
      ? retryAfterSeconds * 1000
      : Math.min(1500 * 2 ** (attempt - 1), 30000);

    console.warn(`[Seed] ${url} throttled/status=${response.status}; retrying in ${backoffMs}ms`);
    await sleep(backoffMs);
  }

  return null;
}

function quotePriorityIndex(quoteAsset) {
  const idx = QUOTE_PRIORITY.indexOf(String(quoteAsset || "").toUpperCase());
  return idx >= 0 ? idx : Number.MAX_SAFE_INTEGER;
}

function splitBinanceSymbol(symbol) {
  const normalized = normalizeSymbol(symbol);

  for (const quoteAsset of KNOWN_BINANCE_QUOTES) {
    if (normalized.length > quoteAsset.length && normalized.endsWith(quoteAsset)) {
      return {
        baseAsset: normalized.slice(0, -quoteAsset.length),
        quoteAsset,
      };
    }
  }

  return {
    baseAsset: null,
    quoteAsset: null,
  };
}

async function fetchBinanceTickerRows() {
  const rows = await fetchJsonWithRetry(BINANCE_TICKER_24H_URL);
  return Array.isArray(rows) ? rows : [];
}

function buildBinancePairMap(rows) {
  const pairByBase = new Map();

  for (const item of rows) {
    const pairSymbol = normalizeSymbol(item?.symbol);
    const { baseAsset, quoteAsset } = splitBinanceSymbol(pairSymbol);

    if (!pairSymbol || !baseAsset || !quoteAsset) {
      continue;
    }

    const existing = pairByBase.get(baseAsset);

    if (
      !existing ||
      quotePriorityIndex(quoteAsset) < quotePriorityIndex(existing.quoteAsset) ||
      (quotePriorityIndex(quoteAsset) === quotePriorityIndex(existing.quoteAsset) && pairSymbol < existing.pairSymbol)
    ) {
      pairByBase.set(baseAsset, {
        pairSymbol,
        quoteAsset,
        baseAsset,
      });
    }
  }

  return pairByBase;
}

function buildBinanceTickerMap(rows) {
  const result = new Map();

  for (const row of rows) {
    const pairSymbol = String(row?.symbol || "").toUpperCase();
    if (!pairSymbol) {
      continue;
    }

    result.set(pairSymbol, {
      volumeQuote: safeNumber(row?.quoteVolume),
      priceChangePercent: safeNumber(row?.priceChangePercent, null),
      lastPrice: safeNumber(row?.lastPrice),
    });
  }

  return result;
}



async function buildRealCoins() {
  // Fetch Binance data and load cached metadata (no CoinPaprika API call)
  const [binanceTickerRows, metadataMap] = await Promise.all([
    fetchBinanceTickerRows(),
    Promise.resolve(loadCachedMetadata()),
  ]);

  const binancePairMap = buildBinancePairMap(binanceTickerRows);
  const binanceTickerMap = buildBinanceTickerMap(binanceTickerRows);

  if (binancePairMap.size === 0) {
    return [];
  }

  const merged = [];

  for (const [symbol, pairInfo] of binancePairMap.entries()) {
    const metadata = metadataMap.get(symbol);
    const ticker = binanceTickerMap.get(pairInfo.pairSymbol);

    if (metadata) {
      // Merge cached metadata with live Binance ticker data
      merged.push({
        name: metadata.name,
        symbol,
        binance_pair: pairInfo.pairSymbol,
        quote_asset: pairInfo.quoteAsset,
        logo: metadata.logo,
        circulating_supply: safeNumber(metadata.circulating_supply),
        total_supply: safeNumber(metadata.total_supply),
        source_rank: safeNumber(metadata.rank, null),
        source_market_cap: 0, // Will be computed from price * supply
        source_price: safeNumber(ticker?.lastPrice),
        source_volume_24h: safeNumber(ticker?.volumeQuote),
        source_change_1h: null,
        source_change_24h: safeNumber(ticker?.priceChangePercent, null),
        source_change_7d: null,
      });
      continue;
    }

    // Fallback: Binance-only asset when cached metadata unavailable
    merged.push({
      name: symbol,
      symbol,
      binance_pair: pairInfo.pairSymbol,
      quote_asset: pairInfo.quoteAsset,
      logo: `https://placehold.co/64x64?text=${encodeURIComponent(symbol)}`,
      circulating_supply: 0,
      total_supply: 0,
      source_rank: null,
      source_market_cap: 0,
      source_price: safeNumber(ticker?.lastPrice),
      source_volume_24h: safeNumber(ticker?.volumeQuote),
      source_change_1h: null,
      source_change_24h: safeNumber(ticker?.priceChangePercent, null),
      source_change_7d: null,
    });
  }

  merged.sort((a, b) => {
    const rankA = safeNumber(a.source_rank, Number.MAX_SAFE_INTEGER);
    const rankB = safeNumber(b.source_rank, Number.MAX_SAFE_INTEGER);

    if (rankA !== rankB) {
      return rankA - rankB;
    }

    return safeNumber(b.source_volume_24h) - safeNumber(a.source_volume_24h);
  });

  if (merged.length <= COIN_SEED_LIMIT) {
    return merged;
  }

  return merged.slice(0, COIN_SEED_LIMIT);
}

async function upsertCoins(coins) {
  if (!Array.isArray(coins) || coins.length === 0) {
    return [];
  }

  const ops = coins.map((coin) => ({
    updateOne: {
      filter: { symbol: coin.symbol },
      update: { $set: coin },
      upsert: true,
    },
  }));

  return Coin.bulkWrite(ops, { ordered: false });
}

async function run() {
  await connectDB();

  const useDemo = process.argv.includes("--demo");
  const coins = useDemo ? demoCoins : await buildRealCoins();

  if (!useDemo && coins.length === 0) {
    throw new Error("No coins selected from Binance. Check outbound network access and metadata cache at src/data/coinMetadata.json. Run `npm run update-metadata` to refresh cache.");
  }

  const result = await upsertCoins(coins);

  console.log("[Seed] Complete", {
    mode: useDemo ? "demo" : "real",
    requested_limit: useDemo ? demoCoins.length : COIN_SEED_LIMIT,
    available_binance_assets: useDemo ? demoCoins.length : coins.length,
    inserted_or_updated: coins.length,
    upserted: result.upsertedCount,
    modified: result.modifiedCount,
    matched: result.matchedCount,
  });

  process.exit(0);
}

run().catch((error) => {
  console.error("Seed failed:", error.message);
  process.exit(1);
});
