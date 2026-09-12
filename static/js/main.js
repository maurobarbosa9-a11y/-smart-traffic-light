/* ═══════════════════════════════════════════════════════════
   Smart Traffic Light — Frontend JS (v6)
   Projeto Interdisciplinar 5
   Correções + melhorias:
   - Semáforos nos canteiros (fora da via)
   - Veículos orientados corretamente + velocidades por tipo
   - Aceleração/frenagem suaves + espaçamento
   - Sincronismo luz ↔ veículo
   - Painel de tempos Verde/Amarelo/Vermelho (NS↔EW)
   - Contador da fase atual
   - Velocidade da simulação 0.5x / 1x / 2x
   - Sons (troca de fase + ambiente) com mute
   - Visual da interseção modernizado
   - Splash fiel à logo original
═══════════════════════════════════════════════════════════ */

// ── Tabs ──────────────────────────────────────────────────
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(btn.dataset.page).classList.add('active');
    if (btn.dataset.page === 'page-sim') resizeCanvas();
  });
});

// ── Estado ────────────────────────────────────────────────
let simRunning = false;
let simInterval = null;
let waitHistory = [];
let lights = { N: 'red', S: 'red', E: 'red', W: 'red' };
let queues = { N: 0, S: 0, E: 0, W: 0 };
let vehicles = [];
let greenPair = 'NS';
let phase = 'green';          // green | yellow | red (do par ativo)
let phaseTimeLeft = 0;       // segundos restantes da fase
let lastTick = 0;
let simSpeed = 1;            // 0.5 | 1 | 2
let soundEnabled = true;
let cycleCount = 0;
let passedCount = 0;
let totalWaitAcc = 0;
let waitSamples = 0;

// Tempos configuráveis (segundos)
let timing = {
  greenNS: 8,
  yellowNS: 2,
  greenEW: 8,
  yellowEW: 2
};

const C = {
  bg: '#07152A', road: '#152A45', roadEdge: '#0E1C30',
  line: '#5AC8FA', grass: '#0C2218', grass2: '#0A1A14',
  red: '#FF1744', yellow: '#FFEA00', green: '#00E676',
  cars: ['#4FC3F7','#7C4DFF','#1B6EF3','#43A047','#FDD835','#FF7043','#EC407A','#26C6DA','#AB47BC','#66BB6A','#FFA726','#42A5F5','#EF5350'],
  dim: '#90CAF9', curb: '#2A4A6A'
};

const canvas = document.getElementById('sim-canvas');
const ctx = canvas.getContext('2d');

