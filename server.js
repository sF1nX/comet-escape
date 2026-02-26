const crypto = require("crypto");
const express = require("express");
const cors = require("cors");
const { PlayFunClient } = require("@playdotfun/server-sdk");

const app = express();
app.use(express.json());

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

const GAME_ID = process.env.GAME_ID;
const client = new PlayFunClient({
  apiKey: process.env.OGP_API_KEY || "",
  secretKey: process.env.OGP_API_SECRET_KEY || "",
});

const SESSION_TTL_MS = Number(process.env.SESSION_TTL_MS || 20 * 60 * 1000);
const MIN_SESSION_MS = Number(process.env.MIN_SESSION_MS || 8000);
const MAX_SCORE_PER_SESSION = Number(process.env.MAX_SCORE_PER_SESSION || 250);
const MAX_SESSIONS_PER_DAY = Number(process.env.MAX_SESSIONS_PER_DAY || 30);
const MAX_POINTS_PER_DAY = Number(process.env.MAX_POINTS_PER_DAY || 3000);

const sessions = new Map();
const dailyStats = new Map();

function getDayKey(ts) {
  return new Date(ts).toISOString().slice(0, 10);
}

function getPlayerDayStats(playerId, ts) {
  const key = `${playerId}:${getDayKey(ts)}`;
  if (!dailyStats.has(key)) {
    dailyStats.set(key, {
      sessions: 0,
      points: 0,
    });
  }
  return dailyStats.get(key);
}

function ensureConfig(res) {
  if (!GAME_ID || !process.env.OGP_API_KEY || !process.env.OGP_API_SECRET_KEY) {
    res.status(500).json({
      error: "Server is missing Play.fun configuration.",
    });
    return false;
  }
  return true;
}

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/api/session/start", (req, res) => {
  const playerId = String(req.body?.playerId || "").trim();
  if (!playerId) {
    res.status(400).json({ error: "playerId is required" });
    return;
  }

  const now = Date.now();
  const stats = getPlayerDayStats(playerId, now);
  if (stats.sessions >= MAX_SESSIONS_PER_DAY) {
    res.status(429).json({ error: "Daily session limit reached" });
    return;
  }

  const sessionId = crypto.randomUUID();
  sessions.set(sessionId, {
    playerId,
    startedAt: now,
    submitted: false,
  });

  stats.sessions += 1;
  res.json({ sessionId, startedAt: now });
});

app.post("/api/session/finish", async (req, res) => {
  if (!ensureConfig(res)) return;

  const sessionId = String(req.body?.sessionId || "").trim();
  const playerId = String(req.body?.playerId || "").trim();
  const score = Number(req.body?.score || 0);
  const durationMs = Number(req.body?.durationMs || 0);

  if (!sessionId || !playerId) {
    res.status(400).json({ error: "sessionId and playerId are required" });
    return;
  }
  if (!Number.isFinite(score) || score < 0) {
    res.status(400).json({ error: "Invalid score" });
    return;
  }
  if (score > MAX_SCORE_PER_SESSION) {
    res.status(400).json({ error: "Score exceeds per-session limit" });
    return;
  }

  const session = sessions.get(sessionId);
  if (!session || session.playerId !== playerId) {
    res.status(400).json({ error: "Invalid session" });
    return;
  }
  if (session.submitted) {
    res.status(409).json({ error: "Session already submitted" });
    return;
  }

  const now = Date.now();
  if (now - session.startedAt > SESSION_TTL_MS) {
    res.status(400).json({ error: "Session expired" });
    return;
  }
  if (durationMs < MIN_SESSION_MS) {
    res.status(400).json({ error: "Session too short" });
    return;
  }

  const stats = getPlayerDayStats(playerId, now);
  if (stats.points + score > MAX_POINTS_PER_DAY) {
    res.status(429).json({ error: "Daily points limit reached" });
    return;
  }

  try {
    await client.play.savePoints({
      gameId: GAME_ID,
      playerId,
      points: score,
    });
  } catch (error) {
    res.status(502).json({
      error: "Failed to save points to Play.fun",
      detail: String(error?.message || error),
    });
    return;
  }

  session.submitted = true;
  stats.points += score;
  res.json({ ok: true, savedPoints: score });
});

const port = Number(process.env.PORT || 3000);
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Comet Escape API listening on :${port}`);
});
