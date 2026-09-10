/* ═══════════════════════════════════════════
   Smart Traffic Light — Frontend JS
   Canvas animado + métricas ao vivo + comparação
═══════════════════════════════════════════ */

// ── Tabs ──────────────────────────────────────────────────────────────────
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(btn.dataset.page).classList.add('active');
    if (btn.dataset.page === 'page-sim') resizeCanvas();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ESTADO DA SIMULAÇÃO (precisa vir ANTES do resizeCanvas)
// ═══════════════════════════════════════════════════════════════════════════
let simRunning  = false;
let simInterval = null;
let waitHistory = [];
let lights  = { N: 'red', S: 'red', E: 'red', W: 'red' };
let queues  = { N: 0, S: 0, E: 0, W: 0 };
let vehicles = [];

// ═══════════════════════════════════════════════════════════════════════════
// CANVAS RESPONSIVO
// ═══════════════════════════════════════════════════════════════════════════
const canvas = document.getElementById('sim-canvas');
const ctx    = canvas.getContext('2d');

function resizeCanvas() {
  const wrap  = canvas.parentElement;
  const size  = Math.min(wrap.clientWidth, 520);
  canvas.width  = size;
  canvas.height = size;
  if (!simRunning) drawScene();
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// ── Paleta de cores ───────────────────────────────────────────────────────
const C = {
  bg:     '#07152A',
  road:   '#1A2E4A',
  line:   '#4FC3F7',
  grass:  '#0A1F1A',
  red:    '#E53935',
  yellow: '#FDD835',
  green:  '#4CAF50',
  cars:   ['#4FC3F7','#7C4DFF','#1B6EF3','#4CAF50','#FDD835'],
  dim:    '#90CAF9',
};

// ── Veículos animados ─────────────────────────────────────────────────────
function spawnVehicle(dir) {
  if (Math.random() > 0.55) return;
  const W  = canvas.width;
  const cx = W / 2, cy = W / 2;
  let x, y, dx, dy;
  switch (dir) {
    case 'N': x = cx - W*0.06; y = W*0.04 + Math.random()*W*0.12; dx = 0;    dy = W*0.0024; break;
    case 'S': x = cx + W*0.02; y = W*0.96 - Math.random()*W*0.12; dx = 0;    dy = -W*0.0024; break;
    case 'E': x = W*0.96 - Math.random()*W*0.12; y = cy - W*0.06; dx = -W*0.0024; dy = 0; break;
    case 'W': x = W*0.04 + Math.random()*W*0.12; y = cy + W*0.02; dx =  W*0.0024; dy = 0; break;
  }
  vehicles.push({ x, y, dx, dy, dir, color: C.cars[Math.floor(Math.random()*C.cars.length)], life: 80 });
}

function updateVehicles(greenPair) {
  const greenDirs = greenPair === 'NS' ? ['N','S'] : ['E','W'];
  const cx = canvas.width / 2, cy = canvas.height / 2;
  const rw = canvas.width * 0.12;
  vehicles = vehicles.filter(v => v.life > 0);
  vehicles.forEach(v => {
    const nearCenter = Math.abs(v.x - cx) < rw*1.5 && Math.abs(v.y - cy) < rw*1.5;
    if (!greenDirs.includes(v.dir) && nearCenter) {
      // Para na fila — não move
    } else {
      v.x += v.dx;
      v.y += v.dy;
    }
    v.life--;
  });
}

// ── Desenho principal ─────────────────────────────────────────────────────
function drawScene() {
  const W  = canvas.width, H = canvas.height;
  const cx = W / 2, cy = H / 2;
  const rw = W * 0.12;   // meia-largura da via

  // Fundo
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);

  // Canteiros
  ctx.fillStyle = C.grass;
  [ [0, 0, cx-rw, cy-rw], [cx+rw, 0, cx-rw, cy-rw],
    [0, cy+rw, cx-rw, cy-rw], [cx+rw, cy+rw, cx-rw, cy-rw] ]
    .forEach(([x,y,w,h]) => ctx.fillRect(x, y, w, h));

  // Pistas
  ctx.fillStyle = C.road;
  ctx.fillRect(cx-rw, 0, rw*2, H);
  ctx.fillRect(0, cy-rw, W, rw*2);

  // Linhas de centro tracejadas
  ctx.strokeStyle = C.line;
  ctx.lineWidth   = Math.max(1, W*0.002);
  ctx.setLineDash([W*0.025, W*0.02]);
  [ [cx,0,cx,cy-rw], [cx,cy+rw,cx,H], [0,cy,cx-rw,cy], [cx+rw,cy,W,cy] ]
    .forEach(([x1,y1,x2,y2]) => {
      ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
    });
  ctx.setLineDash([]);

  // Interseção
  ctx.fillStyle = '#122030';
  ctx.fillRect(cx-rw, cy-rw, rw*2, rw*2);

  // Zebra
  ctx.fillStyle = '#1E3A5A';
  for (let i = 0; i < 4; i++) {
    ctx.fillRect(cx-rw+4, cy-rw+i*(rw*0.4), rw*2-8, rw*0.18);
  }

  // Semáforos nos 4 cantos
  const sp = {
    N: [cx-rw-W*0.055, cy-rw-W*0.055],
    S: [cx+rw+W*0.005, cy+rw+W*0.005],
    E: [cx+rw+W*0.005, cy-rw-W*0.055],
    W: [cx-rw-W*0.055, cy+rw+W*0.005],
  };
  Object.entries(sp).forEach(([dir, [sx, sy]]) => {
    drawSemaforo(sx, sy, lights[dir], W);
    ctx.fillStyle   = C.dim;
    ctx.font        = `bold ${W*0.022}px sans-serif`;
    ctx.textAlign   = 'center';
    ctx.fillText(dir, sx + W*0.016, sy + W*0.115);
  });

  // Filas visuais
  drawQueue('N', cx-rw+W*0.015, cy-rw-W*0.02, 0, -1, W);
  drawQueue('S', cx+W*0.015,    cy+rw+W*0.02, 0,  1, W);
  drawQueue('E', cx+rw+W*0.02,  cy-rw+W*0.015, 1, 0, W);
  drawQueue('W', cx-rw-W*0.02,  cy+W*0.015,   -1, 0, W);

  // Veículos animados
  const cw = W*0.034, ch = W*0.022;
  vehicles.forEach(v => {
    ctx.fillStyle = v.color;
    ctx.beginPath();
    ctx.roundRect(v.x-cw/2, v.y-ch/2, cw, ch, W*0.006);
    ctx.fill();
  });
}

