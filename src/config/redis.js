const { createClient } = require("redis");

let redisClient = null;
let redisReady = false;
let lastRedisErrorLogTs = 0;

function formatRedisError(error) {
  if (!error) {
    return "unknown error";
  }

  if (error.message && error.message.trim()) {
    return error.message;
  }

  if (error.code) {
    return String(error.code);
  }

  try {
    return JSON.stringify(error);
  } catch (_jsonError) {
    return String(error);
  }
}

function logRedisErrorThrottled(error) {
  const now = Date.now();

  // Reduce noisy repeated reconnect logs while Redis is unavailable.
  if (now - lastRedisErrorLogTs < 10000) {
    return;
  }

  lastRedisErrorLogTs = now;
  console.error("[Redis] Error:", formatRedisError(error));
}

async function connectRedis() {
  const redisUrl = process.env.REDIS_URL;

  if (!redisUrl) {
    console.warn("[Redis] REDIS_URL not set. Falling back to in-memory cache.");
    return null;
  }

  redisClient = createClient({
    url: redisUrl,
    socket: {
      connectTimeout: 5000,
      reconnectStrategy: (retries) => {
        // Retry with bounded backoff, then stop after enough attempts.
        if (retries > 20) {
          console.warn("[Redis] Max reconnect attempts reached. Using memory fallback.");
          return false;
        }

        const backoff = Math.min(500 * 2 ** retries, 10000);
        return backoff;
      },
    },
  });

  redisClient.on("error", (error) => {
    redisReady = false;
    logRedisErrorThrottled(error);
  });

  redisClient.on("ready", () => {
    redisReady = true;
    console.log("[Redis] Connected");
  });

  redisClient.on("end", () => {
    redisReady = false;
    console.warn("[Redis] Connection closed");
  });

  // Do not block server startup if Redis is unavailable.
  redisClient.connect().catch((error) => {
    redisReady = false;
    console.warn("[Redis] Initial connection failed. Using memory fallback:", formatRedisError(error));
  });

  return redisClient;
}

function getRedisClient() {
  return redisClient;
}

function isRedisReady() {
  return redisReady && redisClient !== null;
}

module.exports = {
  connectRedis,
  getRedisClient,
  isRedisReady,
};
