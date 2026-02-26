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
let comets = [];
let cometTimer = 0;
let cometInterval = 0.9;
let speed = 220;
let lastTime = 0;
let holdLeft = false;
let holdRight = false;

bestEl.textContent = best.toString();

function getPlayerId() {
  const key = "comet_escape_player_id";
  let playerId = localStorage.getItem(key);
  if (!playerId) {
    playerId = crypto.randomUUID();
    localStorage.setItem(key, playerId);
  }
  return playerId;
}

async function startBackendSession() {
  if (!backendUrl) return;
  try {
    const response = await fetch(`${backendUrl}/api/session/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerId: getPlayerId() }),
    });
    if (!response.ok) return;
    const data = await response.json();
    sessionId = data.sessionId || null;
    sessionStartedAt = Number(data.startedAt || Date.now());
  } catch (_err) {
    // Keep gameplay working even if backend is temporarily unavailable.
  }
}

async function finishBackendSession(finalScore) {
  if (!backendUrl || !sessionId) return;
  try {
    await fetch(`${backendUrl}/api/session/finish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId,
        playerId: getPlayerId(),
        score: finalScore,
        durationMs: Date.now() - sessionStartedAt,
      }),
    });
  } catch (_err) {
    // Do nothing; failed submissions should not break the game loop.
  } finally {
    sessionId = null;
  }
}

function laneX(index) {
  return canvas.width * lanes[index];
}

function spawnComet() {
  const forbiddenLane = player.lane;
  const allowed = lanes
    .map((_, i) => i)
    .filter((index) => index !== forbiddenLane || Math.random() > 0.8);

  const lane = allowed[Math.floor(Math.random() * allowed.length)];

  comets.push({
    lane,
    y: -40,
    radius: 20 + Math.random() * 10,
    spin: Math.random() * Math.PI * 2,
  });
}

function drawBackground() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  for (let i = 0; i < 80; i += 1) {
    const x = (i * 131) % canvas.width;
    const y = (i * 89 + score * 6) % canvas.height;
    ctx.fillStyle = i % 7 === 0 ? "rgba(255,255,255,.85)" : "rgba(255,255,255,.35)";
    ctx.fillRect(x, y, 2, 2);
  }

  ctx.strokeStyle = "rgba(255,255,255,.12)";
  ctx.lineWidth = 2;
  for (let i = 1; i < lanes.length; i += 1) {
    const x = laneX(i - 1) + (laneX(i) - laneX(i - 1)) / 2;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }
}

