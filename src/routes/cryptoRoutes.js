const express = require('express');
const mongoose = require('mongoose');

const router = express.Router();

router.get('/crypto/tickers', async (req, res) => {
  const pageParam = Number.parseInt(req.query.page, 10);
  const limitParam = Number.parseInt(req.query.limit, 10);
  const page = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1;
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 500) : 100;

  res.set('Cache-Control', 'public, max-age=5, s-maxage=5, stale-while-revalidate=30');

  try {
    // read from MongoDB coins (contains both source and computed/live fields)
    const coll = mongoose.connection.collection('coins');
    const total = await coll.countDocuments();
    const rows = await coll.find({}).sort({ rank: 1, market_cap: -1 }).skip((page - 1) * limit).limit(limit).toArray();
    
    // Ensure all coins have a unique id (safety filter for React key stability)
    const safeTickers = rows.map((coin) => ({
      ...coin,
      id: coin.id || String(coin.symbol || '').toLowerCase() || String(coin._id),
    }));
    
    console.log('[CryptoRoutes] /crypto/tickers called, got', safeTickers.length, 'coins from', total, 'total');
    
    return res.json({
      tickers: safeTickers,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error('[CryptoRoutes] Failed to read computed coins:', err.message || err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/crypto/top/:n', async (req, res) => {
  const n = parseInt(req.params.n, 10) || 10;
  try {
    // read from MongoDB coins with proper id and computed fields
    const coll = mongoose.connection.collection('coins');
    const rows = await coll.find({}).sort({ rank: 1, market_cap: -1 }).limit(n).toArray();
    
    // Ensure all coins have a unique id (safety filter for React key stability)
    const safeTickers = rows.map((coin) => ({
      ...coin,
      id: coin.id || String(coin.symbol || '').toLowerCase() || String(coin._id),
    }));
    
    return res.json({ success: true, tickers: safeTickers });
  } catch (err) {
    console.error('[CryptoRoutes] Failed to read computed coins for top/:n:', err.message || err);
    return res.status(500).json({ success: false, tickers: [] });
  }
});

module.exports = router;
