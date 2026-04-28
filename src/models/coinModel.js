const mongoose = require("mongoose");

const coinSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    symbol: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
      unique: true,
      index: true,
    },
    binance_pair: {
      type: String,
      uppercase: true,
      trim: true,
      index: true,
    },
    logo: {
      type: String,
      required: true,
      trim: true,
    },
    circulating_supply: {
      type: Number,
      required: true,
      min: 0,
    },
    total_supply: {
      type: Number,
      required: true,
      min: 0,
    },
    source_rank: {
      type: Number,
      min: 0,
      index: true,
    },
    source_market_cap: {
      type: Number,
      min: 0,
      default: 0,
    },
    source_price: {
      type: Number,
      min: 0,
      default: 0,
    },
    source_volume_24h: {
      type: Number,
      min: 0,
      default: 0,
    },
    source_change_1h: {
      type: Number,
      default: null,
    },
    source_change_24h: {
      type: Number,
      default: null,
    },
    source_change_7d: {
      type: Number,
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

module.exports = mongoose.model("Coin", coinSchema);
