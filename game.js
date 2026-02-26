const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const scoreEl = document.getElementById("score");
const bestEl = document.getElementById("best");
const overlay = document.getElementById("overlay");
const statusEl = document.getElementById("status");
const startBtn = document.getElementById("startBtn");
const leftBtn = document.getElementById("leftBtn");
const rightBtn = document.getElementById("rightBtn");

const backendUrl = String(window.PF_BACKEND_URL || "").replace(/\/+$/, "");

if (window.self !== window.top) {
  document.body.classList.add("embedded");
  document.documentElement.classList.add("embedded");
}

const lanes = [0.2, 0.4, 0.6, 0.8];
const laneCenters = lanes.map((ratio) => canvas.width * ratio);
const STAR_COUNT = 80;
const stars = [];

const player = {
  lane: 1,
  y: canvas.height - 110,
  radius: 22,
};

let running = false;
let paused = false;
let score = 0;
let best = Number(localStorage.getItem("comet_escape_best") || 0);
let sessionId = null;
let sessionStartedAt = 0;
let sessionStartToken = 0;
let rafId = 0;
let comets = [];
let cometTimer = 0;
let cometInterval = 0.9;
let speed = 220;
let lastTime = 0;
let holdLeft = false;
let holdRight = false;

const playerId = getPlayerId();
const shipBodyGradient = createShipBodyGradient();
const shipFlameGradient = createShipFlameGradient();

bestEl.textContent = String(best);

for (let i = 0; i < STAR_COUNT; i += 1) {
  stars.push({
    x: (i * 131) % canvas.width,
    y: (i * 89) % canvas.height,
    size: i % 5 === 0 ? 2 : 1,
    bright: i % 7 === 0,
  });
}

function createShipBodyGradient() {
  const gradient = ctx.createLinearGradient(0, -34, 0, 26);
  gradient.addColorStop(0, "#e8f7ff");
  gradient.addColorStop(1, "#8cb7d8");
  return gradient;
}

function createShipFlameGradient() {
  const gradient = ctx.createLinearGradient(0, 24, 0, 52);
  gradient.addColorStop(0, "rgba(255,245,180,1)");
  gradient.addColorStop(0.55, "rgba(255,130,60,0.95)");
  gradient.addColorStop(1, "rgba(255,70,20,0)");
  return gradient;
}

function getPlayerId() {
  const key = "comet_escape_player_id";
  let value = localStorage.getItem(key);
  if (value) return value;

  if (globalThis.crypto?.randomUUID) {
    value = crypto.randomUUID();
  } else {
    value = `player-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  localStorage.setItem(key, value);
  return value;
}

function postJson(url, payload, useBeacon = false) {
  if (useBeacon && navigator.sendBeacon) {
    const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
    const sent = navigator.sendBeacon(url, blob);
    if (sent) return;
  }

  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    keepalive: useBeacon,
  }).catch(() => {
    // Ignore transient network failures to keep gameplay smooth.
  });
}

async function startBackendSession() {
  if (!backendUrl) return;

  const token = ++sessionStartToken;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);

  try {
    const response = await fetch(`${backendUrl}/api/session/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerId }),
      signal: controller.signal,
    });

    if (!response.ok) return;
    const data = await response.json();

    if (token !== sessionStartToken || !running) return;
    sessionId = typeof data.sessionId === "string" ? data.sessionId : null;
    sessionStartedAt = Number(data.startedAt || Date.now());
  } catch (_error) {
    // Backend is optional for gameplay availability.
  } finally {
    clearTimeout(timeout);
  }
}

function finishBackendSession(finalScore) {
  if (!backendUrl || !sessionId) return;

  const payload = {
    sessionId,
    playerId,
    score: finalScore,
    durationMs: Math.max(0, Date.now() - sessionStartedAt),
  };

  postJson(`${backendUrl}/api/session/finish`, payload, true);
  sessionId = null;
}

function spawnComet() {
  const laneCount = laneCenters.length;
  let lane = Math.floor(Math.random() * laneCount);

  if (lane === player.lane && Math.random() < 0.8) {
    lane = (lane + 1 + Math.floor(Math.random() * (laneCount - 1))) % laneCount;
  }

  comets.push({
    lane,
    y: -40,
    radius: 20 + Math.random() * 10,
    spin: Math.random() * Math.PI * 2,
    spinSpeed: 2.5 + Math.random() * 2,
  });
}

