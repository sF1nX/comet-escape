const crypto = require("crypto");
const express = require("express");
const cors = require("cors");
const { PlayFunClient } = require("@playdotfun/server-sdk");

const app = express();
app.use(express.json({ limit: "10kb" }));

function parsePositiveInt(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

const SESSION_TTL_MS = parsePositiveInt(process.env.SESSION_TTL_MS, 20 * 60 * 1000);
const MIN_SESSION_MS = parsePositiveInt(process.env.MIN_SESSION_MS, 8000);
const MAX_SCORE_PER_SESSION = parsePositiveInt(process.env.MAX_SCORE_PER_SESSION, 250);
const MAX_SESSIONS_PER_DAY = parsePositiveInt(process.env.MAX_SESSIONS_PER_DAY, 30);
const MAX_POINTS_PER_DAY = parsePositiveInt(process.env.MAX_POINTS_PER_DAY, 3000);
const MAX_ACTIVE_SESSIONS = parsePositiveInt(process.env.MAX_ACTIVE_SESSIONS, 50000);
const STATS_TTL_MS = parsePositiveInt(process.env.STATS_TTL_MS, 3 * 24 * 60 * 60 * 1000);

const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (allowedOrigins.length === 0 || allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error("Origin not allowed"), false);
    },
  }),
);

app.use((error, _request, response, next) => {
  if (!error) return next();
  if (error.type === "entity.parse.failed") {
    response.status(400).json({ error: "Invalid JSON body" });
    return;
  }
  if (error.message === "Origin not allowed") {
    response.status(403).json({ error: "Origin not allowed" });
    return;
  }
  next(error);
});

const GAME_ID = process.env.GAME_ID;
const OGP_API_KEY = process.env.OGP_API_KEY || "";
const OGP_API_SECRET_KEY = process.env.OGP_API_SECRET_KEY || "";

const client = new PlayFunClient({
  apiKey: OGP_API_KEY,
  secretKey: OGP_API_SECRET_KEY,
});

const sessions = new Map();
const dailyStats = new Map();

function getDayKey(timestampMs) {
  return new Date(timestampMs).toISOString().slice(0, 10);
}

function getPlayerDayStats(playerId, timestampMs) {
  const key = `${playerId}:${getDayKey(timestampMs)}`;
  let stats = dailyStats.get(key);

  if (!stats) {
    stats = {
      sessions: 0,
      points: 0,
      lastTouchedAt: timestampMs,
    };
    dailyStats.set(key, stats);
  } else {
    stats.lastTouchedAt = timestampMs;
  }

  return stats;
}

function cleanupStores() {
  const now = Date.now();

  for (const [sessionId, session] of sessions.entries()) {
    if (session.submitted || now - session.startedAt > SESSION_TTL_MS) {
      sessions.delete(sessionId);
    }
  }

  for (const [statsKey, stats] of dailyStats.entries()) {
    if (now - stats.lastTouchedAt > STATS_TTL_MS) {
      dailyStats.delete(statsKey);
    }
  }
}

setInterval(cleanupStores, 60 * 1000).unref();

function isValidPlayerId(playerId) {
  return typeof playerId === "string" && playerId.length >= 3 && playerId.length <= 128;
}

function ensureConfig(response) {
  if (!GAME_ID || !OGP_API_KEY || !OGP_API_SECRET_KEY) {
    response.status(500).json({
      error: "Server is missing Play.fun configuration.",
    });
    return false;
  }

  return true;
}

app.get("/health", (_request, response) => {
  response.json({
    ok: true,
    configReady: Boolean(GAME_ID && OGP_API_KEY && OGP_API_SECRET_KEY),
  });
});

app.post("/api/session/start", (request, response) => {
  const playerId = String(request.body?.playerId || "").trim();

  if (!isValidPlayerId(playerId)) {
    response.status(400).json({ error: "playerId must be 3-128 characters" });
    return;
  }

  cleanupStores();
  if (sessions.size >= MAX_ACTIVE_SESSIONS) {
    response.status(503).json({ error: "Server is busy, please retry" });
    return;
  }

  const now = Date.now();
  const stats = getPlayerDayStats(playerId, now);

  if (stats.sessions >= MAX_SESSIONS_PER_DAY) {
    response.status(429).json({ error: "Daily session limit reached" });
    return;
  }

  const sessionId = crypto.randomUUID();
  sessions.set(sessionId, {
    playerId,
    startedAt: now,
    submitted: false,
  });

  stats.sessions += 1;
  response.json({ sessionId, startedAt: now });
});

app.post("/api/session/finish", async (request, response) => {
  if (!ensureConfig(response)) return;

  const sessionId = String(request.body?.sessionId || "").trim();
  const playerId = String(request.body?.playerId || "").trim();
  const score = Number(request.body?.score);
  const durationMs = Number(request.body?.durationMs);

  if (!sessionId || !isValidPlayerId(playerId)) {
    response.status(400).json({ error: "sessionId and valid playerId are required" });
    return;
  }

  if (!Number.isInteger(score) || score < 0) {
    response.status(400).json({ error: "Score must be a non-negative integer" });
    return;
  }

  if (score > MAX_SCORE_PER_SESSION) {
    response.status(400).json({ error: "Score exceeds per-session limit" });
    return;
  }

  if (!Number.isFinite(durationMs) || durationMs < MIN_SESSION_MS || durationMs > SESSION_TTL_MS) {
    response.status(400).json({ error: "Invalid session duration" });
    return;
  }

  const session = sessions.get(sessionId);
  if (!session || session.playerId !== playerId) {
    response.status(400).json({ error: "Invalid session" });
    return;
  }

  if (session.submitted) {
    response.status(409).json({ error: "Session already submitted" });
    return;
  }

  const now = Date.now();
  if (now - session.startedAt > SESSION_TTL_MS) {
    sessions.delete(sessionId);
    response.status(400).json({ error: "Session expired" });
    return;
  }

  const stats = getPlayerDayStats(playerId, now);
  if (stats.points + score > MAX_POINTS_PER_DAY) {
    response.status(429).json({ error: "Daily points limit reached" });
    return;
  }

  try {
    await client.play.savePoints({
      gameId: GAME_ID,
      playerId,
      points: score,
    });
  } catch (error) {
    response.status(502).json({
      error: "Failed to save points to Play.fun",
      detail: String(error?.message || error),
    });
    return;
  }

  session.submitted = true;
  stats.points += score;

  response.json({ ok: true, savedPoints: score });
});

const port = parsePositiveInt(process.env.PORT, 3000);
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Comet Escape API listening on :${port}`);
});
