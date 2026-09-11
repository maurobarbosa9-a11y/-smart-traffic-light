/* ═══════════════════════════════════════════
   Smart Traffic Light — Frontend JS (v5)
   Correções definitivas baseadas no feedback:
   - Semáforos N/E/S/W FORA da interseção (canteiros)
   - Verde aparece e dura o tempo do backend
   - Veículos orientados na direção do movimento (não de lado)
   - Sincronismo luz ↔ veículo
   - Espaçamento entre veículos
   - Não somem no meio da via
   - Splash fiel à logo original (octógono + feixes + cérebro)
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

let simRunning = false;
let simInterval = null;
let waitHistory = [];
let lights = { N: 'red', S: 'red', E: 'red', W: 'red' };
let queues = { N: 0, S: 0, E: 0, W: 0 };
let vehicles = [];
let greenPair = 'NS';
let yellowLeft = 0;
let prevPair = null;
const YELLOW_DUR = 8;

const C = {
  bg: '#07152A', road: '#1A2E4A', line: '#4FC3F7', grass: '#0A1F1A',
  red: '#FF1744', yellow: '#FFEA00', green: '#00E676',
  cars: ['#4FC3F7','#7C4DFF','#1B6EF3','#4CAF50','#FDD835','#FF7043','#EC407A','#26C6DA','#AB47BC','#66BB6A','#FFA726','#42A5F5'],
  dim: '#90CAF9'
};

const canvas = document.getElementById('sim-canvas');
const ctx = canvas.getContext('2d');

function resizeCanvas() {
  const wrap = canvas.parentElement;
  const size = Math.min(wrap.clientWidth, 520);
  canvas.width = size;
  canvas.height = size;
  if (!simRunning) drawScene();
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

const TYPES = [
  { type: 'car',   len: 0.048, wid: 0.024, prob: 0.60 },
  { type: 'bus',   len: 0.070, wid: 0.028, prob: 0.22 },
  { type: 'truck', len: 0.075, wid: 0.030, prob: 0.18 }
];

function pickType() {
  const r = Math.random();
  let a = 0;
  for (const t of TYPES) { a += t.prob; if (r < a) return t; }
  return TYPES[0];
}

function spawnVehicle(dir) {
  if (vehicles.length >= 16) return;
  if (Math.random() > 0.40) return;

  const W = canvas.width;
  const cx = W / 2, cy = W / 2;
  const t = pickType();
  const speed = W * (0.0022 + Math.random() * 0.0010);
  const lane = (Math.random() - 0.5) * W * 0.025;

  let x, y, dx, dy, stopAt;

  // Spawn bem fora da tela + linha de parada ANTES da interseção
  switch (dir) {
    case 'N': // move para BAIXO (+y)
      x = cx - W * 0.032 + lane;
      y = -W * 0.12;
      dx = 0; dy = speed;
      stopAt = cy - W * 0.16;
      break;
    case 'S': // move para CIMA (-y)
      x = cx + W * 0.032 + lane;
      y = W + W * 0.12;
      dx = 0; dy = -speed;
      stopAt = cy + W * 0.16;
      break;
    case 'E': // move para ESQUERDA (-x)
      x = W + W * 0.12;
      y = cy - W * 0.032 + lane;
      dx = -speed; dy = 0;
      stopAt = cx + W * 0.16;
      break;
    case 'W': // move para DIREITA (+x)
      x = -W * 0.12;
      y = cy + W * 0.032 + lane;
      dx = speed; dy = 0;
      stopAt = cx - W * 0.16;
      break;
  }

  // Espaçamento no spawn
  const gap = W * 0.09;
  if (vehicles.some(v => v.dir === dir && Math.hypot(v.x - x, v.y - y) < gap)) return;

  vehicles.push({
    x, y, dx, dy, dir, stopAt,
    type: t.type, len: t.len, wid: t.wid,
    color: C.cars[Math.floor(Math.random() * C.cars.length)],
    crossed: false
  });
}

function canGo(dir) {
  if (yellowLeft > 0) return false;
  if (greenPair === 'NS') return dir === 'N' || dir === 'S';
  if (greenPair === 'EW') return dir === 'E' || dir === 'W';
  return false;
}

function updateVehicles() {
  const W = canvas.width;

  // Remove só depois de sair completamente da tela
  vehicles = vehicles.filter(v => {
    if (v.x < -W * 0.3 || v.x > W * 1.3 || v.y < -W * 0.3 || v.y > W * 1.3) return false;
    return true;
  });

  // Agrupa e ordena por fila
  const lanes = { N: [], S: [], E: [], W: [] };
  vehicles.forEach(v => lanes[v.dir].push(v));

  lanes.N.sort((a, b) => b.y - a.y);
  lanes.S.sort((a, b) => a.y - b.y);
  lanes.E.sort((a, b) => a.x - b.x);
  lanes.W.sort((a, b) => b.x - a.x);

  const minGap = W * 0.065;

  ['N', 'S', 'E', 'W'].forEach(dir => {
    const list = lanes[dir];
    list.forEach((v, i) => {
      const go = canGo(dir);

      let distStop;
      if (dir === 'N') distStop = v.stopAt - v.y;
      else if (dir === 'S') distStop = v.y - v.stopAt;
      else if (dir === 'E') distStop = v.x - v.stopAt;
      else distStop = v.stopAt - v.x;

      // Já passou da linha → nunca mais para
      if (distStop < -W * 0.02) v.crossed = true;

      // Bloqueado pelo da frente?
      let blocked = false;
      if (i > 0) {
        const front = list[i - 1];
        if (Math.hypot(front.x - v.x, front.y - v.y) < minGap) blocked = true;
      }

      if ((!go && !v.crossed && distStop < W * 0.11) || blocked) {
        // Para e mantém espaçamento
        if (dir === 'N') v.y = Math.min(v.y, v.stopAt - i * minGap);
        else if (dir === 'S') v.y = Math.max(v.y, v.stopAt + i * minGap);
        else if (dir === 'E') v.x = Math.max(v.x, v.stopAt + i * minGap);
        else if (dir === 'W') v.x = Math.min(v.x, v.stopAt - i * minGap);
      } else {
        v.x += v.dx;
        v.y += v.dy;
      }
    });
  });
}

function drawVehicle(v, W) {
  // len = comprimento (eixo de movimento), wid = largura
  const len = W * v.len;
  const wid = W * v.wid;

  ctx.save();
  ctx.translate(v.x, v.y);

  // Orientação: local +Y = frente do veículo
  // N (+y tela) → 0
  // S (-y) → PI
  // E (-x) → -PI/2
  // W (+x) → +PI/2
  if (v.dir === 'S') ctx.rotate(Math.PI);
  else if (v.dir === 'E') ctx.rotate(-Math.PI / 2);
  else if (v.dir === 'W') ctx.rotate(Math.PI / 2);
  // N: sem rotação

  // Corpo (comprimento no eixo Y local = direção de movimento)
  ctx.fillStyle = v.color;
  ctx.beginPath();
  ctx.roundRect(-wid / 2, -len / 2, wid, len, W * 0.006);
  ctx.fill();

  if (v.type === 'car') {
    // para-brisa (parte da frente = +Y)
    ctx.fillStyle = 'rgba(15,30,60,0.55)';
    ctx.fillRect(-wid * 0.35, len * 0.05, wid * 0.70, len * 0.28);
    // faróis na frente
    ctx.fillStyle = '#FFF9C4';
    ctx.fillRect(-wid * 0.38, len * 0.38, wid * 0.22, len * 0.10);
    ctx.fillRect(wid * 0.16, len * 0.38, wid * 0.22, len * 0.10);
  } else if (v.type === 'bus') {
    ctx.fillStyle = 'rgba(15,30,60,0.5)';
    for (let i = 0; i < 4; i++) {
      ctx.fillRect(-wid * 0.38, -len * 0.35 + i * len * 0.18, wid * 0.76, len * 0.12);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.fillRect(-wid / 2, -len * 0.05, wid, len * 0.08);
  } else {
    // truck: cabine na frente
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fillRect(-wid * 0.45, len * 0.05, wid * 0.90, len * 0.42);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(-wid * 0.42, -len * 0.42, wid * 0.84, len * 0.42);
  }

  ctx.restore();
}

function drawScene() {
  const W = canvas.width, H = canvas.height;
  const cx = W / 2, cy = H / 2;
  const rw = W * 0.115;

  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);

  // Canteiros
  ctx.fillStyle = C.grass;
  ctx.fillRect(0, 0, cx - rw, cy - rw);
  ctx.fillRect(cx + rw, 0, W - cx - rw, cy - rw);
  ctx.fillRect(0, cy + rw, cx - rw, H - cy - rw);
  ctx.fillRect(cx + rw, cy + rw, W - cx - rw, H - cy - rw);

  // Pistas
  ctx.fillStyle = C.road;
  ctx.fillRect(cx - rw, 0, rw * 2, H);
  ctx.fillRect(0, cy - rw, W, rw * 2);

  // Linhas
  ctx.strokeStyle = C.line;
  ctx.lineWidth = Math.max(1.5, W * 0.0025);
  ctx.setLineDash([W * 0.022, W * 0.018]);
  [[cx, 0, cx, cy - rw], [cx, cy + rw, cx, H], [0, cy, cx - rw, cy], [cx + rw, cy, W, cy]]
    .forEach(([a, b, c, d]) => { ctx.beginPath(); ctx.moveTo(a, b); ctx.lineTo(c, d); ctx.stroke(); });
  ctx.setLineDash([]);

  // Interseção
  ctx.fillStyle = '#122030';
  ctx.fillRect(cx - rw, cy - rw, rw * 2, rw * 2);

  // Faixa pedestre
  ctx.fillStyle = '#1E3A5A';
  for (let i = 0; i < 5; i++) {
    ctx.fillRect(cx - rw + 5, cy - rw + i * (rw * 0.36), rw * 2 - 10, rw * 0.13);
  }

  // ── Semáforos nos CANTEIROS (fora da pista) ──
  // Cada um fica no gramado do seu canto
  const m = W * 0.11;
  const sp = {
    N: [cx - rw - m,     cy - rw - m],      // canteiro NW
    E: [cx + rw + m*0.15, cy - rw - m],     // canteiro NE
    S: [cx + rw + m*0.15, cy + rw + m*0.15],// canteiro SE
    W: [cx - rw - m,     cy + rw + m*0.15]  // canteiro SW
  };

  Object.entries(sp).forEach(([dir, [sx, sy]]) => {
    drawSemaforo(sx, sy, lights[dir], W);
    ctx.fillStyle = C.dim;
    ctx.font = `bold ${Math.max(11, W * 0.024)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(dir, sx + W * 0.020, sy + W * 0.140);
  });

  vehicles.forEach(v => drawVehicle(v, W));
}

function drawSemaforo(x, y, phase, W) {
  const bw = W * 0.040, bh = W * 0.110, r = W * 0.015;

  ctx.fillStyle = '#0A1525';
  ctx.strokeStyle = '#1B6EF3';
  ctx.lineWidth = Math.max(1.5, W * 0.0025);
  ctx.beginPath();
  ctx.roundRect(x, y, bw, bh, W * 0.008);
  ctx.fill(); ctx.stroke();

  const phases = ['red', 'yellow', 'green'];
  const cols = [C.red, C.yellow, C.green];

  phases.forEach((p, i) => {
    const active = phase === p;
    const ly = y + bh * 0.17 + i * bh * 0.30;

    ctx.beginPath();
    ctx.arc(x + bw / 2, ly, r, 0, Math.PI * 2);
    ctx.fillStyle = '#0D1A2A';
    ctx.fill();

    if (active) {
      ctx.shadowColor = cols[i];
      ctx.shadowBlur = W * 0.060;
      ctx.beginPath();
      ctx.arc(x + bw / 2, ly, r * 0.88, 0, Math.PI * 2);
      ctx.fillStyle = cols[i];
      ctx.fill();
      ctx.shadowBlur = 0;

      ctx.beginPath();
      ctx.arc(x + bw / 2, ly, r * 0.38, 0, Math.PI * 2);
      ctx.fillStyle = '#FFFFFF';
      ctx.globalAlpha = 0.85;
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  });
  ctx.shadowBlur = 0;
}

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
  x.strokeStyle = '#4FC3F7'; x.lineWidth = 2; x.beginPath();
  waitHistory.forEach((v, i) => {
    const px = (i / (waitHistory.length - 1)) * W;
    const py = H - (v / max) * (H - 10) - 5;
    i === 0 ? x.moveTo(px, py) : x.lineTo(px, py);
  });
  x.stroke();
  const g = x.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, 'rgba(79,195,247,0.25)'); g.addColorStop(1, 'rgba(79,195,247,0)');
  x.lineTo(W, H); x.lineTo(0, H); x.closePath(); x.fillStyle = g; x.fill();
  x.fillStyle = '#90CAF9'; x.font = '10px sans-serif'; x.fillText('Espera média', 4, 12);
}

function updatePanel(snap) {
  document.getElementById('m-cycle').textContent = snap.cycle || 0;
  document.getElementById('m-waiting').textContent = snap.total_waiting || 0;
  document.getElementById('m-passed').textContent = snap.passed || 0;
  document.getElementById('m-avgwait').textContent = snap.avg_wait || 0;

  ['N','S','E','W'].forEach(d => {
    const q = (snap.queues || {})[d] || 0;
    const bar = document.getElementById('q-bar-' + d);
    const num = document.getElementById('q-num-' + d);
    if (bar) bar.style.width = Math.min(q / 10 * 100, 100) + '%';
    if (num) num.textContent = q;
  });

  const gp = snap.green_pair || 'NS';

  // Transição: só inicia amarelo UMA vez por mudança
  if (prevPair !== null && prevPair !== gp && yellowLeft <= 0) {
    yellowLeft = YELLOW_DUR;
  }

  greenPair = gp;

  ['N','S','E','W'].forEach(d => {
    let phase;
    const inNew = (gp === 'NS' && (d === 'N' || d === 'S')) || (gp === 'EW' && (d === 'E' || d === 'W'));
    const inOld = prevPair && ((prevPair === 'NS' && (d === 'N' || d === 'S')) || (prevPair === 'EW' && (d === 'E' || d === 'W')));

    if (yellowLeft > 0) {
      phase = inOld ? 'yellow' : 'red';
    } else {
      phase = inNew ? 'green' : 'red';
    }

    lights[d] = phase;
    const el = document.getElementById('light-' + d);
    if (el) el.className = 'light-circle ' + phase;
  });

  if (yellowLeft > 0) {
    yellowLeft--;
    if (yellowLeft <= 0) prevPair = gp;
  } else {
    prevPair = gp;
  }

  queues = snap.queues || queues;

  if (snap.agent) {
    const box = document.getElementById('agent-box');
    if (box) {
      document.getElementById('agent-epsilon').textContent = snap.agent.epsilon;
      document.getElementById('agent-qtable').textContent = snap.agent.q_table_size;
      document.getElementById('agent-reward').textContent = snap.agent.total_reward;
      document.getElementById('agent-steps').textContent = snap.agent.steps;
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

    if (vehicles.length < 14 && Math.random() < 0.48)
      spawnVehicle(['N','S','E','W'][Math.floor(Math.random() * 4)]);
    if (vehicles.length < 8 && Math.random() < 0.40)
      spawnVehicle(['N','S','E','W'][Math.floor(Math.random() * 4)]);

    updatePanel(snap);
    drawScene();
  } catch (e) { stopSim(); }
}

async function startSim() {
  const mode = document.getElementById('sel-mode').value;
  const spawn = parseFloat(document.getElementById('sel-spawn').value);
  await fetch('/api/start', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode, spawn_rate: spawn })
  });
  simRunning = true;
  waitHistory = [];
  vehicles = [];
  yellowLeft = 0;
  prevPair = null;
  greenPair = 'NS';
  lights = { N: 'red', S: 'red', E: 'red', W: 'red' };
  document.getElementById('btn-start').disabled = true;
  document.getElementById('btn-stop').disabled = false;
  simInterval = setInterval(simLoop, 280);
}

async function stopSim() {
  clearInterval(simInterval);
  simRunning = false;
  await fetch('/api/stop', { method: 'POST' });
  document.getElementById('btn-start').disabled = false;
  document.getElementById('btn-stop').disabled = true;
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
  const spawn = parseFloat(document.getElementById('cmp-spawn').value) || 0.4;
  btn.disabled = true; btn.textContent = '⏳ Simulando...';
  try {
    const res = await fetch('/api/compare', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cycles, spawn_rate: spawn })
    });
    const data = await res.json();
    document.getElementById('cmp-ai-wait').textContent = data.ai.avg_wait_mean;
    document.getElementById('cmp-fixed-wait').textContent = data.fixed.avg_wait_mean;
    document.getElementById('cmp-ai-pass').textContent = data.ai.total_passed;
    document.getElementById('cmp-fixed-pass').textContent = data.fixed.total_passed;
    document.getElementById('cmp-improvement').textContent = data.improvement_pct + '%';
    document.getElementById('cmp-label').textContent =
      data.improvement_pct > 0
        ? `A IA foi ${data.improvement_pct}% mais eficiente no tempo médio de espera`
        : 'Os modos tiveram desempenho similar nesta execução';
    document.getElementById('compare-result').style.display = 'block';
    drawCompareChart(data.history_ai, data.history_fixed, cycles);
  } finally {
    btn.disabled = false; btn.textContent = '▶ Executar Comparação';
  }
});

function drawCompareChart(histAI, histFixed, cycles) {
  const c = document.getElementById('compare-chart');
  if (!c) return;
  const x = c.getContext('2d');
  c.width = c.offsetWidth || 700; c.height = 260;
  const W = c.width, H = c.height, pad = { t: 20, r: 20, b: 40, l: 50 };
  const iW = W - pad.l - pad.r, iH = H - pad.t - pad.b;
  x.clearRect(0, 0, W, H); x.fillStyle = '#0D2240'; x.fillRect(0, 0, W, H);
  const maxV = Math.max(...histAI, ...histFixed, 1);
  const toX = i => pad.l + (i / (cycles - 1)) * iW;
  const toY = v => pad.t + iH - (v / maxV) * iH;
  x.strokeStyle = '#1B3A6E'; x.lineWidth = 0.5;
  for (let i = 0; i <= 4; i++) {
    const gy = pad.t + (i / 4) * iH;
    x.beginPath(); x.moveTo(pad.l, gy); x.lineTo(W - pad.r, gy); x.stroke();
    x.fillStyle = '#90CAF9'; x.font = '10px sans-serif'; x.textAlign = 'right';
    x.fillText(((1 - i / 4) * maxV).toFixed(1), pad.l - 6, gy + 4);
  }
  function dl(data, col) {
    x.strokeStyle = col; x.lineWidth = 2; x.beginPath();
    data.forEach((v, i) => { i === 0 ? x.moveTo(toX(i), toY(v)) : x.lineTo(toX(i), toY(v)); });
    x.stroke();
    const g = x.createLinearGradient(0, pad.t, 0, pad.t + iH);
    g.addColorStop(0, col + '44'); g.addColorStop(1, col + '00');
    x.lineTo(toX(data.length - 1), pad.t + iH); x.lineTo(toX(0), pad.t + iH);
    x.closePath(); x.fillStyle = g; x.fill();
  }
  dl(histFixed, '#E53935'); dl(histAI, '#4FC3F7');
  x.fillStyle = '#4FC3F7'; x.fillRect(pad.l, H - 22, 16, 3);
  x.fillStyle = '#E8F4FD'; x.font = '11px sans-serif'; x.textAlign = 'left';
  x.fillText('IA (Q-Learning)', pad.l + 20, H - 16);
  x.fillStyle = '#E53935'; x.fillRect(pad.l + 160, H - 22, 16, 3);
  x.fillStyle = '#E8F4FD'; x.fillText('Tempo Fixo', pad.l + 180, H - 16);
}

/* ═══════════════════════════════════════════════════════════
   SPLASH — fiel à logo original (octógono + feixes X + cérebro)
   Luzes piscando, interseção viva
═══════════════════════════════════════════════════════════ */
(function () {
  const overlay = document.createElement('div');
  overlay.id = 'logo-splash-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(5,13,26,0.94);display:flex;align-items:center;justify-content:center;cursor:pointer;transition:opacity 0.55s ease;';

  const box = document.createElement('div');
  box.style.cssText = 'position:relative;width:min(88vw,440px);height:min(88vw,520px);max-width:440px;border-radius:12px;overflow:hidden;cursor:default;';

  const cvs = document.createElement('canvas');
  cvs.style.cssText = 'width:100%;height:100%;display:block;';
  box.appendChild(cvs);
  overlay.appendChild(box);
  document.body.appendChild(overlay);

  const lx = cvs.getContext('2d');
  let aid = null, t = 0;

  function rs() {
    const w = box.clientWidth || 440;
    const h = box.clientHeight || 520;
    cvs.width = w;
    cvs.height = h;
  }
  rs();
  window.addEventListener('resize', rs);

  function drawSplash() {
    const W = cvs.width, H = cvs.height;
    if (W < 10) return;

    // Fundo
    lx.fillStyle = '#050D1A';
    lx.fillRect(0, 0, W, H);

    const cx = W * 0.5;
    const cy = H * 0.32;
    const R = Math.min(W, H) * 0.28;

    // Octógono externo
    lx.strokeStyle = 'rgba(79,195,247,0.35)';
    lx.lineWidth = 1.5;
    lx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 - Math.PI / 8;
      const x = cx + Math.cos(a) * R * 1.15;
      const y = cy + Math.sin(a) * R * 1.15;
      i === 0 ? lx.moveTo(x, y) : lx.lineTo(x, y);
    }
    lx.closePath();
    lx.stroke();

    // Segmentos do octógono (estilo logo original)
    for (let i = 0; i < 8; i++) {
      const a1 = (i / 8) * Math.PI * 2 - Math.PI / 8;
      const a2 = ((i + 1) / 8) * Math.PI * 2 - Math.PI / 8;
      const mid = (a1 + a2) / 2;
      lx.strokeStyle = 'rgba(27,110,243,0.4)';
      lx.lineWidth = 1;
      lx.beginPath();
      lx.moveTo(cx + Math.cos(a1) * R * 0.7, cy + Math.sin(a1) * R * 0.7);
      lx.lineTo(cx + Math.cos(mid) * R * 1.05, cy + Math.sin(mid) * R * 1.05);
      lx.lineTo(cx + Math.cos(a2) * R * 0.7, cy + Math.sin(a2) * R * 0.7);
      lx.stroke();
    }

    // Feixes em X (energia do centro)
    const pulse = 0.5 + 0.5 * Math.sin(t * 0.04);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const grad = lx.createLinearGradient(cx, cy, cx + Math.cos(a) * R, cy + Math.sin(a) * R);
      grad.addColorStop(0, `rgba(79,195,247,${0.9 * pulse})`);
      grad.addColorStop(1, 'rgba(79,195,247,0)');
      lx.strokeStyle = grad;
      lx.lineWidth = 3 + 2 * pulse;
      lx.beginPath();
      lx.moveTo(cx, cy);
      lx.lineTo(cx + Math.cos(a) * R * 1.1, cy + Math.sin(a) * R * 1.1);
      lx.stroke();
    }

    // Núcleo central
    lx.shadowColor = '#4FC3F7';
    lx.shadowBlur = 20 + 15 * pulse;
    lx.beginPath();
    lx.arc(cx, cy, 8 + 4 * pulse, 0, Math.PI * 2);
    lx.fillStyle = '#4FC3F7';
    lx.fill();
    lx.shadowBlur = 0;
    lx.beginPath();
    lx.arc(cx, cy, 4, 0, Math.PI * 2);
    lx.fillStyle = '#FFFFFF';
    lx.fill();

    // Nós nos eixos (como a logo)
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const nx = cx + Math.cos(a) * R * 0.85;
      const ny = cy + Math.sin(a) * R * 0.85;
      lx.beginPath();
      lx.arc(nx, ny, 3.5, 0, Math.PI * 2);
      lx.fillStyle = i % 2 === 0 ? '#4FC3F7' : '#1B6EF3';
      lx.fill();
    }

    // Mini semáforos piscando nos 4 lados (interseção viva)
    const cycle = Math.floor(t / 30) % 4;
    const lightPos = [
      { x: cx - R * 0.55, y: cy - R * 0.55 },
      { x: cx + R * 0.45, y: cy - R * 0.55 },
      { x: cx + R * 0.45, y: cy + R * 0.45 },
      { x: cx - R * 0.55, y: cy + R * 0.45 }
    ];
    lightPos.forEach((p, idx) => {
      const bw = 10, bh = 26;
      lx.fillStyle = '#0A1F3A';
      lx.strokeStyle = '#1B6EF3';
      lx.lineWidth = 1;
      lx.beginPath();
      lx.roundRect(p.x, p.y, bw, bh, 3);
      lx.fill(); lx.stroke();

      let ap = 'red';
      if ((idx === 0 || idx === 2) && cycle === 0) ap = 'green';
      else if ((idx === 0 || idx === 2) && cycle === 1) ap = 'yellow';
      else if ((idx === 1 || idx === 3) && cycle === 2) ap = 'green';
      else if ((idx === 1 || idx === 3) && cycle === 3) ap = 'yellow';

      ['red', 'yellow', 'green'].forEach((ph, i) => {
        const col = ph === 'red' ? '#FF1744' : ph === 'yellow' ? '#FFEA00' : '#00E676';
        const active = ph === ap;
        lx.beginPath();
        lx.arc(p.x + bw / 2, p.y + 6 + i * 8, 3.2, 0, Math.PI * 2);
        lx.fillStyle = active ? col : '#1A2E4A';
        if (active) { lx.shadowColor = col; lx.shadowBlur = 8; }
        lx.fill();
        lx.shadowBlur = 0;
      });
    });

    // Texto SMART TRAFFIC LIGHT
    lx.textAlign = 'center';
    lx.fillStyle = '#E8F4FD';
    lx.font = `bold ${Math.max(22, W * 0.075)}px Segoe UI, system-ui, sans-serif`;
    lx.fillText('SMART', cx, H * 0.62);
    lx.fillStyle = '#4FC3F7';
    lx.font = `bold ${Math.max(14, W * 0.045)}px Segoe UI, system-ui, sans-serif`;
    lx.fillText('TRAFFIC LIGHT', cx, H * 0.68);

    // Subtítulo
    lx.fillStyle = '#90CAF9';
    lx.font = `${Math.max(9, W * 0.028)}px Segoe UI, system-ui, sans-serif`;
    lx.fillText('CONTROLE DE TRÁFEGO COM IA', cx, H * 0.74);

    // Cérebro / chip (estilo logo)
    const bx = cx, by = H * 0.84;
    lx.strokeStyle = '#4FC3F7';
    lx.lineWidth = 1.5;
    lx.beginPath();
    lx.arc(bx, by, 16, 0, Math.PI * 2);
    lx.stroke();
    // circuitos do cérebro simplificado
    lx.beginPath();
    lx.moveTo(bx - 8, by - 4); lx.quadraticCurveTo(bx, by - 12, bx + 8, by - 4);
    lx.moveTo(bx - 8, by + 2); lx.quadraticCurveTo(bx, by + 10, bx + 8, by + 2);
    lx.moveTo(bx, by - 10); lx.lineTo(bx, by + 10);
    lx.stroke();
    // linhas de circuito
    lx.beginPath();
    lx.moveTo(bx - 22, by); lx.lineTo(bx - 16, by);
    lx.moveTo(bx + 16, by); lx.lineTo(bx + 22, by);
    lx.moveTo(bx, by - 22); lx.lineTo(bx, by - 16);
    lx.stroke();

    // Hint
    lx.fillStyle = 'rgba(79,195,247,0.55)';
    lx.font = `${Math.max(8, W * 0.024)}px Segoe UI, system-ui, sans-serif`;
    lx.fillText('Clique fora da logo para continuar', cx, H * 0.96);

    t++;
    aid = requestAnimationFrame(drawSplash);
  }

  drawSplash();

  overlay.addEventListener('click', e => {
    if (e.target === overlay) {
      cancelAnimationFrame(aid);
      overlay.style.opacity = '0';
      setTimeout(() => overlay.remove(), 550);
    }
  });
  box.addEventListener('click', e => e.stopPropagation());
})();
