/* ═══════════════════════════════════════════
   Smart Traffic Light — Frontend JS (v4)
   Correções definitivas:
   - Semáforos FORA da interseção
   - Verde funciona (não só amarelo/vermelho)
   - Veículos param no vermelho/amarelo e seguem no verde
   - Espaçamento mínimo entre veículos
   - Removidos os "fantasmas" azuis (drawQueue visual)
   - Sincronismo luz ↔ veículo
═══════════════════════════════════════════ */

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(btn.dataset.page).classList.add('active');
    if (btn.dataset.page === 'page-sim') resizeCanvas();
  });
});

// ── Estado ────────────────────────────────────────────────────────────────
let simRunning  = false;
let simInterval = null;
let waitHistory = [];
let lights  = { N: 'red', S: 'red', E: 'red', W: 'red' };
let queues  = { N: 0, S: 0, E: 0, W: 0 };
let vehicles = [];
let currentGreenPair = 'NS';
let yellowFramesLeft = 0;
let previousGreenPair = null;
const YELLOW_DURATION = 12; // frames de amarelo (~3.6s com interval 300ms)

const C = {
  bg:     '#07152A',
  road:   '#1A2E4A',
  line:   '#4FC3F7',
  grass:  '#0A1F1A',
  red:    '#FF1744',
  yellow: '#FFEA00',
  green:  '#00E676',
  cars:   ['#4FC3F7','#7C4DFF','#1B6EF3','#4CAF50','#FDD835','#FF7043','#EC407A','#26C6DA','#AB47BC','#66BB6A','#FFA726','#42A5F5'],
  dim:    '#90CAF9',
};

const canvas = document.getElementById('sim-canvas');
const ctx    = canvas.getContext('2d');