function drawBackground(nowMs) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const scroll = (nowMs * 0.035) % canvas.height;

  for (let pass = 0; pass < 2; pass += 1) {
    ctx.fillStyle = pass === 0 ? "rgba(255,255,255,.35)" : "rgba(255,255,255,.85)";
    for (let i = 0; i < stars.length; i += 1) {
      const star = stars[i];
      if ((pass === 0 && star.bright) || (pass === 1 && !star.bright)) continue;

      let y = star.y + scroll;
      if (y >= canvas.height) y -= canvas.height;
      ctx.fillRect(star.x, y, star.size, star.size);
    }
  }

  ctx.strokeStyle = "rgba(255,255,255,.12)";
  ctx.lineWidth = 2;

  for (let i = 1; i < laneCenters.length; i += 1) {
    const x = (laneCenters[i - 1] + laneCenters[i]) / 2;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }
}

function drawShip(nowMs) {
  const x = laneCenters[player.lane];
  const y = player.y;
  const wobble = Math.sin(nowMs * 0.01) * 1.5;
  const flameOffset = Math.sin(nowMs * 0.04) * 3;

  ctx.save();
  ctx.translate(x, y + wobble);

  ctx.fillStyle = shipBodyGradient;
  ctx.beginPath();
  ctx.moveTo(0, -36);
  ctx.lineTo(16, -8);
  ctx.lineTo(16, 18);
  ctx.lineTo(-16, 18);
  ctx.lineTo(-16, -8);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#ff6666";
  ctx.beginPath();
  ctx.moveTo(0, -44);
  ctx.lineTo(13, -16);
  ctx.lineTo(-13, -16);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#ff5f5f";
  ctx.beginPath();
  ctx.moveTo(-16, 8);
  ctx.lineTo(-28, 18);
  ctx.lineTo(-16, 18);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(16, 8);
  ctx.lineTo(28, 18);
  ctx.lineTo(16, 18);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#2f4763";
  ctx.fillRect(-7, 18, 14, 6);

  ctx.fillStyle = shipFlameGradient;
  ctx.beginPath();
  ctx.moveTo(0, 22);
  ctx.lineTo(8, 40);
  ctx.lineTo(0, 50 + flameOffset);
  ctx.lineTo(-8, 40);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#6cd6ff";
  ctx.beginPath();
  ctx.arc(0, -3, 6.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,.8)";
  ctx.lineWidth = 1.8;
  ctx.stroke();

  ctx.restore();
}