function drawSemaforo(x, y, phase, W) {
  const bw = W*0.034, bh = W*0.095, r = W*0.012;
  ctx.fillStyle   = '#0A1F3A';
  ctx.strokeStyle = '#1B6EF3';
  ctx.lineWidth   = Math.max(1, W*0.002);
  ctx.beginPath(); ctx.roundRect(x, y, bw, bh, W*0.008); ctx.fill(); ctx.stroke();
  const cols = ['#E53935','#FDD835','#4CAF50'];
  const glows = ['#E53935','#FDD835','#4CAF50'];
  ['red','yellow','green'].forEach((p, i) => {
    const active = phase === p;
    ctx.beginPath();
    ctx.arc(x+bw/2, y+bh*0.18+i*bh*0.3, r, 0, Math.PI*2);
    ctx.fillStyle   = active ? cols[i] : '#1A2E4A';
    ctx.shadowColor = active ? glows[i] : 'transparent';
    ctx.shadowBlur  = active ? W*0.02 : 0;
    ctx.fill();
    ctx.shadowBlur  = 0;
  });
}

function drawQueue(dir, x, y, dx, dy, W) {
  const n = Math.min(queues[dir] || 0, 7);
  const cw = W*0.034, ch = W*0.022, gap = W*0.042;
  for (let i = 0; i < n; i++) {
    ctx.globalAlpha = Math.max(0.25, 0.75 - i*0.08);
    ctx.fillStyle   = '#4FC3F7';
    ctx.beginPath();
    ctx.roundRect(x+dx*i*gap-cw/2, y+dy*i*gap-ch/2, cw, ch, W*0.006);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// ── Mini gráfico de espera ao vivo ────────────────────────────────────────
function drawLiveChart() {
  const c = document.getElementById('live-chart');
  if (!c) return;
  const x = c.getContext('2d');
  c.width  = c.offsetWidth || 280;
  c.height = 90;
  const W = c.width, H = c.height;
  x.clearRect(0,0,W,H);
  if (waitHistory.length < 2) return;

  const max = Math.max(...waitHistory, 1);
  x.strokeStyle = '#4FC3F7';
  x.lineWidth   = 2;
  x.beginPath();
  waitHistory.forEach((v,i) => {
    const px = (i/(waitHistory.length-1))*W;
    const py = H-(v/max)*(H-10)-5;
    i===0 ? x.moveTo(px,py) : x.lineTo(px,py);
  });
  x.stroke();
  const grad = x.createLinearGradient(0,0,0,H);
  grad.addColorStop(0,'rgba(79,195,247,0.25)');
  grad.addColorStop(1,'rgba(79,195,247,0)');
  x.lineTo(W,H); x.lineTo(0,H); x.closePath();
  x.fillStyle = grad; x.fill();
  x.fillStyle = '#90CAF9'; x.font='10px sans-serif';
  x.fillText('Espera média', 4, 12);
}

// ── Atualizar painel ──────────────────────────────────────────────────────
function updatePanel(snap) {
  document.getElementById('m-cycle').textContent    = snap.cycle    || 0;
  document.getElementById('m-waiting').textContent  = snap.total_waiting || 0;
  document.getElementById('m-passed').textContent   = snap.passed   || 0;
  document.getElementById('m-avgwait').textContent  = snap.avg_wait || 0;

  ['N','S','E','W'].forEach(d => {
    const q   = (snap.queues||{})[d] || 0;
    const pct = Math.min(q/10*100, 100);
    document.getElementById(`q-bar-${d}`).style.width = pct+'%';
    document.getElementById(`q-num-${d}`).textContent  = q;
  });

  const gp = snap.green_pair || 'NS';
  ['N','S','E','W'].forEach(d => {
    const phase = ((gp==='NS' && (d==='N'||d==='S')) || (gp==='EW' && (d==='E'||d==='W')))
      ? 'green' : 'red';
    lights[d] = phase;
    const el  = document.getElementById(`light-${d}`);
    if (el) el.className = `light-circle ${phase}`;
  });
  queues = snap.queues || queues;

  if (snap.agent) {
    document.getElementById('agent-epsilon').textContent = snap.agent.epsilon;
    document.getElementById('agent-qtable').textContent  = snap.agent.q_table_size;
    document.getElementById('agent-reward').textContent  = snap.agent.total_reward;
    document.getElementById('agent-steps').textContent   = snap.agent.steps;
    document.getElementById('agent-box').style.display   = 'block';
  }

  waitHistory.push(snap.avg_wait || 0);
  if (waitHistory.length > 60) waitHistory.shift();
  drawLiveChart();
}

// ── Loop da simulação ─────────────────────────────────────────────────────
async function simLoop() {
  try {
    const res  = await fetch('/api/step', { method: 'POST' });
    if (!res.ok) { stopSim(); return; }
    const snap = await res.json();
    if (snap.error) { stopSim(); return; }
    updateVehicles(snap.green_pair);
    if (Math.random() < 0.6) spawnVehicle(['N','S','E','W'][Math.floor(Math.random()*4)]);
    updatePanel(snap);
    drawScene();
  } catch(e) { stopSim(); }
}

// ── Controles ─────────────────────────────────────────────────────────────
async function startSim() {
  const mode  = document.getElementById('sel-mode').value;
  const spawn = parseFloat(document.getElementById('sel-spawn').value);
  await fetch('/api/start', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ mode, spawn_rate: spawn })
  });
  simRunning  = true;
  waitHistory = [];
  vehicles    = [];
  lights      = { N:'red', S:'red', E:'red', W:'red' };
  document.getElementById('btn-start').disabled = true;
  document.getElementById('btn-stop').disabled  = false;
  simInterval = setInterval(simLoop, 380);
}

