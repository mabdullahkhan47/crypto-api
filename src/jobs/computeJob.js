const cron = require("node-cron");
const { buildComputedCoins } = require("../services/computeService");
const { setComputedCoins } = require("../services/priceService");

async function runComputeNow() {
  const computed = await buildComputedCoins();
  await setComputedCoins(computed);
  console.log(`[ComputeJob] Computed ${computed.length} coins`);
}

function startComputeJob() {
  cron.schedule("*/2 * * * *", () => {
    runComputeNow().catch((error) => {
      console.error("[ComputeJob] Error:", error.message);
    });
  });

  console.log("[ComputeJob] Scheduled every 2 minutes");
}

module.exports = {
  runComputeNow,
  startComputeJob,
};