function resizeCanvas() {
  const wrap = canvas.parentElement;
  const size = Math.min(wrap.clientWidth, 560);
  canvas.width = size;
  canvas.height = size;
  if (!simRunning) drawScene();
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// ── Injetar painel de tempos + controles extras ───────────
(function injectUI() {
  const controls = document.querySelector('.controls');
  if (!controls) return;
  const metricsCard = controls.children[1]; // após Configurações

  const panel = document.createElement('div');
  panel.className = 'card';
  panel.id = 'timing-panel';
  panel.innerHTML = `
    <h3>⏱ Tempos dos Semáforos</h3>
    <div style="font-size:0.72rem;color:#90CAF9;margin-bottom:10px;line-height:1.35">
      Ajuste os tempos (1–15 s). N↔S e E↔W sincronizam automaticamente.
      No modo <b>Tempo Fixo</b> estes valores controlam as fases.
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;font-size:0.78rem">
      <div style="background:#0A1F3A;border:1px solid #1B3A6E;border-radius:8px;padding:10px">
        <div style="color:#4FC3F7;font-weight:600;margin-bottom:6px">Par N ↔ S</div>
        <label style="display:flex;justify-content:space-between;align-items:center;margin:4px 0;color:#90CAF9">
          Verde <input type="number" id="t-green-ns" min="1" max="15" value="8" style="width:52px;background:#07152A;border:1px solid #1B3A6E;color:#E8F4FD;border-radius:4px;padding:3px 6px"/>
        </label>
        <label style="display:flex;justify-content:space-between;align-items:center;margin:4px 0;color:#90CAF9">
          Amarelo <input type="number" id="t-yellow-ns" min="1" max="5" value="2" style="width:52px;background:#07152A;border:1px solid #1B3A6E;color:#E8F4FD;border-radius:4px;padding:3px 6px"/>
        </label>
        <div style="margin-top:6px;color:#90CAF9;font-size:0.7rem">Vermelho E/W = Verde+Amarelo NS</div>
      </div>
      <div style="background:#0A1F3A;border:1px solid #1B3A6E;border-radius:8px;padding:10px">
        <div style="color:#4FC3F7;font-weight:600;margin-bottom:6px">Par E ↔ W</div>
        <label style="display:flex;justify-content:space-between;align-items:center;margin:4px 0;color:#90CAF9">
          Verde <input type="number" id="t-green-ew" min="1" max="15" value="8" style="width:52px;background:#07152A;border:1px solid #1B3A6E;color:#E8F4FD;border-radius:4px;padding:3px 6px"/>
        </label>
        <label style="display:flex;justify-content:space-between;align-items:center;margin:4px 0;color:#90CAF9">
          Amarelo <input type="number" id="t-yellow-ew" min="1" max="5" value="2" style="width:52px;background:#07152A;border:1px solid #1B3A6E;color:#E8F4FD;border-radius:4px;padding:3px 6px"/>
        </label>
        <div style="margin-top:6px;color:#90CAF9;font-size:0.7rem">Vermelho N/S = Verde+Amarelo EW</div>
      </div>
    </div>
    <div id="phase-display" style="margin-top:12px;text-align:center;background:#0A1F3A;border:1px solid #1B3A6E;border-radius:8px;padding:10px">
      <div style="font-size:0.7rem;color:#90CAF9">Fase atual</div>
      <div style="font-size:1.1rem;font-weight:700;color:#4FC3F7;margin-top:2px" id="phase-label">—</div>
      <div style="font-size:0.85rem;color:#E8F4FD;margin-top:2px" id="phase-timer">—</div>
    </div>
  `;
  controls.insertBefore(panel, metricsCard);

  // Velocidade + som dentro de Configurações
  const cfg = controls.children[0];
  const extra = document.createElement('div');
  extra.style.cssText = 'margin-top:12px;display:flex;flex-direction:column;gap:8px';
  extra.innerHTML = `
    <div class="select-row">
      <label>Velocidade da simulação</label>
      <select id="sel-speed">
        <option value="0.5">0.5x (lenta)</option>
        <option value="1" selected>1x (normal)</option>
        <option value="2">2x (rápida)</option>
      </select>
    </div>
    <label style="display:flex;align-items:center;gap:8px;font-size:0.78rem;color:#90CAF9;cursor:pointer">
      <input type="checkbox" id="chk-sound" checked style="accent-color:#1B6EF3"/>
      Sons (troca de fase + ambiente)
    </label>
  `;
  cfg.appendChild(extra);

  document.getElementById('sel-speed').addEventListener('change', e => {
    simSpeed = parseFloat(e.target.value) || 1;
    if (simRunning) restartInterval();
  });
  document.getElementById('chk-sound').addEventListener('change', e => {
    soundEnabled = e.target.checked;
    if (!soundEnabled) stopAmbient();
    else if (simRunning) startAmbient();
  });

  ['t-green-ns','t-yellow-ns','t-green-ew','t-yellow-ew'].forEach(id => {
    document.getElementById(id).addEventListener('change', readTiming);
    document.getElementById(id).addEventListener('input', readTiming);
  });
})();

function readTiming() {
  timing.greenNS  = clamp(parseInt(document.getElementById('t-green-ns').value)  || 8, 1, 15);
  timing.yellowNS = clamp(parseInt(document.getElementById('t-yellow-ns').value) || 2, 1, 5);
  timing.greenEW  = clamp(parseInt(document.getElementById('t-green-ew').value)  || 8, 1, 15);
  timing.yellowEW = clamp(parseInt(document.getElementById('t-yellow-ew').value) || 2, 1, 5);
}
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

// ── Áudio (Web Audio API — sem arquivos externos) ─────────
let audioCtx = null;
let ambientNodes = [];

function ensureAudio() {
  if (!audioCtx) {
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {}
  }
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
}

function beep(freq, dur, type, vol) {
  if (!soundEnabled) return;
  ensureAudio();
  if (!audioCtx) return;
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.type = type || 'sine';
  o.frequency.value = freq;
  g.gain.value = vol || 0.08;
  o.connect(g); g.connect(audioCtx.destination);
  o.start();
  g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
  o.stop(audioCtx.currentTime + dur + 0.02);
}

function playPhaseSound(ph) {
  if (ph === 'green') beep(880, 0.12, 'sine', 0.07);
  else if (ph === 'yellow') beep(660, 0.15, 'triangle', 0.08);
  else beep(220, 0.18, 'square', 0.05);
}

function startAmbient() {
  if (!soundEnabled) return;
  ensureAudio();
  if (!audioCtx || ambientNodes.length) return;
  // ruído branco suave filtrado = tráfego distante
  const bufferSize = 2 * audioCtx.sampleRate;
  const noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * 0.15;
  const noise = audioCtx.createBufferSource();
  noise.buffer = noiseBuffer;
  noise.loop = true;
  const filter = audioCtx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 400;
  const gain = audioCtx.createGain();
  gain.gain.value = 0.025;
  noise.connect(filter); filter.connect(gain); gain.connect(audioCtx.destination);
  noise.start();
  ambientNodes = [noise, filter, gain];
}

function stopAmbient() {
  ambientNodes.forEach(n => { try { n.stop && n.stop(); n.disconnect && n.disconnect(); } catch(e){} });
  ambientNodes = [];
}

// ── Tipos de veículo ──────────────────────────────────────
const TYPES = [
  { type: 'car',   len: 0.050, wid: 0.024, speed: 1.00, prob: 0.58 },
  { type: 'bus',   len: 0.072, wid: 0.028, speed: 0.72, prob: 0.22 },
  { type: 'truck', len: 0.078, wid: 0.030, speed: 0.65, prob: 0.20 }
];

function pickType() {
  const r = Math.random();
  let a = 0;
  for (const t of TYPES) { a += t.prob; if (r < a) return t; }
  return TYPES[0];
}

function spawnVehicle(dir) {
  if (vehicles.length >= 18) return;
  if (Math.random() > 0.38) return;

  const W = canvas.width;
  const cx = W / 2, cy = W / 2;
  const t = pickType();
  const base = W * (0.0024 + Math.random() * 0.0008) * t.speed;
  const lane = (Math.random() - 0.5) * W * 0.022;

  let x, y, dx, dy, stopAt;
  switch (dir) {
    case 'N':
      x = cx - W * 0.030 + lane; y = -W * 0.14;
      dx = 0; dy = base; stopAt = cy - W * 0.165;
      break;
    case 'S':
      x = cx + W * 0.030 + lane; y = W + W * 0.14;
      dx = 0; dy = -base; stopAt = cy + W * 0.165;
      break;
    case 'E':
      x = W + W * 0.14; y = cy - W * 0.030 + lane;
      dx = -base; dy = 0; stopAt = cx + W * 0.165;
      break;
    case 'W':
      x = -W * 0.14; y = cy + W * 0.030 + lane;
      dx = base; dy = 0; stopAt = cx - W * 0.165;
      break;
  }

  const gap = W * 0.10;
  if (vehicles.some(v => v.dir === dir && Math.hypot(v.x - x, v.y - y) < gap)) return;

  vehicles.push({
    x, y, dx, dy, dir, stopAt,
    type: t.type, len: t.len, wid: t.wid,
    color: C.cars[Math.floor(Math.random() * C.cars.length)],
    crossed: false, speedMul: 1
  });
}

function canGo(dir) {
  if (phase === 'yellow' || phase === 'red') {
    // só o par que estava verde fica amarelo → deve parar
    if (phase === 'yellow') {
      const wasNS = greenPair === 'NS';
      if (wasNS && (dir === 'N' || dir === 'S')) return false;
      if (!wasNS && (dir === 'E' || dir === 'W')) return false;
      return false; // durante amarelo ninguém entra
    }
    return false;
  }
  // phase === 'green'
  if (greenPair === 'NS') return dir === 'N' || dir === 'S';
  return dir === 'E' || dir === 'W';
}

function updateVehicles(dt) {
  const W = canvas.width;
  vehicles = vehicles.filter(v => {
    if (v.x < -W * 0.35 || v.x > W * 1.35 || v.y < -W * 0.35 || v.y > W * 1.35) {
      if (v.crossed) passedCount++;
      return false;
    }
    return true;
  });

  const lanes = { N: [], S: [], E: [], W: [] };
  vehicles.forEach(v => lanes[v.dir].push(v));
  lanes.N.sort((a, b) => b.y - a.y);
  lanes.S.sort((a, b) => a.y - b.y);
  lanes.E.sort((a, b) => a.x - b.x);
  lanes.W.sort((a, b) => b.x - a.x);

  const minGap = W * 0.070;

  ['N','S','E','W'].forEach(dir => {
    const list = lanes[dir];
    list.forEach((v, i) => {
      const go = canGo(dir);
      let distStop;
      if (dir === 'N') distStop = v.stopAt - v.y;
      else if (dir === 'S') distStop = v.y - v.stopAt;
      else if (dir === 'E') distStop = v.x - v.stopAt;
      else distStop = v.stopAt - v.x;

      if (distStop < -W * 0.02) v.crossed = true;

      let blocked = false;
      if (i > 0) {
        const front = list[i - 1];
        if (Math.hypot(front.x - v.x, front.y - v.y) < minGap) blocked = true;
      }

      // Frenagem progressiva
      const nearStop = !v.crossed && distStop < W * 0.14 && distStop > 0;
      if ((!go && nearStop) || blocked) {
        v.speedMul = Math.max(0, v.speedMul - 0.12);
      } else if (go || v.crossed) {
        v.speedMul = Math.min(1, v.speedMul + 0.06);
      }

      if (v.speedMul < 0.05 && (!go && !v.crossed)) {
        // parado na fila
        if (dir === 'N') v.y = Math.min(v.y, v.stopAt - i * minGap);
        else if (dir === 'S') v.y = Math.max(v.y, v.stopAt + i * minGap);
        else if (dir === 'E') v.x = Math.max(v.x, v.stopAt + i * minGap);
        else if (dir === 'W') v.x = Math.min(v.x, v.stopAt - i * minGap);
      } else {
        v.x += v.dx * v.speedMul * (dt * 0.55);
        v.y += v.dy * v.speedMul * (dt * 0.55);
      }
    });
  });

  // filas aproximadas
  queues = {
    N: lanes.N.filter(v => !v.crossed && v.speedMul < 0.3).length,
    S: lanes.S.filter(v => !v.crossed && v.speedMul < 0.3).length,
    E: lanes.E.filter(v => !v.crossed && v.speedMul < 0.3).length,
    W: lanes.W.filter(v => !v.crossed && v.speedMul < 0.3).length
  };
}

function drawVehicle(v, W) {
  const len = W * v.len, wid = W * v.wid;
  ctx.save();
  ctx.translate(v.x, v.y);
  if (v.dir === 'S') ctx.rotate(Math.PI);
  else if (v.dir === 'E') ctx.rotate(-Math.PI / 2);
  else if (v.dir === 'W') ctx.rotate(Math.PI / 2);

  // sombra
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(0, len * 0.15, wid * 0.55, len * 0.22, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = v.color;
  ctx.beginPath();
  ctx.roundRect(-wid / 2, -len / 2, wid, len, W * 0.006);
  ctx.fill();

  if (v.type === 'car') {
    ctx.fillStyle = 'rgba(15,30,60,0.55)';
    ctx.fillRect(-wid * 0.35, len * 0.02, wid * 0.70, len * 0.28);
    ctx.fillStyle = '#FFF9C4';
    ctx.fillRect(-wid * 0.38, len * 0.38, wid * 0.20, len * 0.10);
    ctx.fillRect(wid * 0.18, len * 0.38, wid * 0.20, len * 0.10);
  } else if (v.type === 'bus') {
    ctx.fillStyle = 'rgba(15,30,60,0.5)';
    for (let i = 0; i < 4; i++)
      ctx.fillRect(-wid * 0.38, -len * 0.38 + i * len * 0.18, wid * 0.76, len * 0.12);
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.fillRect(-wid / 2, -len * 0.05, wid, len * 0.08);
  } else {
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fillRect(-wid * 0.45, len * 0.02, wid * 0.90, len * 0.42);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(-wid * 0.42, -len * 0.42, wid * 0.84, len * 0.40);
  }
  ctx.restore();
}

function drawScene() {
  const W = canvas.width, H = canvas.height;
  const cx = W / 2, cy = H / 2;
  const rw = W * 0.118;

  // fundo
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);

  // canteiros com gradiente sutil
  const grassGrad = ctx.createLinearGradient(0, 0, W, H);
  grassGrad.addColorStop(0, C.grass);
  grassGrad.addColorStop(1, C.grass2);
  ctx.fillStyle = grassGrad;
  ctx.fillRect(0, 0, cx - rw, cy - rw);
  ctx.fillRect(cx + rw, 0, W - cx - rw, cy - rw);
  ctx.fillRect(0, cy + rw, cx - rw, H - cy - rw);
  ctx.fillRect(cx + rw, cy + rw, W - cx - rw, H - cy - rw);

  // pistas
  ctx.fillStyle = C.road;
  ctx.fillRect(cx - rw, 0, rw * 2, H);
  ctx.fillRect(0, cy - rw, W, rw * 2);

  // bordas da pista
  ctx.strokeStyle = C.curb;
  ctx.lineWidth = Math.max(2, W * 0.004);
  ctx.strokeRect(cx - rw, 0, rw * 2, H);
  ctx.strokeRect(0, cy - rw, W, rw * 2);

  // linhas centrais
  ctx.strokeStyle = C.line;
  ctx.lineWidth = Math.max(1.5, W * 0.0025);
  ctx.setLineDash([W * 0.02, W * 0.016]);
  [[cx, 0, cx, cy - rw], [cx, cy + rw, cx, H], [0, cy, cx - rw, cy], [cx + rw, cy, W, cy]]
    .forEach(([a,b,c,d]) => { ctx.beginPath(); ctx.moveTo(a,b); ctx.lineTo(c,d); ctx.stroke(); });
  ctx.setLineDash([]);

  // interseção
  const isect = ctx.createRadialGradient(cx, cy, 0, cx, cy, rw * 1.4);
  isect.addColorStop(0, '#1A3048');
  isect.addColorStop(1, '#122030');
  ctx.fillStyle = isect;
  ctx.fillRect(cx - rw, cy - rw, rw * 2, rw * 2);

  // faixa de pedestres moderna
  ctx.fillStyle = 'rgba(200,220,240,0.18)';
  for (let i = 0; i < 6; i++) {
    ctx.fillRect(cx - rw + 4, cy - rw + 4 + i * (rw * 0.30), rw * 2 - 8, rw * 0.12);
  }

  // ── Semáforos nos CANTEIROS ──
  const m = W * 0.105;
  const sp = {
    N: [cx - rw - m,      cy - rw - m],
    E: [cx + rw + m*0.12, cy - rw - m],
    S: [cx + rw + m*0.12, cy + rw + m*0.12],
    W: [cx - rw - m,      cy + rw + m*0.12]
  };

  Object.entries(sp).forEach(([dir, [sx, sy]]) => {
    drawSemaforo(sx, sy, lights[dir], W);
    ctx.fillStyle = C.dim;
    ctx.font = `bold ${Math.max(11, W * 0.024)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(dir, sx + W * 0.021, sy + W * 0.142);
  });

  vehicles.forEach(v => drawVehicle(v, W));
}

function drawSemaforo(x, y, ph, W) {
  const bw = W * 0.040, bh = W * 0.112, r = W * 0.015;
  // poste
  ctx.fillStyle = '#1A2A3A';
  ctx.fillRect(x + bw * 0.35, y + bh, bw * 0.30, W * 0.04);

  ctx.fillStyle = '#0A1525';
  ctx.strokeStyle = '#1B6EF3';
  ctx.lineWidth = Math.max(1.5, W * 0.0025);
  ctx.beginPath();
  ctx.roundRect(x, y, bw, bh, W * 0.008);
  ctx.fill(); ctx.stroke();

  const phases = ['red', 'yellow', 'green'];
  const cols = [C.red, C.yellow, C.green];
  phases.forEach((p, i) => {
    const active = ph === p;
    const ly = y + bh * 0.17 + i * bh * 0.30;
    ctx.beginPath();
    ctx.arc(x + bw / 2, ly, r, 0, Math.PI * 2);
    ctx.fillStyle = '#0D1A2A';
    ctx.fill();
    if (active) {
      ctx.shadowColor = cols[i];
      ctx.shadowBlur = W * 0.065;
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

// ── Máquina de fases (cliente) ────────────────────────────
function applyLights() {
  const nsGreen = greenPair === 'NS' && phase === 'green';
  const ewGreen = greenPair === 'EW' && phase === 'green';
  const nsYellow = greenPair === 'NS' && phase === 'yellow';
  const ewYellow = greenPair === 'EW' && phase === 'yellow';

  lights.N = nsGreen ? 'green' : nsYellow ? 'yellow' : 'red';
  lights.S = nsGreen ? 'green' : nsYellow ? 'yellow' : 'red';
  lights.E = ewGreen ? 'green' : ewYellow ? 'yellow' : 'red';
  lights.W = ewGreen ? 'green' : ewYellow ? 'yellow' : 'red';

  ['N','S','E','W'].forEach(d => {
    const el = document.getElementById('light-' + d);
    if (el) el.className = 'light-circle ' + lights[d];
  });

  const pairName = greenPair === 'NS' ? 'N ↔ S' : 'E ↔ W';
  const phaseName = phase === 'green' ? 'VERDE' : phase === 'yellow' ? 'AMARELO' : 'VERMELHO';
  const col = phase === 'green' ? '#00E676' : phase === 'yellow' ? '#FFEA00' : '#FF1744';
  const lbl = document.getElementById('phase-label');
  const tmr = document.getElementById('phase-timer');
  if (lbl) { lbl.textContent = `${pairName} — ${phaseName}`; lbl.style.color = col; }
  if (tmr) tmr.textContent = `${Math.max(0, phaseTimeLeft).toFixed(1)} s`;
}

function advancePhase(dt) {
  phaseTimeLeft -= dt;
  if (phaseTimeLeft > 0) return;

  if (phase === 'green') {
    phase = 'yellow';
    phaseTimeLeft = greenPair === 'NS' ? timing.yellowNS : timing.yellowEW;
    playPhaseSound('yellow');
  } else if (phase === 'yellow') {
    // troca de par
    greenPair = greenPair === 'NS' ? 'EW' : 'NS';
    phase = 'green';
    phaseTimeLeft = greenPair === 'NS' ? timing.greenNS : timing.greenEW;
    cycleCount++;
    playPhaseSound('green');
  }
  applyLights();
}

function updateMetricsPanel() {
  const waiting = queues.N + queues.S + queues.E + queues.W;
  totalWaitAcc += waiting;
  waitSamples++;
  const avg = waitSamples ? (totalWaitAcc / waitSamples).toFixed(1) : 0;

  document.getElementById('m-cycle').textContent = cycleCount;
  document.getElementById('m-waiting').textContent = waiting;
  document.getElementById('m-passed').textContent = passedCount;
  document.getElementById('m-avgwait').textContent = avg;

  ['N','S','E','W'].forEach(d => {
    const q = queues[d] || 0;
    const bar = document.getElementById('q-bar-' + d);
    const num = document.getElementById('q-num-' + d);
    if (bar) bar.style.width = Math.min(q / 8 * 100, 100) + '%';
    if (num) num.textContent = q;
  });

  waitHistory.push(parseFloat(avg) || 0);
  if (waitHistory.length > 60) waitHistory.shift();
  drawLiveChart();
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
}

// ── Loop ──────────────────────────────────────────────────
const BASE_MS = 50; // tick base

function simTick() {
  const dt = (BASE_MS / 1000) * simSpeed * (1000 / BASE_MS); // normalizado ~1 por tick a 1x
  // dt em "unidades de movimento" — usar fator fixo
  const moveDt = simSpeed;

  advancePhase(BASE_MS / 1000 * simSpeed);
  updateVehicles(moveDt);

  if (vehicles.length < 14 && Math.random() < 0.35 * simSpeed)
    spawnVehicle(['N','S','E','W'][Math.floor(Math.random() * 4)]);
  if (vehicles.length < 8 && Math.random() < 0.30 * simSpeed)
    spawnVehicle(['N','S','E','W'][Math.floor(Math.random() * 4)]);

  applyLights();
  updateMetricsPanel();
  drawScene();

  // ainda tenta API para agente RL se modo AI
  const mode = document.getElementById('sel-mode')?.value;
  if (mode === 'ai' && Math.random() < 0.15) {
    fetch('/api/step', { method: 'POST' }).then(r => r.json()).then(snap => {
      if (snap && snap.agent) {
        const box = document.getElementById('agent-box');
        if (box) {
          document.getElementById('agent-epsilon').textContent = snap.agent.epsilon;
          document.getElementById('agent-qtable').textContent = snap.agent.q_table_size;
          document.getElementById('agent-reward').textContent = snap.agent.total_reward;
          document.getElementById('agent-steps').textContent = snap.agent.steps;
          box.style.display = 'block';
        }
      }
    }).catch(() => {});
  }
}

function restartInterval() {
  clearInterval(simInterval);
  simInterval = setInterval(simTick, BASE_MS);
}

async function startSim() {
  readTiming();
  ensureAudio();
  const mode = document.getElementById('sel-mode').value;
  const spawn = parseFloat(document.getElementById('sel-spawn').value);
  try {
    await fetch('/api/start', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode, spawn_rate: spawn })
    });
  } catch (e) {}

  simRunning = true;
  vehicles = [];
  waitHistory = [];
  cycleCount = 0;
  passedCount = 0;
  totalWaitAcc = 0;
  waitSamples = 0;
  greenPair = 'NS';
  phase = 'green';
  phaseTimeLeft = timing.greenNS;
  applyLights();
  playPhaseSound('green');
  startAmbient();

  document.getElementById('btn-start').disabled = true;
  document.getElementById('btn-stop').disabled = false;
  restartInterval();
}

async function stopSim() {
  clearInterval(simInterval);
  simRunning = false;
  stopAmbient();
  try { await fetch('/api/stop', { method: 'POST' }); } catch (e) {}
  document.getElementById('btn-start').disabled = false;
  document.getElementById('btn-stop').disabled = true;
}

document.getElementById('btn-start').addEventListener('click', startSim);
document.getElementById('btn-stop').addEventListener('click', stopSim);
document.getElementById('sel-spawn').addEventListener('input', e => {
  document.getElementById('spawn-val').textContent = parseFloat(e.target.value).toFixed(1);
});

drawScene();
applyLights();

// Comparação (mantida)
document.getElementById('btn-compare')?.addEventListener('click', async () => {
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
  } finally {
    btn.disabled = false; btn.textContent = '▶ Executar Comparação';
  }
});

/* ── Splash logo (estilo original: octógono + feixes + cérebro) ── */
(function () {
  const overlay = document.createElement('div');
  overlay.id = 'logo-splash-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(5,13,26,0.94);display:flex;align-items:center;justify-content:center;cursor:pointer;transition:opacity 0.55s ease;';
  const box = document.createElement('div');
  box.style.cssText = 'position:relative;width:min(88vw,440px);height:min(88vw,520px);max-width:440px;border-radius:12px;overflow:hidden;cursor:default;';
  const cvs = document.createElement('canvas');
  cvs.style.cssText = 'width:100%;height:100%;display:block;';
  box.appendChild(cvs); overlay.appendChild(box); document.body.appendChild(overlay);
  const lx = cvs.getContext('2d');
  let aid = null, t = 0;
  function rs() {
    cvs.width = box.clientWidth || 440;
    cvs.height = box.clientHeight || 520;
  }
  rs(); window.addEventListener('resize', rs);

  function frame() {
    const W = cvs.width, H = cvs.height;
    if (W < 10) return;
    lx.fillStyle = '#050D1A'; lx.fillRect(0, 0, W, H);
    const cx = W * 0.5, cy = H * 0.32, R = Math.min(W, H) * 0.28;
    const pulse = 0.5 + 0.5 * Math.sin(t * 0.04);

    lx.strokeStyle = 'rgba(79,195,247,0.35)'; lx.lineWidth = 1.5;
    lx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 - Math.PI / 8;
      const x = cx + Math.cos(a) * R * 1.15, y = cy + Math.sin(a) * R * 1.15;
      i === 0 ? lx.moveTo(x, y) : lx.lineTo(x, y);
    }
    lx.closePath(); lx.stroke();

    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const g = lx.createLinearGradient(cx, cy, cx + Math.cos(a) * R, cy + Math.sin(a) * R);
      g.addColorStop(0, `rgba(79,195,247,${0.85 * pulse})`);
      g.addColorStop(1, 'rgba(79,195,247,0)');
      lx.strokeStyle = g; lx.lineWidth = 3 + 2 * pulse;
      lx.beginPath(); lx.moveTo(cx, cy);
      lx.lineTo(cx + Math.cos(a) * R * 1.1, cy + Math.sin(a) * R * 1.1); lx.stroke();
    }

    lx.shadowColor = '#4FC3F7'; lx.shadowBlur = 18 + 12 * pulse;
    lx.beginPath(); lx.arc(cx, cy, 7 + 3 * pulse, 0, Math.PI * 2);
    lx.fillStyle = '#4FC3F7'; lx.fill(); lx.shadowBlur = 0;

    // mini semáforos piscando
    const cycle = Math.floor(t / 28) % 4;
    [[cx - R * 0.55, cy - R * 0.55], [cx + R * 0.42, cy - R * 0.55],
     [cx + R * 0.42, cy + R * 0.42], [cx - R * 0.55, cy + R * 0.42]].forEach((p, idx) => {
      lx.fillStyle = '#0A1F3A'; lx.strokeStyle = '#1B6EF3'; lx.lineWidth = 1;
      lx.beginPath(); lx.roundRect(p[0], p[1], 10, 26, 3); lx.fill(); lx.stroke();
      let ap = 'red';
      if ((idx % 2 === 0 && cycle === 0) || (idx % 2 === 1 && cycle === 2)) ap = 'green';
      else if ((idx % 2 === 0 && cycle === 1) || (idx % 2 === 1 && cycle === 3)) ap = 'yellow';
      ['red','yellow','green'].forEach((ph, i) => {
        const col = ph === 'red' ? '#FF1744' : ph === 'yellow' ? '#FFEA00' : '#00E676';
        lx.beginPath(); lx.arc(p[0] + 5, p[1] + 6 + i * 8, 3, 0, Math.PI * 2);
        lx.fillStyle = ph === ap ? col : '#1A2E4A';
        if (ph === ap) { lx.shadowColor = col; lx.shadowBlur = 8; }
        lx.fill(); lx.shadowBlur = 0;
      });
    });

    lx.textAlign = 'center';
    lx.fillStyle = '#E8F4FD';
    lx.font = `bold ${Math.max(22, W * 0.075)}px Segoe UI,sans-serif`;
    lx.fillText('SMART', cx, H * 0.62);
    lx.fillStyle = '#4FC3F7';
    lx.font = `bold ${Math.max(14, W * 0.045)}px Segoe UI,sans-serif`;
    lx.fillText('TRAFFIC LIGHT', cx, H * 0.68);
    lx.fillStyle = '#90CAF9';
    lx.font = `${Math.max(9, W * 0.028)}px Segoe UI,sans-serif`;
    lx.fillText('CONTROLE DE TRÁFEGO COM IA', cx, H * 0.74);

    // cérebro
    const bx = cx, by = H * 0.84;
    lx.strokeStyle = '#4FC3F7'; lx.lineWidth = 1.5;
    lx.beginPath(); lx.arc(bx, by, 16, 0, Math.PI * 2); lx.stroke();
    lx.beginPath();
    lx.moveTo(bx - 8, by - 4); lx.quadraticCurveTo(bx, by - 12, bx + 8, by - 4);
    lx.moveTo(bx - 8, by + 2); lx.quadraticCurveTo(bx, by + 10, bx + 8, by + 2);
    lx.moveTo(bx, by - 10); lx.lineTo(bx, by + 10); lx.stroke();

    lx.fillStyle = 'rgba(79,195,247,0.55)';
    lx.font = `${Math.max(8, W * 0.024)}px Segoe UI,sans-serif`;
    lx.fillText('Clique fora da logo para continuar', cx, H * 0.96);

    t++; aid = requestAnimationFrame(frame);
  }
  frame();
  overlay.addEventListener('click', e => {
    if (e.target === overlay) {
      cancelAnimationFrame(aid);
      overlay.style.opacity = '0';
      setTimeout(() => overlay.remove(), 550);
    }
  });
  box.addEventListener('click', e => e.stopPropagation());
})();