function drawShip() {
  const x = laneX(player.lane);
  const y = player.y;
  const wobble = Math.sin(performance.now() * 0.01) * 1.5;

  ctx.save();
  ctx.translate(x, y + wobble);

  const bodyGrad = ctx.createLinearGradient(0, -34, 0, 26);
  bodyGrad.addColorStop(0, "#e8f7ff");
  bodyGrad.addColorStop(1, "#8cb7d8");
  ctx.fillStyle = bodyGrad;
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

  const flameGrad = ctx.createLinearGradient(0, 24, 0, 52);
  flameGrad.addColorStop(0, "rgba(255,245,180,1)");
  flameGrad.addColorStop(0.55, "rgba(255,130,60,0.95)");
  flameGrad.addColorStop(1, "rgba(255,70,20,0)");
  ctx.fillStyle = flameGrad;
  ctx.beginPath();
  ctx.moveTo(0, 22);
  ctx.lineTo(8, 40);
  ctx.lineTo(0, 50 + Math.sin(performance.now() * 0.04) * 3);
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
  const x = laneX(comet.lane);
  const y = comet.y;
  const tailLen = 90 + comet.radius * 1.6;
  const sway = Math.sin(comet.spin * 1.7) * 8;

  ctx.save();
  ctx.translate(x, y + sway * 0.15);

  const tailGrad = ctx.createLinearGradient(0, 16, 0, -tailLen);
  tailGrad.addColorStop(0, "rgba(255,220,120,0.92)");
  tailGrad.addColorStop(0.35, "rgba(255,140,60,0.7)");
  tailGrad.addColorStop(1, "rgba(255,70,20,0)");
  ctx.fillStyle = tailGrad;
  ctx.beginPath();
  ctx.moveTo(-comet.radius * 0.8, -2);
  ctx.quadraticCurveTo(-26 + sway, -tailLen * 0.45, -10 + sway, -tailLen);
  ctx.quadraticCurveTo(0, -tailLen - 12, 10 - sway, -tailLen);
  ctx.quadraticCurveTo(26 - sway, -tailLen * 0.45, comet.radius * 0.8, -2);
  ctx.closePath();
  ctx.fill();

  const aura = ctx.createRadialGradient(0, 0, comet.radius * 0.2, 0, 0, comet.radius * 2);
  aura.addColorStop(0, "rgba(255,250,180,0.45)");
  aura.addColorStop(1, "rgba(255,120,40,0)");
  ctx.fillStyle = aura;
  ctx.beginPath();
  ctx.arc(0, 0, comet.radius * 2, 0, Math.PI * 2);
  ctx.fill();

  const rockGrad = ctx.createRadialGradient(
    -comet.radius * 0.25,
    -comet.radius * 0.35,
    comet.radius * 0.2,
    0,
    0,
    comet.radius,
  );
  rockGrad.addColorStop(0, "#ffb07a");
  rockGrad.addColorStop(0.55, "#f06c4f");
  rockGrad.addColorStop(1, "#a83e2e");
  ctx.fillStyle = rockGrad;
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

function crash() {
  running = false;
  paused = false;
  finishBackendSession(score);
  overlay.classList.remove("hidden");
  statusEl.textContent = `Game Over. Score: ${score}. Press "Play Again".`;
  startBtn.textContent = "Play Again";
}

function pauseGame() {
  if (!running || paused) return;
  paused = true;
  overlay.classList.remove("hidden");
  statusEl.textContent = "Paused. Press Space or the button below to continue.";
  startBtn.textContent = "Resume";
}

function resumeGame() {
  if (!running || !paused) return;
  paused = false;
  overlay.classList.add("hidden");
}

function togglePause() {
  if (!running) return;
  if (paused) resumeGame();
  else pauseGame();
}

function update(delta) {
  if (holdLeft) player.lane = Math.max(0, player.lane - 1);
  if (holdRight) player.lane = Math.min(lanes.length - 1, player.lane + 1);
  holdLeft = false;
  holdRight = false;

  cometTimer += delta;
  if (cometTimer >= cometInterval) {
    cometTimer = 0;
    spawnComet();
  }

  speed += delta * 7;
  cometInterval = Math.max(0.35, cometInterval - delta * 0.006);

  for (let i = comets.length - 1; i >= 0; i -= 1) {
    const comet = comets[i];
    comet.y += speed * delta;
    comet.spin += delta * 4;

    const px = laneX(player.lane);
    const py = player.y;
    const cx = laneX(comet.lane);
    const cy = comet.y;
    const dx = px - cx;
    const dy = py - cy;
    const distanceSq = dx * dx + dy * dy;
    const threshold = (player.radius + comet.radius - 3) ** 2;
    if (distanceSq < threshold) {
      crash();
      return;
    }

    if (comet.y > canvas.height + 60) {
      comets.splice(i, 1);
      score += 1;
      scoreEl.textContent = score.toString();
      if (score > best) {
        best = score;
        bestEl.textContent = best.toString();
        localStorage.setItem("comet_escape_best", String(best));
      }
    }
  }
}

function render() {
  drawBackground();
  for (const comet of comets) drawComet(comet);
  drawShip();
}

function loop(timestamp) {
  if (!running) {
    render();
    return;
  }

  if (paused) {
    render();
    requestAnimationFrame(loop);
    return;
  }

  if (!lastTime) lastTime = timestamp;
  const delta = Math.min(0.05, (timestamp - lastTime) / 1000);
  lastTime = timestamp;
  update(delta);
  render();
  requestAnimationFrame(loop);
}

function startGame() {
  if (running && paused) {
    resumeGame();
    return;
  }

  score = 0;
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
  requestAnimationFrame(loop);
}

function moveLeft() {
  holdLeft = true;
}

function moveRight() {
  holdRight = true;
}

startBtn.addEventListener("click", startGame);

window.addEventListener("keydown", (event) => {
  if (event.code === "Space" && event.repeat) return;

  if (event.code === "Space" && running) {
    togglePause();
    return;
  }

  if (!running && event.code === "Space") {
    startGame();
    return;
  }
  if (event.key === "ArrowLeft" || event.key.toLowerCase() === "a") moveLeft();
  if (event.key === "ArrowRight" || event.key.toLowerCase() === "d") moveRight();
});

leftBtn.addEventListener("touchstart", (e) => {
  e.preventDefault();
  moveLeft();
});
leftBtn.addEventListener("mousedown", moveLeft);

rightBtn.addEventListener("touchstart", (e) => {
  e.preventDefault();
  moveRight();
});
rightBtn.addEventListener("mousedown", moveRight);

let touchStartX = 0;
canvas.addEventListener(
  "touchstart",
  (e) => {
    touchStartX = e.changedTouches[0].clientX;
  },
  { passive: true },
);

canvas.addEventListener(
  "touchend",
  (e) => {
    const endX = e.changedTouches[0].clientX;
    const dx = endX - touchStartX;
    if (Math.abs(dx) < 18) return;
    if (dx < 0) moveLeft();
    if (dx > 0) moveRight();
  },
  { passive: true },
);

render();
