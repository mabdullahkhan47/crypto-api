const mongoose = require("mongoose");

const priceSnapshotSchema = new mongoose.Schema(
  {
    symbol: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    timestamp: {
      type: Date,
      required: true,
      index: true,
    },
  },
  {
    timestamps: false,
    versionKey: false,
  }
);

priceSnapshotSchema.index({ symbol: 1, timestamp: -1 });

module.exports = mongoose.model("PriceSnapshot", priceSnapshotSchema);
