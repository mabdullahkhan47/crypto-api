/**
 * Maintenance script: Update metadata cache and reseed database
 * 
 * Usage:
 *   npm run maintain
 *   
 * This script:
 * 1. Fetches fresh metadata from CoinPaprika and caches it locally
 * 2. Reseeds the database with Binance tickers + cached metadata
 * 
 * Can be run via cron for daily refreshes (recommended every 12-24 hours)
 */
require("dotenv").config();

const { spawn } = require("child_process");

async function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    console.log(`[Maintain] Running: ${command} ${args.join(" ")}`);
    const proc = spawn(command, args, {
      stdio: "inherit",
      shell: true,
    });

    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`${command} exited with code ${code}`));
      } else {
        resolve(code);
      }
    });

    proc.on("error", (err) => {
      reject(err);
    });
  });
}

async function run() {
  try {
    console.log("[Maintain] Starting maintenance cycle...");
    console.log(`[Maintain] Timestamp: ${new Date().toISOString()}`);

    // Step 1: Update metadata cache
    console.log("[Maintain] Step 1/2: Updating metadata cache from CoinPaprika...");
    await runCommand("npm", ["run", "update-metadata"]);

    // Step 2: Reseed database with fresh metadata
    console.log("[Maintain] Step 2/2: Reseeding database with Binance + cached metadata...");
    await runCommand("npm", ["run", "seed"]);

    console.log("[Maintain] Maintenance cycle complete at " + new Date().toISOString());
    process.exit(0);
  } catch (error) {
    console.error("[Maintain] Failed:", error.message);
    process.exit(1);
  }
}

run();
