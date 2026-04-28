require("dotenv").config();

const express = require("express");
const morgan = require("morgan");
const http = require("http");
const cors = require("cors");

const { connectDB } = require("./config/db");
const { connectRedis, isRedisReady } = require("./config/redis");
const { startBinanceService } = require("./services/binanceService");
const { startSnapshotJob, runSnapshotNow } = require("./jobs/snapshotJob");
const { startComputeJob, runComputeNow } = require("./jobs/computeJob");
const { startMaterializeJob } = require("./jobs/materializeJob");
const cryptoRoutes = require("./routes/cryptoRoutes");
const { setupLiveServer } = require("./routes/live");
const { apiRateLimiter } = require("./middleware/rateLimiter");
const coinRoutes = require("./routes/coinRoutes");

const app = express();

app.use(cors());
app.use(express.json());
app.use(morgan("tiny"));
app.use(apiRateLimiter);

app.get("/health", (_req, res) => {
  return res.status(200).json({
    status: "ok",
    uptime_seconds: Math.floor(process.uptime()),
    redis: isRedisReady() ? "connected" : "fallback-memory",
    timestamp: new Date().toISOString(),
  });
});

app.use("/api/coins", coinRoutes);

app.use((error, _req, res, _next) => {
  console.error("[API] Unhandled error:", error);

  return res.status(500).json({
    message: "Internal server error",
  });
});

async function bootstrap() {
  const port = Number(process.env.PORT) || 5000;

  await connectDB();

  try {
    await connectRedis();
  } catch (error) {
    console.warn("[Redis] Boot fallback to memory cache:", error.message);
  }

  startBinanceService();
  startSnapshotJob();
  startComputeJob();
  // Materialize computed coins into Mongo so other services (crypto-data) can read live fields
  startMaterializeJob({ intervalMs: Number(process.env.MATERIALIZE_INTERVAL_MS) || 10000 });

  // mount crypto-data compatible routes so frontend can call crypto-api directly
  app.use('/api', cryptoRoutes);

  // create HTTP server for WebSocket support
  const server = http.createServer(app);

  // start websocket live server for clients
  setupLiveServer(server);

  // Warm cache quickly after startup instead of waiting for first cron tick.
  setTimeout(() => {
    runSnapshotNow().catch((error) => {
      console.error("[Startup] Snapshot warmup failed:", error.message);
    });

    runComputeNow().catch((error) => {
      console.error("[Startup] Compute warmup failed:", error.message);
    });
  }, 5000);

  server.listen(port, () => {
    console.log(`[Server] Listening on port ${port}`);
  });
}

bootstrap().catch((error) => {
  console.error("[Server] Failed to start:", error);
  process.exit(1);
});
