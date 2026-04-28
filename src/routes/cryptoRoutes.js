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
    // read from MongoDB computed_coins (has id + all fields with logo color)
    const coll = mongoose.connection.collection('computed_coins');
    const total = await coll.countDocuments();
    const rows = await coll.find({}).sort({ rank: 1, market_cap: -1 }).skip((page - 1) * limit).limit(limit).toArray();
    
    console.log('[CryptoRoutes] /crypto/tickers called, got', rows.length, 'coins from', total, 'total');
    
    return res.json({
      tickers: rows,
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
    // read from MongoDB computed_coins with proper id field
    const coll = mongoose.connection.collection('computed_coins');
    const rows = await coll.find({}).sort({ rank: 1, market_cap: -1 }).limit(n).toArray();
    
    return res.json({ success: true, tickers: rows });
  } catch (err) {
    console.error('[CryptoRoutes] Failed to read computed coins for top/:n:', err.message || err);
    return res.status(500).json({ success: false, tickers: [] });
  }
});

module.exports = router;
