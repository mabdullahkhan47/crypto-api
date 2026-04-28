require("dotenv").config();

const { saveCachedMetadata } = require("../utils/metadataUtils");
const { normalizeSymbol, safeNumber } = require("../utils/helpers");

const COINPAPRIKA_TICKERS_URL = "https://api.coinpaprika.com/v1/tickers?quotes=USD";
const COINPAPRIKA_COIN_URL = "https://static.coinpaprika.com/coin";

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function toLogoUrl(coinpaprikaId, symbol) {
  const normalizedId = String(coinpaprikaId || "").trim().toLowerCase();

  if (normalizedId) {
    return `${COINPAPRIKA_COIN_URL}/${normalizedId}/logo.png`;
  }

  return `https://placehold.co/64x64?text=${encodeURIComponent(normalizeSymbol(symbol) || "COIN")}`;
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

    console.warn(`[UpdateMetadata] ${url} status=${response.status}; retrying in ${backoffMs}ms`);
    await sleep(backoffMs);
  }

  return null;
}

async function fetchCoinPaprikaMetadata() {
  console.log("[UpdateMetadata] Fetching from CoinPaprika...");
  const rows = await fetchJsonWithRetry(COINPAPRIKA_TICKERS_URL);

  if (!Array.isArray(rows)) {
    throw new Error("CoinPaprika returned invalid format");
  }

  const metadataMap = new Map();

  for (const row of rows) {
    const symbol = normalizeSymbol(row?.symbol);
    const coinId = row?.id;

    if (!symbol || !coinId) {
      continue;
    }

    const quoteUsd = row?.quotes?.USD || {};
    const price = safeNumber(quoteUsd?.price);
    const marketCap = safeNumber(quoteUsd?.market_cap);
    let circulatingSupply = safeNumber(row?.circulating_supply);

    if (circulatingSupply <= 0 && marketCap > 0 && price > 0) {
      circulatingSupply = marketCap / price;
    }

    const metadata = {
      name: String(row?.name || symbol).trim(),
      logo: toLogoUrl(coinId, symbol),
      rank: safeNumber(row?.rank, null),
      circulating_supply: circulatingSupply,
      total_supply: safeNumber(row?.total_supply || row?.max_supply),
    };

    const existing = metadataMap.get(symbol);

    if (!existing) {
      metadataMap.set(symbol, metadata);
    } else {
      // Prefer better ranked record when symbols collide
      const currentRank = safeNumber(metadata.rank, Number.MAX_SAFE_INTEGER);
      const existingRank = safeNumber(existing.rank, Number.MAX_SAFE_INTEGER);

      if (currentRank < existingRank) {
        metadataMap.set(symbol, metadata);
      }
    }
  }

  return metadataMap;
}

async function run() {
  try {
    const metadata = await fetchCoinPaprikaMetadata();

    if (metadata.size === 0) {
      throw new Error("No metadata fetched from CoinPaprika. Check internet connection.");
    }

    saveCachedMetadata(metadata);

    console.log("[UpdateMetadata] Complete", {
      total_coins: metadata.size,
      updated_at: new Date().toISOString(),
    });

    process.exit(0);
  } catch (error) {
    console.error("[UpdateMetadata] Failed:", error.message);
    process.exit(1);
  }
}

run();
