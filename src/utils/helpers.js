function normalizeSymbol(symbol) {
  return String(symbol || "").trim().toUpperCase();
}

function toBinancePair(symbol) {
  return `${normalizeSymbol(symbol)}USDT`;
}

function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function round(value, decimals = 8) {
  const factor = 10 ** decimals;
  return Math.round(safeNumber(value) * factor) / factor;
}

function calculatePercentChange(currentPrice, previousPrice) {
  const current = safeNumber(currentPrice);
  const previous = safeNumber(previousPrice);

  if (previous <= 0) {
    return null;
  }

  return round(((current - previous) / previous) * 100, 4);
}

function isoDateMinutesAgo(minutes) {
  const now = Date.now();
  return new Date(now - minutes * 60 * 1000);
}

module.exports = {
  normalizeSymbol,
  toBinancePair,
  safeNumber,
  round,
  calculatePercentChange,
  isoDateMinutesAgo,
};
