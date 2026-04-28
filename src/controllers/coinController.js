const { getComputedCoin, getComputedCoins } = require("../services/priceService");
const { normalizeSymbol } = require("../utils/helpers");

async function getCoins(_req, res, next) {
  try {
    const coins = await getComputedCoins();

    return res.status(200).json({
      data: coins,
      count: coins.length,
    });
  } catch (error) {
    return next(error);
  }
}

async function getCoinBySymbol(req, res, next) {
  try {
    const symbol = normalizeSymbol(req.params.symbol);
    const coin = await getComputedCoin(symbol);

    if (!coin) {
      return res.status(404).json({ message: "Coin not found in cache" });
    }

    return res.status(200).json({ data: coin });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  getCoins,
  getCoinBySymbol,
};
