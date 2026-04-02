let redis;
try {
  redis = require("redis");
} catch (e) {
  redis = null;
}

const REDIS_DISABLED = (() => {
  const v = String(process.env.USE_REDIS || "").trim().toLowerCase();
  return !(v === "true" || v === "1" || v === "on" || v === "yes" || v === "enabled");
})();

let client = null;
let connectPromise = null;

const getRedisUrl = () => {
  if (process.env.REDIS_URL) return process.env.REDIS_URL;

  const host = process.env.REDIS_HOST || "127.0.0.1";
  const port = process.env.REDIS_PORT || "6379";
  const password = process.env.REDIS_PASSWORD;

  if (password) {
    return `redis://:${encodeURIComponent(password)}@${host}:${port}`;
  }

  return `redis://${host}:${port}`;
};

const ensureClient = async () => {
  if (!redis || REDIS_DISABLED) return null;
  if (client) return client;

  const url = getRedisUrl();
  client = redis.createClient({ url });

  client.on("error", (err) => {
    console.error("[CACHE][REDIS] error:", err?.message || err);
  });

  connectPromise = client
    .connect()
    .then(() => client)
    .catch((err) => {
      console.error("[CACHE][REDIS] connect failed:", err?.message || err);
      try {
        client?.quit();
      } catch (_) {}
      client = null;
      connectPromise = null;
      return null;
    });

  return connectPromise;
};

const safeJsonParse = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return null;
  try {
    return JSON.parse(value);
  } catch (e) {
    return null;
  }
};

exports.getJSON = async (key) => {
  try {
    const c = await ensureClient();
    if (!c) return null;
    const value = await c.get(key);
    return safeJsonParse(value);
  } catch (err) {
    console.error("[CACHE][GET] failed:", err?.message || err);
    return null;
  }
};

exports.setJSON = async (key, value, ttlSeconds) => {
  try {
    const c = await ensureClient();
    if (!c) return false;

    const payload = JSON.stringify(value);
    if (ttlSeconds && Number(ttlSeconds) > 0) {
      await c.setEx(key, Number(ttlSeconds), payload);
    } else {
      await c.set(key, payload);
    }

    return true;
  } catch (err) {
    console.error("[CACHE][SET] failed:", err?.message || err);
    return false;
  }
};

exports.del = async (key) => {
  try {
    const c = await ensureClient();
    if (!c) return false;
    await c.del(key);
    return true;
  } catch (err) {
    console.error("[CACHE][DEL] failed:", err?.message || err);
    return false;
  }
};

exports.buildKey = (...parts) => {
  return parts.filter((p) => p !== undefined && p !== null && p !== "").join(":");
};
