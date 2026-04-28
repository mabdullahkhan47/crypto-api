# Quick Start Guide

## Step 1: Initial Setup (One Time)

```bash
# Install dependencies
npm install

# Configure environment
copy .env.example .env
# Edit .env with your MongoDB URI, Redis URL, etc.

# Create metadata cache
npm run update-metadata

# Seed database with 738 Binance spot coins + metadata
npm run seed
```

## Step 2: Start Services

### Option A: Development (Recommended for testing)

```bash
# In one terminal:
npm run dev

# In another terminal (optional, for automatic maintenance):
node src/jobs/maintenanceScheduler.js --run-now
```

### Option B: Production

```bash
# Start Redis (optional but recommended)
npm run redis:up

# Start server
npm start

# Start maintenance scheduler in background
pm2 start src/jobs/maintenanceScheduler.js --name crypto-maintenance
pm2 start src/server.js --name crypto-api
```

## Step 3: Verify Setup

```bash
# Check server health
curl http://localhost:3000/health

# Get all coins
curl http://localhost:3000/api/coins

# Get specific coin
curl http://localhost:3000/api/coins/BTC
```

## Common Commands

| Command | Purpose | Frequency |
|---|---|---|
| `npm run update-metadata` | Fetch coin data from CoinPaprika, cache locally | Once per day |
| `npm run seed` | Populate database, use metadata + Binance | After update-metadata |
| `npm run maintain` | Run both above in sequence | Manual trigger |
| `npm run dev` | Start server in dev mode with auto-reload | Development |
| `npm start` | Start server in production | Production |
| `npm run redis:up` | Start Redis via Docker | First time setup |
| `npm run redis:start` | Restart Redis container | Subsequent times |
| `node src/jobs/maintenanceScheduler.js` | Run daily 2 AM maintenance | Automated |

## Understanding "Cache Errors"

### Redis Warning (Normal)

```
[Redis] Initial connection failed: ECONNREFUSED
[Redis] Using memory fallback
```

**Meaning**: Redis is not running, so the app uses in-memory cache instead.

**Is this bad?** No. Your API still works perfectly. But:
- Cache is lost on server restart
- Can't scale to multiple servers

**Fix**: Start Redis via `npm run redis:up` if you want persistence.

### Metadata Cache Warning (Normal)

```
[Metadata] Cache file not found. Run `npm run update-metadata` to create it.
```

**Meaning**: No local metadata cache exists, so seeding will only use Binance data.

**Fix**: Run `npm run update-metadata` once.

## Monitoring

### View server logs

Development mode shows logs in terminal.

Production mode (pm2):
```bash
pm2 logs crypto-api
pm2 logs crypto-maintenance
```

### Key log entries to watch for

| Log | What it means | Action |
|---|---|---|
| `[ComputeJob] Computed 738 coins` | ✅ Data is refreshing correctly | None |
| `[SnapshotJob] Inserted 738 snapshots` | ✅ Historical data recording | None |
| `[Binance] WebSocket connected` | ✅ Live price feed active | None |
| `[Binance] Fallback REST hydrated 3562 tickers` | ✅ Fallback working if WebSocket silent | None |
| `[Redis] Connected` | ✅ Redis available for persistence | None |
| `[Redis] Initial connection failed` | ⚠️ Redis not running, using memory fallback | Optional: start Redis |
| `[Metadata] Loaded 1894 coins from cache` | ✅ Metadata loaded successfully | None |
| `[Metadata] Cache file not found` | ⚠️ Need to run update-metadata | Run: `npm run update-metadata` |

## Endpoints

### GET /health

Returns server status and cache info.

```bash
curl http://localhost:3000/health

# Response:
{
  "status": "ok",
  "uptime_seconds": 1234,
  "redis": "fallback-memory",  // or "connected"
  "timestamp": "2026-04-11T14:40:22.330Z"
}
```

### GET /api/coins

Returns all 738 seeded coins with rich data.

```bash
curl http://localhost:3000/api/coins?limit=10

# Response:
{
  "count": 738,
  "timestamp": "2026-04-11T14:40:22.330Z",
  "data": [
    {
      "symbol": "BTC",
      "name": "Bitcoin",
      "pair": "BTCUSDT",
      "price": 72704.99,
      "change_1h": 0.1243,
      "change_24h": 0.4307,
      "change_7d": 0,
      "market_cap": 1455144279885.56,
      "volume": 981773510.24,
      "source_rank": 1,
      "circulating_supply": 20014365.9999892,
      "total_supply": 20014362,
      "updated_at": "2026-04-11T14:38:15.330Z",
      "rank": 1
    },
    ...
  ]
}
```

### GET /api/coins/:symbol

Returns single coin data.

```bash
curl http://localhost:3000/api/coins/ETH

# Response:
{
  "symbol": "ETH",
  "name": "Ethereum",
  "pair": "ETHUSDT",
  "price": 2242.44,
  "change_1h": 0.2678,
  "change_24h": 1.2429,
  "change_7d": 0,
  "market_cap": 270048788050.86,
  "volume": 425516635.28,
  "source_rank": 2,
  "circulating_supply": 120426315.99992137,
  "total_supply": 120232214,
  "updated_at": "2026-04-11T14:38:15.330Z",
  "rank": 2
}
```

## Integration with Your Main Backend

From your backend service, call:

```javascript
// Node.js/Express example
const response = await fetch('http://localhost:3000/api/coins');
const coins = await response.json();

console.log(`Got ${coins.count} coins`);
coins.data.forEach(coin => {
  console.log(`${coin.symbol}: $${coin.price} (${coin.change_24h}%)`);
});
```

## Troubleshooting

### Server won't start

1. Check MongoDB is running and MONGO_URI is correct in .env
2. Check no other process is using port 3000
3. Check Node.js and npm are installed: `node --version`

### No coins in /api/coins

1. Run seed: `npm run seed`
2. Check MongoDB has data: `mongo yourdb -eval "db.coins.countDocuments()"`

### Getting stale prices

1. Check Binance WebSocket is connected: check logs for `[Binance] WebSocket connected`
2. If not, REST fallback should kick in every 60s
3. Check network access to wss://stream.binance.com:9443

### Prices all show as 0

1. Run seed: `npm run seed`
2. Check compute job is running: look for `[ComputeJob] Computed 738 coins` in logs every 2 min

## Production Deployment

Recommended setup:

```bash
# 1. Start Redis container
npm run redis:up

# 2. Start main API server
pm2 start src/server.js --name crypto-api

# 3. Start maintenance scheduler
pm2 start src/jobs/maintenanceScheduler.js --name crypto-maintenance

# 4. Monitor
pm2 monit
```

**For Docker/Kubernetes**: The maintenance script can be integrated as a separate CronJob pod that runs once daily.
