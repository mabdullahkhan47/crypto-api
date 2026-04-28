const sharp = require("sharp");
const axios = require("axios");

async function analyzeLogoColor(imageUrl) {
  try {
    const response = await axios.get(imageUrl, { responseType: "arraybuffer", timeout: 8000 });
    const { data } = await sharp(Buffer.from(response.data))
      .resize(16, 16, { fit: "cover" })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    let r = 0, g = 0, b = 0, count = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 128) continue;
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
      count++;
    }

    if (count === 0) return null;

    r = Math.round(r / count);
    g = Math.round(g / count);
    b = Math.round(b / count);

    const hex = (c) => c.toString(16).padStart(2, "0");
    return `#${hex(r)}${hex(g)}${hex(b)}`;
  } catch (err) {
    return null;
  }
}

async function analyzeLogoBatch(coins, concurrency = 15) {
  const need = coins.filter((c) => c.image && !c.logo_color);
  if (need.length === 0) return;

  for (let i = 0; i < need.length; i += concurrency) {
    const batch = need.slice(i, i + concurrency);
    await Promise.all(
      batch.map(async (coin) => {
        const color = await analyzeLogoColor(coin.image);
        if (color) coin.logo_color = color;
      })
    );
  }
}

module.exports = { analyzeLogoBatch };
