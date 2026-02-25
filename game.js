const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const scoreEl = document.getElementById("score");
const bestEl = document.getElementById("best");
const overlay = document.getElementById("overlay");
const statusEl = document.getElementById("status");
const startBtn = document.getElementById("startBtn");
const leftBtn = document.getElementById("leftBtn");
const rightBtn = document.getElementById("rightBtn");

const lanes = [0.2, 0.4, 0.6, 0.8];
const player = {
  lane: 1,
  y: canvas.height - 110,
  radius: 22,
};

let running = false;
let score = 0;
let best = Number(localStorage.getItem("comet_escape_best") || 0);
let comets = [];
let cometTimer = 0;
let cometInterval = 0.9;
let speed = 220;
let lastTime = 0;
let holdLeft = false;
let holdRight = false;

bestEl.textContent = best.toString();

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

  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = "#5bc0be";
  ctx.beginPath();
  ctx.moveTo(0, -player.radius - 6);
  ctx.lineTo(player.radius, player.radius);
  ctx.lineTo(-player.radius, player.radius);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#ffd166";
  ctx.beginPath();
  ctx.arc(0, 4, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawComet(comet) {
  const x = laneX(comet.lane);
  const y = comet.y;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(comet.spin);
  ctx.fillStyle = "#f26d5b";
  ctx.beginPath();
  ctx.arc(0, 0, comet.radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#ffd7c8";
  ctx.beginPath();
  ctx.arc(comet.radius * 0.25, -comet.radius * 0.2, comet.radius * 0.22, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function crash() {
  running = false;
  overlay.classList.remove("hidden");
  statusEl.textContent = `Игра окончена. Счёт: ${score}. Нажми "Ещё раз".`;
  startBtn.textContent = "Ещё раз";
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

  if (!lastTime) lastTime = timestamp;
  const delta = Math.min(0.05, (timestamp - lastTime) / 1000);
  lastTime = timestamp;
  update(delta);
  render();
  requestAnimationFrame(loop);
}

function startGame() {
  score = 0;
  speed = 220;
  cometTimer = 0;
  cometInterval = 0.9;
  comets = [];
  player.lane = 1;
  scoreEl.textContent = "0";
  statusEl.textContent = "Уклоняйся от комет. Стрелки / A D / свайпы.";
  overlay.classList.add("hidden");
  startBtn.textContent = "Старт";
  running = true;
  lastTime = 0;
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