async function stopSim() {
  clearInterval(simInterval);
  simRunning = false;
  await fetch('/api/stop', { method:'POST' });
  document.getElementById('btn-start').disabled = false;
  document.getElementById('btn-stop').disabled  = true;
}

document.getElementById('btn-start').addEventListener('click', startSim);
document.getElementById('btn-stop').addEventListener('click',  stopSim);
document.getElementById('sel-spawn').addEventListener('input', e => {
  document.getElementById('spawn-val').textContent = parseFloat(e.target.value).toFixed(1);
});

drawScene();

// ═══════════════════════════════════════════════════════════════════════════
// PÁGINA DE COMPARAÇÃO
// ═══════════════════════════════════════════════════════════════════════════
document.getElementById('btn-compare').addEventListener('click', async () => {
  const btn    = document.getElementById('btn-compare');
  const cycles = parseInt(document.getElementById('cmp-cycles').value) || 100;
  const spawn  = parseFloat(document.getElementById('cmp-spawn').value) || 0.4;
  btn.disabled    = true;
  btn.textContent = '⏳ Simulando...';
  try {
    const res  = await fetch('/api/compare', {
      method:'POST', headers:{'Content-Type':'application/json'},
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
    btn.disabled    = false;
    btn.textContent = '▶ Executar Comparação';
  }
});

function drawCompareChart(histAI, histFixed, cycles) {
  const c = document.getElementById('compare-chart');
  const x = c.getContext('2d');
  c.width  = c.offsetWidth || 700;
  c.height = 260;
  const W=c.width, H=c.height;
  const pad = { t:20, r:20, b:40, l:50 };
  const iW  = W-pad.l-pad.r, iH = H-pad.t-pad.b;

  x.clearRect(0,0,W,H);
  x.fillStyle='#0D2240'; x.fillRect(0,0,W,H);

  const maxV = Math.max(...histAI,...histFixed,1);
  const toX  = i  => pad.l+(i/(cycles-1))*iW;
  const toY  = v  => pad.t+iH-(v/maxV)*iH;

  // Grade
  x.strokeStyle='#1B3A6E'; x.lineWidth=0.5;
  for (let i=0;i<=4;i++){
    const gy=pad.t+(i/4)*iH;
    x.beginPath(); x.moveTo(pad.l,gy); x.lineTo(W-pad.r,gy); x.stroke();
    x.fillStyle='#90CAF9'; x.font='10px sans-serif'; x.textAlign='right';
    x.fillText(((1-i/4)*maxV).toFixed(1), pad.l-6, gy+4);
  }

  function drawLine(data, color) {
    x.strokeStyle=color; x.lineWidth=2;
    x.beginPath();
    data.forEach((v,i)=>{ i===0?x.moveTo(toX(i),toY(v)):x.lineTo(toX(i),toY(v)); });
    x.stroke();
    const grad=x.createLinearGradient(0,pad.t,0,pad.t+iH);
    grad.addColorStop(0,color+'44'); grad.addColorStop(1,color+'00');
    x.lineTo(toX(data.length-1),pad.t+iH); x.lineTo(toX(0),pad.t+iH);
    x.closePath(); x.fillStyle=grad; x.fill();
  }
  drawLine(histFixed,'#E53935');
  drawLine(histAI,   '#4FC3F7');

  // Legenda
  x.fillStyle='#4FC3F7'; x.fillRect(pad.l, H-22, 16, 3);
  x.fillStyle='#E8F4FD'; x.font='11px sans-serif'; x.textAlign='left';
  x.fillText('IA (Q-Learning)', pad.l+20, H-16);
  x.fillStyle='#E53935'; x.fillRect(pad.l+160, H-22, 16, 3);
  x.fillStyle='#E8F4FD'; x.fillText('Tempo Fixo', pad.l+180, H-16);
  x.fillStyle='#90CAF9'; x.textAlign='center'; x.fillText('Ciclos →', W/2, H-2);
}