function drawComet(comet) {
  const x = laneCenters[comet.lane];
  const y = comet.y;
  const tailLen = 80 + comet.radius * 1.4;
  const sway = Math.sin(comet.spin * 1.7) * 8;

  ctx.save();
  ctx.translate(x, y + sway * 0.2);

  ctx.globalAlpha = 0.8;
  ctx.fillStyle = "#ffb84d";
  ctx.beginPath();
  ctx.moveTo(-comet.radius * 0.75, -1);
  ctx.quadraticCurveTo(-22 + sway, -tailLen * 0.45, -8 + sway, -tailLen);
  ctx.quadraticCurveTo(0, -tailLen - 10, 8 - sway, -tailLen);
  ctx.quadraticCurveTo(22 - sway, -tailLen * 0.45, comet.radius * 0.75, -1);
  ctx.closePath();
  ctx.fill();

  ctx.globalAlpha = 0.35;
  ctx.fillStyle = "#ff7a3a";
  ctx.beginPath();
  ctx.arc(0, 0, comet.radius * 1.8, 0, Math.PI * 2);
  ctx.fill();

  ctx.globalAlpha = 1;
  ctx.fillStyle = "#d15339";
  ctx.beginPath();
  ctx.arc(0, 0, comet.radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "rgba(255,245,200,.9)";
  ctx.beginPath();
  ctx.arc(comet.radius * 0.2, -comet.radius * 0.24, comet.radius * 0.2, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "rgba(255,165,90,.45)";
  ctx.beginPath();
  ctx.arc(-comet.radius * 0.33, comet.radius * 0.2, comet.radius * 0.24, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function showOverlay(text, buttonText) {
  statusEl.textContent = text;
  startBtn.textContent = buttonText;
  overlay.classList.remove("hidden");
}

function crash() {
  sessionStartToken += 1;
  running = false;
  paused = false;
  finishBackendSession(score);
  showOverlay(`Game Over. Score: ${score}. Press \"Play Again\".`, "Play Again");
}

function pauseGame() {
  if (!running || paused) return;
  paused = true;
  showOverlay("Paused. Press Space or the button below to continue.", "Resume");

  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = 0;
  }
}

function resumeGame() {
  if (!running || !paused) return;
  paused = false;
  overlay.classList.add("hidden");
  lastTime = performance.now();

  if (!rafId) {
    rafId = requestAnimationFrame(loop);
  }
}

function togglePause() {
  if (!running) return;
  if (paused) resumeGame();
  else pauseGame();
}

function update(delta) {
  if (holdLeft) player.lane = Math.max(0, player.lane - 1);
  if (holdRight) player.lane = Math.min(laneCenters.length - 1, player.lane + 1);
  holdLeft = false;
  holdRight = false;

  cometTimer += delta;
  if (cometTimer >= cometInterval) {
    cometTimer = 0;
    spawnComet();
  }

  speed += delta * 7;
  cometInterval = Math.max(0.35, cometInterval - delta * 0.006);

  const px = laneCenters[player.lane];
  const py = player.y;

  let writeIndex = 0;
  for (let readIndex = 0; readIndex < comets.length; readIndex += 1) {
    const comet = comets[readIndex];
    comet.y += speed * delta;
    comet.spin += delta * comet.spinSpeed;

    const dx = px - laneCenters[comet.lane];
    const dy = py - comet.y;
    const threshold = player.radius + comet.radius - 3;

    if (dx * dx + dy * dy < threshold * threshold) {
      crash();
      return;
    }

    if (comet.y > canvas.height + 60) {
      score += 1;
      continue;
    }

    comets[writeIndex] = comet;
    writeIndex += 1;
  }

  if (writeIndex !== comets.length) {
    comets.length = writeIndex;
    scoreEl.textContent = String(score);

    if (score > best) {
      best = score;
      bestEl.textContent = String(best);
      localStorage.setItem("comet_escape_best", String(best));
    }
  }
}

function render(nowMs) {
  drawBackground(nowMs);

  for (let i = 0; i < comets.length; i += 1) {
    drawComet(comets[i]);
  }

  drawShip(nowMs);
}

function loop(timestamp) {
  rafId = 0;

  if (!running || paused) {
    render(timestamp);
    return;
  }

  if (!lastTime) lastTime = timestamp;
  const delta = Math.min(0.05, (timestamp - lastTime) / 1000);
  lastTime = timestamp;

  update(delta);
  render(timestamp);

  if (running && !paused) {
    rafId = requestAnimationFrame(loop);
  }
}

function startGame() {
  if (running && paused) {
    resumeGame();
    return;
  }

  score = 0;
  sessionId = null;
  sessionStartToken += 1;
  speed = 220;
  cometTimer = 0;
  cometInterval = 0.9;
  comets = [];
  paused = false;
  player.lane = 1;
  scoreEl.textContent = "0";
  statusEl.textContent = "Dodge the comets. Arrow keys / A D / swipes.";
  overlay.classList.add("hidden");
  startBtn.textContent = "Start";
  running = true;
  lastTime = 0;
  sessionStartedAt = Date.now();
  startBackendSession();

  if (!rafId) {
    rafId = requestAnimationFrame(loop);
  }
}

function moveLeft() {
  holdLeft = true;
}

function moveRight() {
  holdRight = true;
}

startBtn.addEventListener("click", startGame);

window.addEventListener("keydown", (event) => {
  if (event.code === "Space") {
    event.preventDefault();
    if (event.repeat) return;

    if (running) {
      togglePause();
      return;
    }

    startGame();
    return;
  }

  const key = event.key.toLowerCase();
  if (key === "arrowleft" || key === "a") moveLeft();
  if (key === "arrowright" || key === "d") moveRight();
});

leftBtn.addEventListener("touchstart", (event) => {
  event.preventDefault();
  moveLeft();
});
leftBtn.addEventListener("mousedown", moveLeft);

rightBtn.addEventListener("touchstart", (event) => {
  event.preventDefault();
  moveRight();
});
rightBtn.addEventListener("mousedown", moveRight);

let touchStartX = 0;
canvas.addEventListener(
  "touchstart",
  (event) => {
    touchStartX = event.changedTouches[0].clientX;
  },
  { passive: true },
);

canvas.addEventListener(
  "touchend",
  (event) => {
    const endX = event.changedTouches[0].clientX;
    const dx = endX - touchStartX;

    if (Math.abs(dx) < 18) return;
    if (dx < 0) moveLeft();
    if (dx > 0) moveRight();
  },
  { passive: true },
);

window.addEventListener("beforeunload", () => {
  if (running && sessionId) {
    finishBackendSession(score);
  }
});

window.addEventListener("pagehide", () => {
  if (running && sessionId) {
    finishBackendSession(score);
  }
});

render(performance.now());
