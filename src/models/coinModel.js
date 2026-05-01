const mongoose = require("mongoose");

const coinSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      trim: true,
      index: true,
    },
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
    image: {
      type: String,
      trim: true,
      default: null,
    },
    logo_color: {
      type: String,
      trim: true,
      default: null,
    },
    price: {
      type: Number,
      min: 0,
      default: null,
    },
    market_cap: {
      type: Number,
      min: 0,
      default: null,
    },
    volume: {
      type: Number,
      min: 0,
      default: null,
    },
    percent_change_1h: {
      type: Number,
      default: null,
    },
    percent_change_24h: {
      type: Number,
      default: null,
    },
    percent_change_7d: {
      type: Number,
      default: null,
    },
    percent_change_30d: {
      type: Number,
      default: null,
    },
    percent_change_1y: {
      type: Number,
      default: null,
    },
    rank: {
      type: Number,
      min: 0,
      default: null,
      index: true,
    },
    last_updated: {
      type: String,
      trim: true,
      default: null,
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
    max_supply: {
      type: Number,
      min: 0,
      default: null,
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
