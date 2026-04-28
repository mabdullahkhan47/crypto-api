/**
 * Automated maintenance scheduler using node-cron
 * 
 * Runs maintenance cycle daily at 2 AM local time:
 * - Updates metadata cache from CoinPaprika
 * - Reseeds database with fresh Binance tickers
 * 
 * Can be started alongside server:
 *   node src/jobs/maintenanceScheduler.js
 * 
 * Or integrated into server.js for unified startup
 */
require("dotenv").config();

const cron = require("node-cron");
const { spawn } = require("child_process");
const path = require("path");

// Schedule: Daily at 2 AM (02:00)
// Format: "minute hour day month dayOfWeek"
const MAINTENANCE_SCHEDULE = "0 2 * * *";

function runMaintenance() {
  console.log(`[MaintenanceScheduler] Running maintenance at ${new Date().toISOString()}`);

  const maintenanceScript = path.join(__dirname, "../scripts/maintainCache.js");
  const proc = spawn("node", [maintenanceScript], {
    stdio: "inherit",
  });

  proc.on("close", (code) => {
    if (code === 0) {
      console.log(`[MaintenanceScheduler] Maintenance completed successfully at ${new Date().toISOString()}`);
    } else {
      console.error(`[MaintenanceScheduler] Maintenance failed with exit code ${code}`);
    }
  });

  proc.on("error", (err) => {
    console.error("[MaintenanceScheduler] Failed to run maintenance:", err.message);
  });
}

// Start scheduler
function start() {
  console.log("[MaintenanceScheduler] Starting...");
  console.log(`[MaintenanceScheduler] Scheduled maintenance: ${MAINTENANCE_SCHEDULE} (daily at 2 AM)`);

  const task = cron.schedule(MAINTENANCE_SCHEDULE, runMaintenance, {
    scheduled: false,
  });

  task.start();

  // Run once at startup if --run-now flag provided
  if (process.argv.includes("--run-now")) {
    console.log("[MaintenanceScheduler] Running maintenance immediately (--run-now)...");
    runMaintenance();
  }

  console.log("[MaintenanceScheduler] Ready");
}

start();
