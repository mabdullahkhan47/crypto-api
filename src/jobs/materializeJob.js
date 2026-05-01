const { buildComputedCoins } = require("../services/computeService");
const { analyzeLogoBatch } = require("../services/logoAnalyzer");
const { setComputedCoins } = require("../services/priceService");
const { getRedisClient, isRedisReady } = require("../config/redis");
const mongoose = require("mongoose");

let intervalId = null;

async function materializeOnce() {
  try {
    const computed = await buildComputedCoins();
    if (!Array.isArray(computed) || computed.length === 0) return;

    // Analyze logos for coins that don't already have logo_color (runs before upsert)
    try {
      await analyzeLogoBatch(computed);
    } catch (err) {
      console.warn("[Materialize] Logo analysis failed:", err.message || err);
    }

    // write computed live fields back into the single coins collection
    const coll = mongoose.connection.collection("coins");
    const bulk = coll.initializeUnorderedBulkOp();

    // preload mapping from existing coins documents to preserve `id`, `max_supply`, and any existing logo_color
    const sourceRows = await coll.find({}).project({ symbol: 1, id: 1, logo_color: 1, max_supply: 1 }).toArray();
    const sourceMap = new Map(sourceRows.map(r => [String(r.symbol), r]));

    for (const c of computed) {
      const sym = String(c.symbol || "");
      const src = sourceMap.get(sym) || {};

      // Generate unique id: prefer existing, then name-based slug, then symbol (guarantee uniqueness)
      const id = src.id || 
        (c.name ? String(c.name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") : null) ||
        String(sym).toLowerCase();

      // Map computed fields to crypto-data Coin document fields
      const filter = { symbol: c.symbol };
      const doc = {
        $setOnInsert: {
          createdAt: new Date(),
        },
        $set: {
          // guaranteed unique id: source > name-slug > symbol
          id,
          name: c.name || null,
          symbol: c.symbol || null,
          logo: c.logo || null,
          image: c.logo || null,
          price: c.price != null ? Number(c.price) : null,
          market_cap: c.market_cap != null ? Number(c.market_cap) : null,
          volume: c.volume != null ? Number(c.volume) : null,
          percent_change_1h: c.change_1h != null ? Number(c.change_1h) : null,
          percent_change_24h: c.change_24h != null ? Number(c.change_24h) : null,
          percent_change_7d: c.change_7d != null ? Number(c.change_7d) : null,
          percent_change_30d: c.change_30d != null ? Number(c.change_30d) : null,
          percent_change_1y: c.change_1y != null ? Number(c.change_1y) : null,
          rank: c.rank != null ? Number(c.rank) : null,
          circulating_supply: c.circulating_supply != null ? Number(c.circulating_supply) : null,
          total_supply: c.total_supply != null ? Number(c.total_supply) : null,
          max_supply: src.max_supply || null,
          // prefer newly analyzed color, fallback to source
          logo_color: c.logo_color || src.logo_color || null,
          last_updated: c.updated_at || new Date().toISOString(),
          updatedAt: new Date(),
        },
      };

      bulk.find(filter).upsert().updateOne(doc);
    }

    // Publish to Redis for live subscribers when possible
    try {
      await setComputedCoins(computed);
      if (isRedisReady()) {
        const client = getRedisClient();
        await client.publish("crypto:computed:updated", JSON.stringify({ ts: new Date().toISOString() }));
      }
    } catch (err) {
      console.warn("[Materialize] Failed to write to Redis:", err.message || err);
    }

    if (bulk.length > 0) {
      const res = await bulk.execute();
      console.log(`[Materialize] Upserted computed coins into coins: ${res.nUpserted + res.nModified}`);
    }
  } catch (err) {
    console.error("[Materialize] Failed to write computed coins:", err.message || err);
  }
}

function startMaterializeJob({ intervalMs = 10000 } = {}) {
  if (intervalId) return;

  // initial run
  materializeOnce().catch((e) => console.error("[Materialize] initial run failed:", e.message || e));

  intervalId = setInterval(() => {
    materializeOnce();
  }, intervalMs);

  console.log(`[Materialize] Started materialize job (every ${intervalMs}ms)`);
}

module.exports = { startMaterializeJob, materializeOnce };
