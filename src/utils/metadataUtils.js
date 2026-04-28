const fs = require("fs");
const path = require("path");

const METADATA_PATH = path.join(__dirname, "../data/coinMetadata.json");

/**
 * Load cached coin metadata from local JSON file.
 * Returns a Map of { symbol => metadata }
 */
function loadCachedMetadata() {
  try {
    if (!fs.existsSync(METADATA_PATH)) {
      console.warn("[Metadata] Cache file not found. Run `npm run update-metadata` to create it.");
      return new Map();
    }

    const content = fs.readFileSync(METADATA_PATH, "utf-8");
    const data = JSON.parse(content);

    if (!data.coins || typeof data.coins !== "object") {
      console.warn("[Metadata] Invalid cache format. Returning empty map.");
      return new Map();
    }

    const map = new Map();
    for (const [symbol, metadata] of Object.entries(data.coins)) {
      map.set(symbol.toUpperCase(), metadata);
    }

    console.log(`[Metadata] Loaded ${map.size} coins from cache (${data.updatedAt})`);
    return map;
  } catch (error) {
    console.error("[Metadata] Failed to load cache:", error.message);
    return new Map();
  }
}

/**
 * Save metadata to local JSON cache file.
 */
function saveCachedMetadata(metadataMap) {
  try {
    const coins = {};
    for (const [symbol, metadata] of metadataMap.entries()) {
      coins[symbol] = metadata;
    }

    const data = {
      updatedAt: new Date().toISOString(),
      source: "CoinPaprika (cached, no rate limits)",
      coins,
    };

    const dir = path.dirname(METADATA_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(METADATA_PATH, JSON.stringify(data, null, 2), "utf-8");
    console.log(`[Metadata] Saved ${metadataMap.size} coins to cache at ${data.updatedAt}`);
  } catch (error) {
    console.error("[Metadata] Failed to save cache:", error.message);
  }
}

/**
 * Get metadata for a specific symbol from cache.
 * Returns null if not found.
 */
function getMetadata(symbol) {
  const map = loadCachedMetadata();
  return map.get(String(symbol || "").toUpperCase()) || null;
}

/**
 * Get metadata for multiple symbols.
 * Returns a Map of { symbol => metadata }
 */
function getMetadataMap(symbols = []) {
  const map = loadCachedMetadata();
  const result = new Map();

  for (const symbol of symbols) {
    const normalized = String(symbol || "").toUpperCase();
    const metadata = map.get(normalized);
    if (metadata) {
      result.set(normalized, metadata);
    }
  }

  return result;
}

module.exports = {
  loadCachedMetadata,
  saveCachedMetadata,
  getMetadata,
  getMetadataMap,
  METADATA_PATH,
};
