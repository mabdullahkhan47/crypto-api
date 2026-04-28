# Crypto API Backend (Binance + Redis + MongoDB)

Production-ready Node.js backend for CoinGecko-style market data using Binance live stream.

## 1. Setup

1. Install dependencies:
   npm install
2. Configure environment:
   copy .env.example .env
3. Update values in .env:
   - PORT
   - MONGO_URI
   - REDIS_URL
   - COIN_SEED_LIMIT (optional, default 1000)

## 2. Metadata cache system

**Zero rate-limit risk**: Metadata (logos, supply, rank) is cached locally and updated independently of seeding.

### First time setup

1. Update metadata from CoinPaprika and cache locally:
   ```
   npm run update-metadata
   ```
   This creates `src/data/coinMetadata.json` with ~1900 coins.

2. Seed database with Binance tickers + cached metadata:
   ```
   npm run seed
   ```

### Automatic maintenance (recommended)

Run full maintenance cycle (update cache → reseed):
```
npm run maintain
```

Or start the scheduler for daily 2 AM auto-maintenance:
```
node src/jobs/maintenanceScheduler.js
```

Or immediately with:
```
node src/jobs/maintenanceScheduler.js --run-now
```

## 3. Start Redis

Use a real Redis instance so cache is persistent and fast.

Docker quick start:

- First time:
  npm run redis:up
- Next runs:
  npm run redis:start

If Redis is not running, the app falls back to in-memory cache.

## 4. Start the backend

Development mode:

npm run dev

Production mode:

npm start

## 5. Runtime flow

1. Binance WebSocket ingests live ticker data into Redis hash (or memory fallback).
2. Binance REST fallback hydrates tickers if WebSocket messages are delayed/silent.
3. Snapshot job runs every 5 minutes and writes price snapshots to MongoDB.
4. Compute job runs every 2 minutes and precomputes:
   - price
   - 1h, 24h, 7d changes
   - market cap
   - volume
   - ranking
5. API routes serve only cached computed payloads from Redis (or memory fallback).

## 6. API endpoints

- GET /health
- GET /api/coins
- GET /api/coins/:symbol

Response includes:
- symbol, name, pair (trading pair)
- price, change_1h, change_24h, change_7d
- market_cap, volume
- source_rank, circulating_supply, total_supply

## 7. Troubleshooting

### Redis connection errors (ECONNREFUSED)

**This is normal.** If Redis is not running, the app gracefully falls back to in-memory cache. You'll see logs like:
```
[Redis] Connection error: ECONNREFUSED. Using in-memory cache.
```

To use persistent Redis:
```
npm run redis:up
```

### Metadata cache not found

If you see "cache file not found", run:
```
npm run update-metadata
npm run seed
```

### Stale data after updating metadata

After running `npm run update-metadata`, reseed:
```
npm run seed
```

## 8. Notes

- No heavy calculations in request handlers.
- Mongo indexes are applied for efficient historical lookups.
- WebSocket auto-reconnect uses exponential backoff.
- Rate limiting is enabled globally.
- Metadata is fetched from CoinPaprika only during maintenance, not during normal API requests.