function resizeCanvas() {
  const wrap = canvas.parentElement;
  const size = Math.min(wrap.clientWidth, 520);
  canvas.width  = size;
  canvas.height = size;
  if (!simRunning) drawScene();
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// ── Tipos de veículo ──────────────────────────────────────────────────────
const VEHICLE_TYPES = [
  { type: 'car',   w: 0.036, h: 0.020, prob: 0.62 },
  { type: 'bus',   w: 0.052, h: 0.024, prob: 0.20 },
  { type: 'truck', w: 0.058, h: 0.026, prob: 0.18 },
];

function pickType() {
  const r = Math.random();
  let acc = 0;
  for (const t of VEHICLE_TYPES) { acc += t.prob; if (r < acc) return t; }
  return VEHICLE_TYPES[0];
}

function spawnVehicle(dir) {
  if (vehicles.length >= 18) return;
  if (Math.random() > 0.42) return;

  const W = canvas.width;
  const cx = W / 2, cy = W / 2;
  const t = pickType();
  const speed = W * (0.0018 + Math.random() * 0.0010);
  const laneOffset = (Math.random() - 0.5) * W * 0.028;

  let x, y, dx, dy, stopLine;

  switch (dir) {
    case 'N': // desce
      x = cx - W*0.035 + laneOffset;
      y = -W * 0.08;
      dx = 0; dy = speed;
      stopLine = cy - W * 0.155;
      break;
    case 'S': // sobe
      x = cx + W*0.035 + laneOffset;
      y = W + W * 0.08;
      dx = 0; dy = -speed;
      stopLine = cy + W * 0.155;
      break;
    case 'E': // esquerda
      x = W + W * 0.08;
      y = cy - W*0.035 + laneOffset;
      dx = -speed; dy = 0;
      stopLine = cx + W * 0.155;
      break;
    case 'W': // direita
      x = -W * 0.08;
      y = cy + W*0.035 + laneOffset;
      dx = speed; dy = 0;
      stopLine = cx - W * 0.155;
      break;
  }

  // Evita spawn muito perto de outro veículo na mesma direção
  const minGap = W * 0.07;
  const tooClose = vehicles.some(v => {
    if (v.dir !== dir) return false;
    const dist = Math.abs(v.x - x) + Math.abs(v.y - y);
    return dist < minGap;
  });
  if (tooClose) return;

  vehicles.push({
    x, y, dx, dy, dir,
    type: t.type, w: t.w, h: t.h,
    color: C.cars[Math.floor(Math.random() * C.cars.length)],
    stopLine, life: 600,
  });
}

function lightAllows(dir) {
  // Durante amarelo: só o par que ESTAVA verde fica amarelo (deve parar)
  // O novo par ainda está vermelho
  if (yellowFramesLeft > 0) {
    // Ninguém passa no amarelo
    return false;
  }
  if (currentGreenPair === 'NS') return dir === 'N' || dir === 'S';
  if (currentGreenPair === 'EW') return dir === 'E' || dir === 'W';
  return false;
}

function updateVehicles() {
  const W = canvas.width;

  // Remove fora da tela / vida esgotada
  vehicles = vehicles.filter(v => {
    v.life--;
    if (v.life <= 0) return false;
    if (v.x < -W*0.25 || v.x > W*1.25 || v.y < -W*0.25 || v.y > W*1.25) return false;
    return true;
  });

  // Ordena por direção para aplicar espaçamento na fila
  const byDir = { N: [], S: [], E: [], W: [] };
  vehicles.forEach(v => byDir[v.dir].push(v));

  // Ordena cada fila (quem está mais perto da linha de parada primeiro)
  byDir.N.sort((a,b) => b.y - a.y); // maior y = mais perto (vindo de cima)
  byDir.S.sort((a,b) => a.y - b.y);
  byDir.E.sort((a,b) => a.x - b.x);
  byDir.W.sort((a,b) => b.x - a.x);

  const minGap = W * 0.055;

  ['N','S','E','W'].forEach(dir => {
    const list = byDir[dir];
    list.forEach((v, idx) => {
      const canGo = lightAllows(dir);

      // Distância até a linha de parada
      let distToStop;
      if (dir === 'N') distToStop = v.stopLine - v.y;
      else if (dir === 'S') distToStop = v.y - v.stopLine;
      else if (dir === 'E') distToStop = v.x - v.stopLine;
      else distToStop = v.stopLine - v.x;

      const pastLine = distToStop < -W * 0.03;

      // Espaçamento em relação ao veículo da frente na mesma fila
      let blockedByFront = false;
      if (idx > 0) {
        const front = list[idx - 1];
        const gap = Math.abs(front.x - v.x) + Math.abs(front.y - v.y);
        if (gap < minGap) blockedByFront = true;
      }

      if ((!canGo && !pastLine && distToStop < W * 0.10) || blockedByFront) {
        // Para
        if (dir === 'N' && v.y > v.stopLine - (idx * minGap)) {
          v.y = Math.min(v.y, v.stopLine - idx * minGap);
        } else if (dir === 'S' && v.y < v.stopLine + (idx * minGap)) {
          v.y = Math.max(v.y, v.stopLine + idx * minGap);
        } else if (dir === 'E' && v.x < v.stopLine + (idx * minGap)) {
          v.x = Math.max(v.x, v.stopLine + idx * minGap);
        } else if (dir === 'W' && v.x > v.stopLine - (idx * minGap)) {
          v.x = Math.min(v.x, v.stopLine - idx * minGap);
        }
        // não move
      } else {
        // Segue
        v.x += v.dx;
        v.y += v.dy;
      }
    });
  });
}

function drawVehicle(v, W) {
  const cw = W * v.w, ch = W * v.h;
  ctx.save();
  ctx.translate(v.x, v.y);
  if (v.dir === 'S') ctx.rotate(Math.PI);
  else if (v.dir === 'E') ctx.rotate(-Math.PI / 2);
  else if (v.dir === 'W') ctx.rotate(Math.PI / 2);

  // Corpo
  ctx.fillStyle = v.color;
  ctx.beginPath();
  ctx.roundRect(-cw/2, -ch/2, cw, ch, W*0.005);
  ctx.fill();

  // Detalhes
  if (v.type === 'car') {
    ctx.fillStyle = 'rgba(15,30,60,0.55)';
    ctx.fillRect(-cw*0.30, -ch*0.38, cw*0.60, ch*0.30);
    ctx.fillStyle = '#FFF9C4';
    ctx.fillRect(-cw*0.40, -ch*0.12, cw*0.14, ch*0.14);
    ctx.fillRect(cw*0.26, -ch*0.12, cw*0.14, ch*0.14);
  } else if (v.type === 'bus') {
    ctx.fillStyle = 'rgba(15,30,60,0.5)';
    for (let i = 0; i < 4; i++) {
      ctx.fillRect(-cw*0.40 + i*cw*0.21, -ch*0.35, cw*0.15, ch*0.25);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.fillRect(-cw/2, ch*0.18, cw, ch*0.12);
  } else {
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(-cw*0.48, -ch*0.42, cw*0.38, ch*0.84);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(-cw*0.05, -ch*0.38, cw*0.48, ch*0.76);
  }

  ctx.restore();
}

function drawScene() {
  const W = canvas.width, H = canvas.height;
  const cx = W / 2, cy = H / 2;
  const rw = W * 0.115;

  // Fundo
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);

  // Canteiros
  ctx.fillStyle = C.grass;
  ctx.fillRect(0, 0, cx - rw, cy - rw);
  ctx.fillRect(cx + rw, 0, W - (cx + rw), cy - rw);
  ctx.fillRect(0, cy + rw, cx - rw, H - (cy + rw));
  ctx.fillRect(cx + rw, cy + rw, W - (cx + rw), H - (cy + rw));

  // Pistas
  ctx.fillStyle = C.road;
  ctx.fillRect(cx - rw, 0, rw * 2, H);
  ctx.fillRect(0, cy - rw, W, rw * 2);

  // Linhas centrais
  ctx.strokeStyle = C.line;
  ctx.lineWidth = Math.max(1.5, W * 0.0025);
  ctx.setLineDash([W * 0.022, W * 0.018]);
  [[cx, 0, cx, cy - rw], [cx, cy + rw, cx, H], [0, cy, cx - rw, cy], [cx + rw, cy, W, cy]]
    .forEach(([x1,y1,x2,y2]) => {
      ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
    });
  ctx.setLineDash([]);

  // Interseção
  ctx.fillStyle = '#122030';
  ctx.fillRect(cx - rw, cy - rw, rw * 2, rw * 2);

  // Faixa de pedestres
  ctx.fillStyle = '#1E3A5A';
  for (let i = 0; i < 5; i++) {
    ctx.fillRect(cx - rw + 5, cy - rw + i * (rw * 0.36), rw * 2 - 10, rw * 0.13);
  }

  // ══════════════════════════════════════════════════
  // SEMÁFOROS — bem FORA da via (cantos externos)
  // ══════════════════════════════════════════════════
  const margin = W * 0.095; // distância extra da borda da pista
  const sp = {
    // N: canto superior-esquerdo, fora da pista vertical e horizontal
    N: [cx - rw - margin, cy - rw - margin],
    // S: canto inferior-direito
    S: [cx + rw + margin * 0.25, cy + rw + margin * 0.25],
    // E: canto superior-direito
    E: [cx + rw + margin * 0.25, cy - rw - margin],
    // W: canto inferior-esquerdo
    W: [cx - rw - margin, cy + rw + margin * 0.25],
  };

  Object.entries(sp).forEach(([dir, [sx, sy]]) => {
    drawSemaforo(sx, sy, lights[dir], W);
    ctx.fillStyle = C.dim;
    ctx.font = `bold ${Math.max(11, W * 0.024)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(dir, sx + W * 0.019, sy + W * 0.135);
  });

  // Veículos (sem barras de fila fantasma)
  vehicles.forEach(v => drawVehicle(v, W));
}

function drawSemaforo(x, y, phase, W) {
  const bw = W * 0.038, bh = W * 0.105, r = W * 0.014;

  // Caixa
  ctx.fillStyle = '#0A1525';
  ctx.strokeStyle = '#1B6EF3';
  ctx.lineWidth = Math.max(1.5, W * 0.0025);
  ctx.beginPath();
  ctx.roundRect(x, y, bw, bh, W * 0.008);
  ctx.fill();
  ctx.stroke();

  const phases = ['red', 'yellow', 'green'];
  const cols   = [C.red, C.yellow, C.green];

  phases.forEach((p, i) => {
    const active = (phase === p);
    const ly = y + bh * 0.17 + i * bh * 0.30;

    // Fundo do LED
    ctx.beginPath();
    ctx.arc(x + bw / 2, ly, r, 0, Math.PI * 2);
    ctx.fillStyle = '#0D1A2A';
    ctx.fill();

    if (active) {
      // Glow LED forte
      ctx.shadowColor = cols[i];
      ctx.shadowBlur  = W * 0.055;
      ctx.beginPath();
      ctx.arc(x + bw / 2, ly, r * 0.90, 0, Math.PI * 2);
      ctx.fillStyle = cols[i];
      ctx.fill();
      ctx.shadowBlur = 0;

      // Núcleo branco
      ctx.beginPath();
      ctx.arc(x + bw / 2, ly, r * 0.40, 0, Math.PI * 2);
      ctx.fillStyle = '#FFFFFF';
      ctx.globalAlpha = 0.80;
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  });
  ctx.shadowBlur = 0;
}

// ── Gráfico ───────────────────────────────────────────────────────────────
function drawLiveChart() {
  const c = document.getElementById('live-chart');
  if (!c) return;
  const x = c.getContext('2d');
  c.width = c.offsetWidth || 280;
  c.height = 90;
  const W = c.width, H = c.height;
  x.clearRect(0, 0, W, H);
  if (waitHistory.length < 2) return;
  const max = Math.max(...waitHistory, 1);
  x.strokeStyle = '#4FC3F7';
  x.lineWidth = 2;
  x.beginPath();
  waitHistory.forEach((v, i) => {
    const px = (i / (waitHistory.length - 1)) * W;
    const py = H - (v / max) * (H - 10) - 5;
    i === 0 ? x.moveTo(px, py) : x.lineTo(px, py);
  });
  x.stroke();
  const grad = x.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, 'rgba(79,195,247,0.25)');
  grad.addColorStop(1, 'rgba(79,195,247,0)');
  x.lineTo(W, H); x.lineTo(0, H); x.closePath();
  x.fillStyle = grad; x.fill();
  x.fillStyle = '#90CAF9'; x.font = '10px sans-serif';
  x.fillText('Espera média', 4, 12);
}

// ── Painel + máquina de estados das luzes ─────────────────────────────────
function updatePanel(snap) {
  document.getElementById('m-cycle').textContent   = snap.cycle || 0;
  document.getElementById('m-waiting').textContent = snap.total_waiting || 0;
  document.getElementById('m-passed').textContent  = snap.passed || 0;
  document.getElementById('m-avgwait').textContent = snap.avg_wait || 0;

  ['N','S','E','W'].forEach(d => {
    const q = (snap.queues || {})[d] || 0;
    const bar = document.getElementById('q-bar-' + d);
    const num = document.getElementById('q-num-' + d);
    if (bar) bar.style.width = Math.min(q / 10 * 100, 100) + '%';
    if (num) num.textContent = q;
  });

  const gp = snap.green_pair || 'NS';

  // Detecta mudança de fase → inicia amarelo
  if (previousGreenPair !== null && previousGreenPair !== gp && yellowFramesLeft <= 0) {
    yellowFramesLeft = YELLOW_DURATION;
    // previousGreenPair continua sendo o par que estava verde (para amarelo)
  } else if (yellowFramesLeft <= 0) {
    previousGreenPair = gp;
  }

  currentGreenPair = gp;

  // Define cores dos semáforos
  ['N','S','E','W'].forEach(d => {
    let phase;
    const isInCurrentGreen = (gp === 'NS' && (d === 'N' || d === 'S')) ||
                             (gp === 'EW' && (d === 'E' || d === 'W'));
    const isInPreviousGreen = previousGreenPair &&
      ((previousGreenPair === 'NS' && (d === 'N' || d === 'S')) ||
       (previousGreenPair === 'EW' && (d === 'E' || d === 'W')));

    if (yellowFramesLeft > 0) {
      // Par que estava verde → amarelo; o resto vermelho
      phase = isInPreviousGreen ? 'yellow' : 'red';
    } else {
      // Normal: verde no par ativo, vermelho no outro
      phase = isInCurrentGreen ? 'green' : 'red';
    }

    lights[d] = phase;
    const el = document.getElementById('light-' + d);
    if (el) el.className = 'light-circle ' + phase;
  });

  if (yellowFramesLeft > 0) {
    yellowFramesLeft--;
    if (yellowFramesLeft <= 0) {
      previousGreenPair = gp; // sincroniza após o amarelo
    }
  }

  queues = snap.queues || queues;

  if (snap.agent) {
    const box = document.getElementById('agent-box');
    if (box) {
      document.getElementById('agent-epsilon').textContent = snap.agent.epsilon;
      document.getElementById('agent-qtable').textContent  = snap.agent.q_table_size;
      document.getElementById('agent-reward').textContent  = snap.agent.total_reward;
      document.getElementById('agent-steps').textContent   = snap.agent.steps;
      box.style.display = 'block';
    }
  }

  waitHistory.push(snap.avg_wait || 0);
  if (waitHistory.length > 60) waitHistory.shift();
  drawLiveChart();
}

async function simLoop() {
  try {
    const res = await fetch('/api/step', { method: 'POST' });
    if (!res.ok) { stopSim(); return; }
    const snap = await res.json();
    if (snap.error) { stopSim(); return; }

    updateVehicles();

    // Spawn controlado
    if (vehicles.length < 16 && Math.random() < 0.50) {
      spawnVehicle(['N','S','E','W'][Math.floor(Math.random() * 4)]);
    }
    if (vehicles.length < 10 && Math.random() < 0.40) {
      spawnVehicle(['N','S','E','W'][Math.floor(Math.random() * 4)]);
    }

    updatePanel(snap);
    drawScene();
  } catch (e) {
    stopSim();
  }
}

async function startSim() {
  const mode  = document.getElementById('sel-mode').value;
  const spawn = parseFloat(document.getElementById('sel-spawn').value);
  await fetch('/api/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode, spawn_rate: spawn })
  });
  simRunning = true;
  waitHistory = [];
  vehicles = [];
  yellowFramesLeft = 0;
  previousGreenPair = null;
  currentGreenPair = 'NS';
  lights = { N: 'red', S: 'red', E: 'red', W: 'red' };
  document.getElementById('btn-start').disabled = true;
  document.getElementById('btn-stop').disabled  = false;
  simInterval = setInterval(simLoop, 300);
}

async function stopSim() {
  clearInterval(simInterval);
  simRunning = false;
  await fetch('/api/stop', { method: 'POST' });
  document.getElementById('btn-start').disabled = false;
  document.getElementById('btn-stop').disabled  = true;
}

document.getElementById('btn-start').addEventListener('click', startSim);
document.getElementById('btn-stop').addEventListener('click', stopSim);
document.getElementById('sel-spawn').addEventListener('input', e => {
  document.getElementById('spawn-val').textContent = parseFloat(e.target.value).toFixed(1);
});

drawScene();

// Comparação
document.getElementById('btn-compare').addEventListener('click', async () => {
  const btn = document.getElementById('btn-compare');
  const cycles = parseInt(document.getElementById('cmp-cycles').value) || 100;
  const spawn  = parseFloat(document.getElementById('cmp-spawn').value) || 0.4;
  btn.disabled = true;
  btn.textContent = '⏳ Simulando...';
  try {
    const res = await fetch('/api/compare', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cycles, spawn_rate: spawn })
    });
    const data = await res.json();
    document.getElementById('cmp-ai-wait').textContent    = data.ai.avg_wait_mean;
    document.getElementById('cmp-fixed-wait').textContent = data.fixed.avg_wait_mean;
    document.getElementById('cmp-ai-pass').textContent    = data.ai.total_passed;
    document.getElementById('cmp-fixed-pass').textContent = data.fixed.total_passed;
    document.getElementById('cmp-improvement').textContent = data.improvement_pct + '%';
    document.getElementById('cmp-label').textContent =
      data.improvement_pct > 0
        ? `A IA foi ${data.improvement_pct}% mais eficiente no tempo médio de espera`
        : 'Os modos tiveram desempenho similar nesta execução';
    document.getElementById('compare-result').style.display = 'block';
    drawCompareChart(data.history_ai, data.history_fixed, cycles);
  } finally {
    btn.disabled = false;
    btn.textContent = '▶ Executar Comparação';
  }
});

function drawCompareChart(histAI, histFixed, cycles) {
  const c = document.getElementById('compare-chart');
  if (!c) return;
  const x = c.getContext('2d');
  c.width = c.offsetWidth || 700;
  c.height = 260;
  const W = c.width, H = c.height;
  const pad = { t: 20, r: 20, b: 40, l: 50 };
  const iW = W - pad.l - pad.r, iH = H - pad.t - pad.b;
  x.clearRect(0, 0, W, H);
  x.fillStyle = '#0D2240';
  x.fillRect(0, 0, W, H);
  const maxV = Math.max(...histAI, ...histFixed, 1);
  const toX = i => pad.l + (i / (cycles - 1)) * iW;
  const toY = v => pad.t + iH - (v / maxV) * iH;
  x.strokeStyle = '#1B3A6E';
  x.lineWidth = 0.5;
  for (let i = 0; i <= 4; i++) {
    const gy = pad.t + (i / 4) * iH;
    x.beginPath(); x.moveTo(pad.l, gy); x.lineTo(W - pad.r, gy); x.stroke();
    x.fillStyle = '#90CAF9'; x.font = '10px sans-serif'; x.textAlign = 'right';
    x.fillText(((1 - i / 4) * maxV).toFixed(1), pad.l - 6, gy + 4);
  }
  function drawLine(data, color) {
    x.strokeStyle = color; x.lineWidth = 2; x.beginPath();
    data.forEach((v, i) => { i === 0 ? x.moveTo(toX(i), toY(v)) : x.lineTo(toX(i), toY(v)); });
    x.stroke();
    const grad = x.createLinearGradient(0, pad.t, 0, pad.t + iH);
    grad.addColorStop(0, color + '44'); grad.addColorStop(1, color + '00');
    x.lineTo(toX(data.length - 1), pad.t + iH); x.lineTo(toX(0), pad.t + iH);
    x.closePath(); x.fillStyle = grad; x.fill();
  }
  drawLine(histFixed, '#E53935');
  drawLine(histAI, '#4FC3F7');
  x.fillStyle = '#4FC3F7'; x.fillRect(pad.l, H - 22, 16, 3);
  x.fillStyle = '#E8F4FD'; x.font = '11px sans-serif'; x.textAlign = 'left';
  x.fillText('IA (Q-Learning)', pad.l + 20, H - 16);
  x.fillStyle = '#E53935'; x.fillRect(pad.l + 160, H - 22, 16, 3);
  x.fillStyle = '#E8F4FD'; x.fillText('Tempo Fixo', pad.l + 180, H - 16);
  x.fillStyle = '#90CAF9'; x.textAlign = 'center'; x.fillText('Ciclos →', W / 2, H - 2);
}

// Splash logo
(function(){
  const overlay = document.createElement('div');
  overlay.id = 'logo-splash-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(5,13,26,0.92);display:flex;align-items:center;justify-content:center;cursor:pointer;transition:opacity 0.6s ease;';
  const box = document.createElement('div');
  box.style.cssText = 'position:relative;width:min(85vw,480px);height:min(85vw,480px);max-width:480px;max-height:480px;border-radius:16px;overflow:hidden;box-shadow:0 0 60px rgba(0,191,255,0.35);cursor:default;';
  const cvs = document.createElement('canvas');
  cvs.style.cssText = 'width:100%;height:100%;display:block;';
  box.appendChild(cvs);
  const cap = document.createElement('div');
  cap.style.cssText = 'position:absolute;bottom:18px;left:0;right:0;text-align:center;pointer-events:none;font-family:Segoe UI,system-ui,sans-serif;';
  cap.innerHTML = '<div style="font-size:1.35rem;font-weight:700;color:#4FC3F7;">SMART <span style="color:#1B6EF3;">TRAFFIC LIGHT</span></div><div style="font-size:0.72rem;color:#90CAF9;margin-top:6px;">Controle de tráfego com IA · Cidades mais inteligentes, vias mais fluidas</div><div style="font-size:0.65rem;color:#4FC3F7;margin-top:14px;opacity:0.7;">Clique fora da logo para continuar</div>';
  box.appendChild(cap); overlay.appendChild(box); document.body.appendChild(overlay);
  const lx = cvs.getContext('2d'); let aid = null, t = 0;
  function rs(){ const s = Math.min(box.clientWidth, box.clientHeight, 480); cvs.width = s; cvs.height = s; }
  rs(); window.addEventListener('resize', rs);
  const nodes = [];
  for (let i = 0; i < 18; i++) {
    const a = (i/18)*Math.PI*2, r = 0.28+(i%3)*0.08;
    nodes.push({x:0.5+Math.cos(a)*r, y:0.42+Math.sin(a)*r*0.85, phase:Math.random()*6, speed:0.02+Math.random()*0.03});
  }
  function frame(){
    const W = cvs.width, H = cvs.height; if (W < 10) return;
    lx.fillStyle = '#050D1A'; lx.fillRect(0,0,W,H);
    const cx = W*0.5, cy = H*0.42, rw = W*0.11;
    lx.fillStyle = '#1A2E4A'; lx.fillRect(cx-rw,0,rw*2,H*0.75); lx.fillRect(0,cy-rw,W,rw*2);
    lx.strokeStyle = '#4FC3F7'; lx.lineWidth = 2; lx.setLineDash([W*0.03,W*0.025]);
    lx.beginPath(); lx.moveTo(cx,0);lx.lineTo(cx,cy-rw); lx.moveTo(cx,cy+rw);lx.lineTo(cx,H*0.75);
    lx.moveTo(0,cy);lx.lineTo(cx-rw,cy); lx.moveTo(cx+rw,cy);lx.lineTo(W,cy); lx.stroke(); lx.setLineDash([]);
    nodes.forEach((n,i) => {
      const pulse = 0.6+0.4*Math.sin(t*n.speed*10+n.phase);
      const r = W*(0.012+0.008*pulse);
      lx.beginPath(); lx.arc(n.x*W, n.y*H, r, 0, Math.PI*2);
      lx.fillStyle = i<5?'#4FC3F7':'#1B6EF3'; lx.shadowColor='#4FC3F7'; lx.shadowBlur=10*pulse; lx.fill(); lx.shadowBlur=0;
    });
    const cycle = Math.floor(t/35)%4;
    [[cx-rw-W*0.06,cy-rw-W*0.06],[cx+rw+W*0.01,cy+rw+W*0.01],[cx+rw+W*0.01,cy-rw-W*0.06],[cx-rw-W*0.06,cy+rw+W*0.01]].forEach((pos,idx)=>{
      const bw=W*0.036,bh=W*0.095,r=W*0.012;
      lx.fillStyle='#0A1F3A'; lx.strokeStyle='#1B6EF3'; lx.lineWidth=1.5;
      lx.beginPath(); lx.roundRect(pos[0],pos[1],bw,bh,4); lx.fill(); lx.stroke();
      let ap = 'red';
      if ((idx<2 && cycle===0) || (idx>=2 && cycle===2)) ap='green';
      else if ((idx<2 && cycle===1) || (idx>=2 && cycle===3)) ap='yellow';
      ['red','yellow','green'].forEach((p,i)=>{
        const col = p==='red'?'#FF1744':p==='yellow'?'#FFEA00':'#00E676';
        const active = p===ap;
        lx.beginPath(); lx.arc(pos[0]+bw/2, pos[1]+bh*0.18+i*bh*0.28, r, 0, Math.PI*2);
        lx.fillStyle = active?col:'#1A2E4A';
        if(active){lx.shadowColor=col;lx.shadowBlur=W*0.025;} lx.fill(); lx.shadowBlur=0;
      });
    });
    t++; aid = requestAnimationFrame(frame);
  }
  frame();
  overlay.addEventListener('click', e => {
    if (e.target === overlay) { cancelAnimationFrame(aid); overlay.style.opacity='0'; setTimeout(()=>overlay.remove(),600); }
  });
  box.addEventListener('click', e => e.stopPropagation());
})();
