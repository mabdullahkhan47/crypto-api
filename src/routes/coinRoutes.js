const express = require("express");
const { getCoins, getCoinBySymbol } = require("../controllers/coinController");

const router = express.Router();

router.get("/", getCoins);
router.get("/:symbol", getCoinBySymbol);

module.exports = router;
