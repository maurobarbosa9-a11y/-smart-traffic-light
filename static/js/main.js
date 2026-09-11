/* ═══════════════════════════════════════════
   Smart Traffic Light — Frontend JS (v3)
   Correções: posição semáforos, fase amarela,
   veículos param no vermelho/amarelo e seguem no verde,
   veículos realistas (carro/ônibus/caminhão), LEDs mais luminosos
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
// ESTADO DA SIMULAÇÃO
// ═══════════════════════════════════════════════════════════════════════════
let simRunning  = false;
let simInterval = null;
let waitHistory = [];
let lights  = { N: 'red', S: 'red', E: 'red', W: 'red' };
let queues  = { N: 0, S: 0, E: 0, W: 0 };
let vehicles = [];
let lastGreenPair = null;
let yellowTimer = 0;
const YELLOW_FRAMES = 10;

// ── Paleta ────────────────────────────────────────────────────────────────
const C = {
  bg:     '#07152A',
  road:   '#1A2E4A',
  line:   '#4FC3F7',
  grass:  '#0A1F1A',
  red:    '#FF1744',
  yellow: '#FFEA00',
  green:  '#00E676',
  cars:   ['#4FC3F7','#7C4DFF','#1B6EF3','#4CAF50','#FDD835','#FF7043','#EC407A','#26C6DA','#AB47BC','#66BB6A'],
  dim:    '#90CAF9',
};

// ═══════════════════════════════════════════════════════════════════════════
// CANVAS
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

// ── Tipos de veículos realistas ───────────────────────────────────────────
const VEHICLE_TYPES = [
  { type: 'car',    w: 0.038, h: 0.022, prob: 0.65 },
  { type: 'bus',    w: 0.055, h: 0.026, prob: 0.18 },
  { type: 'truck',  w: 0.060, h: 0.028, prob: 0.17 },
];

function pickType() {
  const r = Math.random();
  let acc = 0;
  for (const t of VEHICLE_TYPES) {
    acc += t.prob;
    if (r < acc) return t;
  }
  return VEHICLE_TYPES[0];
}

function spawnVehicle(dir) {
  if (vehicles.length >= 20) return;
  if (Math.random() > 0.48) return;

  const W  = canvas.width;
  const cx = W / 2, cy = W / 2;
  const t  = pickType();
  let x, y, dx, dy, stopLine;
  const speed = W * (0.0020 + Math.random() * 0.0012);

  switch (dir) {
    case 'N':
      x = cx - W*0.045 + Math.random()*W*0.04;
      y = -W*0.05;
      dx = 0; dy = speed;
      stopLine = cy - W*0.145;
      break;
    case 'S':
      x = cx + W*0.01 + Math.random()*W*0.04;
      y = W + W*0.05;
      dx = 0; dy = -speed;
      stopLine = cy + W*0.145;
      break;
    case 'E':
      x = W + W*0.05;
      y = cy - W*0.045 + Math.random()*W*0.04;
      dx = -speed; dy = 0;
      stopLine = cx + W*0.145;
      break;
    case 'W':
      x = -W*0.05;
      y = cy + W*0.01 + Math.random()*W*0.04;
      dx = speed; dy = 0;
      stopLine = cx - W*0.145;
      break;
  }

  vehicles.push({
    x, y, dx, dy, dir,
    type: t.type, w: t.w, h: t.h,
    color: C.cars[Math.floor(Math.random()*C.cars.length)],
    stopped: false, stopLine, life: 500,
  });
}

function isGreenFor(dir, greenPair) {
  if (yellowTimer > 0) return false;
  if (greenPair === 'NS') return dir === 'N' || dir === 'S';
  if (greenPair === 'EW') return dir === 'E' || dir === 'W';
  return false;
}

function updateVehicles(greenPair) {
  const W = canvas.width;

  vehicles = vehicles.filter(v => {
    v.life--;
    if (v.life <= 0) return false;
    if (v.x < -W*0.2 || v.x > W*1.2 || v.y < -W*0.2 || v.y > W*1.2) return false;
    return true;
  });

  vehicles.forEach(v => {
    const green = isGreenFor(v.dir, greenPair);
    let distToStop;
    if (v.dir === 'N') distToStop = v.stopLine - v.y;
    else if (v.dir === 'S') distToStop = v.y - v.stopLine;
    else if (v.dir === 'E') distToStop = v.x - v.stopLine;
    else distToStop = v.stopLine - v.x;

    const pastStopLine = distToStop < -W*0.025;

    if (!green && !pastStopLine && distToStop < W*0.09) {
      v.stopped = true;
      if (v.dir === 'N' && v.y > v.stopLine) v.y = v.stopLine;
      if (v.dir === 'S' && v.y < v.stopLine) v.y = v.stopLine;
      if (v.dir === 'E' && v.x < v.stopLine) v.x = v.stopLine;
      if (v.dir === 'W' && v.x > v.stopLine) v.x = v.stopLine;
    } else {
      v.stopped = false;
      v.x += v.dx;
      v.y += v.dy;
    }
  });
}

function drawVehicle(v, W) {
  const cw = W * v.w, ch = W * v.h;
  ctx.save();
  ctx.translate(v.x, v.y);
  if (v.dir === 'S') ctx.rotate(Math.PI);
  else if (v.dir === 'E') ctx.rotate(-Math.PI/2);
  else if (v.dir === 'W') ctx.rotate(Math.PI/2);

  ctx.fillStyle = v.color;
  ctx.beginPath();
  ctx.roundRect(-cw/2, -ch/2, cw, ch, W*0.006);
  ctx.fill();

  if (v.type === 'car') {
    ctx.fillStyle = 'rgba(20,40,80,0.55)';
    ctx.fillRect(-cw*0.28, -ch*0.35, cw*0.56, ch*0.28);
    ctx.fillStyle = '#FFF59D';
    ctx.fillRect(-cw*0.42, -ch*0.15, cw*0.12, ch*0.12);
    ctx.fillRect(cw*0.30, -ch*0.15, cw*0.12, ch*0.12);
  } else if (v.type === 'bus') {
    ctx.fillStyle = 'rgba(20,40,80,0.5)';
    for (let i = 0; i < 4; i++) ctx.fillRect(-cw*0.38 + i*cw*0.2, -ch*0.32, cw*0.14, ch*0.22);
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(-cw/2, ch*0.15, cw, ch*0.12);
  } else {
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(-cw*0.45, -ch*0.4, cw*0.35, ch*0.8);
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(-cw*0.05, -ch*0.35, cw*0.45, ch*0.7);
  }

  ctx.globalAlpha = 0.22;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(0, ch*0.55, cw*0.45, ch*0.18, 0, 0, Math.PI*2);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.restore();
}

function drawScene() {
  const W = canvas.width, H = canvas.height;
  const cx = W/2, cy = H/2;
  const rw = W * 0.12;

  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = C.grass;
  [[0,0,cx-rw,cy-rw],[cx+rw,0,W-(cx+rw),cy-rw],
   [0,cy+rw,cx-rw,H-(cy+rw)],[cx+rw,cy+rw,W-(cx+rw),H-(cy+rw)]]
    .forEach(([x,y,w,h]) => ctx.fillRect(x,y,w,h));

  ctx.fillStyle = C.road;
  ctx.fillRect(cx-rw, 0, rw*2, H);
  ctx.fillRect(0, cy-rw, W, rw*2);

  ctx.strokeStyle = C.line;
  ctx.lineWidth = Math.max(1.5, W*0.0025);
  ctx.setLineDash([W*0.025, W*0.02]);
  [[cx,0,cx,cy-rw],[cx,cy+rw,cx,H],[0,cy,cx-rw,cy],[cx+rw,cy,W,cy]]
    .forEach(([x1,y1,x2,y2]) => { ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke(); });
  ctx.setLineDash([]);

  ctx.fillStyle = '#122030';
  ctx.fillRect(cx-rw, cy-rw, rw*2, rw*2);

  ctx.fillStyle = '#1E3A5A';
  for (let i = 0; i < 5; i++) ctx.fillRect(cx-rw+6, cy-rw + i*(rw*0.35), rw*2-12, rw*0.14);

  // Semáforos FORA da via
  const sp = {
    N: [cx - rw - W*0.078, cy - rw - W*0.078],
    S: [cx + rw + W*0.018, cy + rw + W*0.018],
    E: [cx + rw + W*0.018, cy - rw - W*0.078],
    W: [cx - rw - W*0.078, cy + rw + W*0.018],
  };

  Object.entries(sp).forEach(([dir, [sx, sy]]) => {
    drawSemaforo(sx, sy, lights[dir], W);
    ctx.fillStyle = C.dim;
    ctx.font = `bold ${Math.max(10, W*0.022)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(dir, sx + W*0.018, sy + W*0.128);
  });

  drawQueue('N', cx - rw + W*0.02, cy - rw - W*0.03, 0, -1, W);
  drawQueue('S', cx + W*0.02,      cy + rw + W*0.03, 0,  1, W);
  drawQueue('E', cx + rw + W*0.03, cy - rw + W*0.02, 1,  0, W);
  drawQueue('W', cx - rw - W*0.03, cy + W*0.02,     -1,  0, W);

  vehicles.forEach(v => drawVehicle(v, W));
}

function drawSemaforo(x, y, phase, W) {
  const bw = W*0.036, bh = W*0.100, r = W*0.013;
  ctx.fillStyle = '#0A1525';
  ctx.strokeStyle = '#1B6EF3';
  ctx.lineWidth = Math.max(1.5, W*0.0025);
  ctx.beginPath(); ctx.roundRect(x, y, bw, bh, W*0.008); ctx.fill(); ctx.stroke();

  const phases = ['red','yellow','green'];
  const cols = [C.red, C.yellow, C.green];

  phases.forEach((p, i) => {
    const active = phase === p;
    const ly = y + bh*0.18 + i*bh*0.30;
    ctx.beginPath(); ctx.arc(x+bw/2, ly, r, 0, Math.PI*2);
    ctx.fillStyle = '#0D1A2A'; ctx.fill();

    if (active) {
      ctx.shadowColor = cols[i];
      ctx.shadowBlur = W * 0.048;
      ctx.beginPath(); ctx.arc(x+bw/2, ly, r*0.92, 0, Math.PI*2);
      ctx.fillStyle = cols[i]; ctx.fill();
      ctx.shadowBlur = 0;
      ctx.beginPath(); ctx.arc(x+bw/2, ly, r*0.42, 0, Math.PI*2);
      ctx.fillStyle = '#FFFFFF'; ctx.globalAlpha = 0.75; ctx.fill();
      ctx.globalAlpha = 1;
    }
  });
  ctx.shadowBlur = 0;
}

function drawQueue(dir, x, y, dx, dy, W) {
  const n = Math.min(queues[dir]||0, 8);
  const cw = W*0.032, ch = W*0.020, gap = W*0.040;
  for (let i = 0; i < n; i++) {
    ctx.globalAlpha = Math.max(0.3, 0.8 - i*0.07);
    ctx.fillStyle = '#4FC3F7';
    ctx.beginPath();
    ctx.roundRect(x+dx*i*gap-cw/2, y+dy*i*gap-ch/2, cw, ch, W*0.005);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawLiveChart() {
  const c = document.getElementById('live-chart');
  if (!c) return;
  const x = c.getContext('2d');
  c.width = c.offsetWidth||280; c.height = 90;
  const W=c.width, H=c.height;
  x.clearRect(0,0,W,H);
  if (waitHistory.length < 2) return;
  const max = Math.max(...waitHistory,1);
  x.strokeStyle='#4FC3F7'; x.lineWidth=2; x.beginPath();
  waitHistory.forEach((v,i)=>{
    const px=(i/(waitHistory.length-1))*W, py=H-(v/max)*(H-10)-5;
    i===0?x.moveTo(px,py):x.lineTo(px,py);
  });
  x.stroke();
  const grad=x.createLinearGradient(0,0,0,H);
  grad.addColorStop(0,'rgba(79,195,247,0.25)'); grad.addColorStop(1,'rgba(79,195,247,0)');
  x.lineTo(W,H); x.lineTo(0,H); x.closePath(); x.fillStyle=grad; x.fill();
  x.fillStyle='#90CAF9'; x.font='10px sans-serif'; x.fillText('Espera média',4,12);
}

function updatePanel(snap) {
  document.getElementById('m-cycle').textContent = snap.cycle||0;
  document.getElementById('m-waiting').textContent = snap.total_waiting||0;
  document.getElementById('m-passed').textContent = snap.passed||0;
  document.getElementById('m-avgwait').textContent = snap.avg_wait||0;

  ['N','S','E','W'].forEach(d=>{
    const q=(snap.queues||{})[d]||0;
    const bar=document.getElementById('q-bar-'+d);
    const num=document.getElementById('q-num-'+d);
    if(bar) bar.style.width=Math.min(q/10*100,100)+'%';
    if(num) num.textContent=q;
  });

  const gp = snap.green_pair || 'NS';

  if (lastGreenPair !== null && lastGreenPair !== gp) {
    yellowTimer = YELLOW_FRAMES;
  }
  const prevPair = lastGreenPair;
  lastGreenPair = gp;

  ['N','S','E','W'].forEach(d=>{
    let phase;
    if (yellowTimer > 0) {
      // par que estava verde → amarelo; o novo ainda vermelho
      const wasGreen = prevPair && (((prevPair==='NS')&&(d==='N'||d==='S'))||((prevPair==='EW')&&(d==='E'||d==='W')));
      phase = wasGreen ? 'yellow' : 'red';
    } else {
      phase = ((gp==='NS'&&(d==='N'||d==='S'))||(gp==='EW'&&(d==='E'||d==='W'))) ? 'green' : 'red';
    }
    lights[d] = phase;
    const el = document.getElementById('light-'+d);
    if (el) el.className = 'light-circle '+phase;
  });

  if (yellowTimer > 0) yellowTimer--;

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

  waitHistory.push(snap.avg_wait||0);
  if (waitHistory.length > 60) waitHistory.shift();
  drawLiveChart();
}

async function simLoop() {
  try {
    const res = await fetch('/api/step', {method:'POST'});
    if (!res.ok) { stopSim(); return; }
    const snap = await res.json();
    if (snap.error) { stopSim(); return; }

    updateVehicles(snap.green_pair);

    if (vehicles.length < 18 && Math.random() < 0.55)
      spawnVehicle(['N','S','E','W'][Math.floor(Math.random()*4)]);
    if (vehicles.length < 12 && Math.random() < 0.45)
      spawnVehicle(['N','S','E','W'][Math.floor(Math.random()*4)]);

    updatePanel(snap);
    drawScene();
  } catch(e) { stopSim(); }
}

async function startSim() {
  const mode = document.getElementById('sel-mode').value;
  const spawn = parseFloat(document.getElementById('sel-spawn').value);
  await fetch('/api/start', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({mode, spawn_rate:spawn})
  });
  simRunning = true; waitHistory = []; vehicles = [];
  lastGreenPair = null; yellowTimer = 0;
  lights = {N:'red',S:'red',E:'red',W:'red'};
  document.getElementById('btn-start').disabled = true;
  document.getElementById('btn-stop').disabled = false;
  simInterval = setInterval(simLoop, 300);
}

async function stopSim() {
  clearInterval(simInterval);
  simRunning = false;
  await fetch('/api/stop', {method:'POST'});
  document.getElementById('btn-start').disabled = false;
  document.getElementById('btn-stop').disabled = true;
}

document.getElementById('btn-start').addEventListener('click', startSim);
document.getElementById('btn-stop').addEventListener('click', stopSim);
document.getElementById('sel-spawn').addEventListener('input', e=>{
  document.getElementById('spawn-val').textContent = parseFloat(e.target.value).toFixed(1);
});

drawScene();

// Comparação
document.getElementById('btn-compare').addEventListener('click', async ()=>{
  const btn = document.getElementById('btn-compare');
  const cycles = parseInt(document.getElementById('cmp-cycles').value)||100;
  const spawn = parseFloat(document.getElementById('cmp-spawn').value)||0.4;
  btn.disabled = true; btn.textContent = '⏳ Simulando...';
  try {
    const res = await fetch('/api/compare', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({cycles, spawn_rate:spawn})
    });
    const data = await res.json();
    document.getElementById('cmp-ai-wait').textContent = data.ai.avg_wait_mean;
    document.getElementById('cmp-fixed-wait').textContent = data.fixed.avg_wait_mean;
    document.getElementById('cmp-ai-pass').textContent = data.ai.total_passed;
    document.getElementById('cmp-fixed-pass').textContent = data.fixed.total_passed;
    document.getElementById('cmp-improvement').textContent = data.improvement_pct+'%';
    document.getElementById('cmp-label').textContent =
      data.improvement_pct > 0
        ? 'A IA foi '+data.improvement_pct+'% mais eficiente no tempo médio de espera'
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
  c.width = c.offsetWidth||700; c.height = 260;
  const W=c.width, H=c.height, pad={t:20,r:20,b:40,l:50};
  const iW=W-pad.l-pad.r, iH=H-pad.t-pad.b;
  x.clearRect(0,0,W,H); x.fillStyle='#0D2240'; x.fillRect(0,0,W,H);
  const maxV = Math.max(...histAI,...histFixed,1);
  const toX = i=>pad.l+(i/(cycles-1))*iW;
  const toY = v=>pad.t+iH-(v/maxV)*iH;
  x.strokeStyle='#1B3A6E'; x.lineWidth=0.5;
  for(let i=0;i<=4;i++){
    const gy=pad.t+(i/4)*iH;
    x.beginPath(); x.moveTo(pad.l,gy); x.lineTo(W-pad.r,gy); x.stroke();
    x.fillStyle='#90CAF9'; x.font='10px sans-serif'; x.textAlign='right';
    x.fillText(((1-i/4)*maxV).toFixed(1), pad.l-6, gy+4);
  }
  function drawLine(data,color){
    x.strokeStyle=color; x.lineWidth=2; x.beginPath();
    data.forEach((v,i)=>{i===0?x.moveTo(toX(i),toY(v)):x.lineTo(toX(i),toY(v));});
    x.stroke();
    const grad=x.createLinearGradient(0,pad.t,0,pad.t+iH);
    grad.addColorStop(0,color+'44'); grad.addColorStop(1,color+'00');
    x.lineTo(toX(data.length-1),pad.t+iH); x.lineTo(toX(0),pad.t+iH);
    x.closePath(); x.fillStyle=grad; x.fill();
  }
  drawLine(histFixed,'#E53935'); drawLine(histAI,'#4FC3F7');
  x.fillStyle='#4FC3F7'; x.fillRect(pad.l,H-22,16,3);
  x.fillStyle='#E8F4FD'; x.font='11px sans-serif'; x.textAlign='left';
  x.fillText('IA (Q-Learning)',pad.l+20,H-16);
  x.fillStyle='#E53935'; x.fillRect(pad.l+160,H-22,16,3);
  x.fillStyle='#E8F4FD'; x.fillText('Tempo Fixo',pad.l+180,H-16);
  x.fillStyle='#90CAF9'; x.textAlign='center'; x.fillText('Ciclos →',W/2,H-2);
}

// Splash logo (mesmo da versão anterior)
(function createAnimatedLogoSplash(){
  const overlay=document.createElement('div');
  overlay.id='logo-splash-overlay';
  overlay.style.cssText='position:fixed;inset:0;z-index:99999;background:rgba(5,13,26,0.92);display:flex;align-items:center;justify-content:center;cursor:pointer;transition:opacity 0.6s ease;';
  const logoBox=document.createElement('div');
  logoBox.style.cssText='position:relative;width:min(85vw,480px);height:min(85vw,480px);max-width:480px;max-height:480px;border-radius:16px;overflow:hidden;box-shadow:0 0 60px rgba(0,191,255,0.35),0 0 120px rgba(27,110,243,0.2);cursor:default;';
  const logoCanvas=document.createElement('canvas');
  logoCanvas.style.cssText='width:100%;height:100%;display:block;';
  logoBox.appendChild(logoCanvas);
  const caption=document.createElement('div');
  caption.style.cssText='position:absolute;bottom:18px;left:0;right:0;text-align:center;pointer-events:none;font-family:Segoe UI,system-ui,sans-serif;';
  caption.innerHTML='<div style="font-size:1.35rem;font-weight:700;color:#4FC3F7;letter-spacing:1px;">SMART <span style="color:#1B6EF3;">TRAFFIC LIGHT</span></div><div style="font-size:0.72rem;color:#90CAF9;margin-top:6px;opacity:0.9;">Controle de tráfego com IA · Cidades mais inteligentes, vias mais fluidas</div><div style="font-size:0.65rem;color:#4FC3F7;margin-top:14px;opacity:0.7;">Clique em qualquer lugar fora da logo para continuar</div>';
  logoBox.appendChild(caption); overlay.appendChild(logoBox); document.body.appendChild(overlay);
  const lctx=logoCanvas.getContext('2d'); let animId=null, t=0;
  function resizeLogoCanvas(){const size=Math.min(logoBox.clientWidth,logoBox.clientHeight,480);logoCanvas.width=size;logoCanvas.height=size;}
  resizeLogoCanvas(); window.addEventListener('resize',resizeLogoCanvas);
  const nodes=[]; for(let i=0;i<18;i++){const a=(i/18)*Math.PI*2,r=0.28+(i%3)*0.08;nodes.push({x:0.5+Math.cos(a)*r,y:0.42+Math.sin(a)*r*0.85,phase:Math.random()*Math.PI*2,speed:0.02+Math.random()*0.03});}
  nodes.push({x:0.5,y:0.42,phase:0,speed:0.04},{x:0.5,y:0.32,phase:1,speed:0.03},{x:0.5,y:0.52,phase:2,speed:0.03},{x:0.38,y:0.42,phase:3,speed:0.03},{x:0.62,y:0.42,phase:4,speed:0.03});
  function drawLogoFrame(){
    const W=logoCanvas.width,H=logoCanvas.height; if(W<10)return;
    lctx.fillStyle='#050D1A'; lctx.fillRect(0,0,W,H);
    const grd=lctx.createRadialGradient(W/2,H*0.42,0,W/2,H*0.42,W*0.55); grd.addColorStop(0,'rgba(27,110,243,0.12)'); grd.addColorStop(1,'rgba(5,13,26,0)'); lctx.fillStyle=grd; lctx.fillRect(0,0,W,H);
    const cx=W*0.5,cy=H*0.42,roadW=W*0.11;
    lctx.fillStyle='#1A2E4A'; lctx.fillRect(cx-roadW,0,roadW*2,H*0.75); lctx.fillRect(0,cy-roadW,W,roadW*2);
    lctx.strokeStyle='#4FC3F7'; lctx.lineWidth=Math.max(1.5,W*0.004); lctx.setLineDash([W*0.03,W*0.025]); lctx.globalAlpha=0.7+0.3*Math.sin(t*0.05);
    lctx.beginPath(); lctx.moveTo(cx,0);lctx.lineTo(cx,cy-roadW); lctx.moveTo(cx,cy+roadW);lctx.lineTo(cx,H*0.75); lctx.moveTo(0,cy);lctx.lineTo(cx-roadW,cy); lctx.moveTo(cx+roadW,cy);lctx.lineTo(W,cy); lctx.stroke(); lctx.setLineDash([]); lctx.globalAlpha=1;
    for(let i=0;i<12;i++){const progress=((t*0.008+i*0.12)%1); const isVert=i%2===0; let px,py; if(isVert){px=cx+(i%4-1.5)*roadW*0.35;py=progress*H*0.75;}else{px=progress*W;py=cy+(i%4-1.5)*roadW*0.35;} lctx.beginPath();lctx.arc(px,py,W*0.008,0,Math.PI*2);lctx.fillStyle=`rgba(79,195,247,${0.3+0.5*Math.sin(t*0.1+i)})`;lctx.fill();}
    for(let i=0;i<nodes.length;i++)for(let j=i+1;j<nodes.length;j++){const dx=nodes[i].x-nodes[j].x,dy=nodes[i].y-nodes[j].y,dist=Math.sqrt(dx*dx+dy*dy);if(dist<0.22){lctx.strokeStyle=`rgba(79,195,247,${0.15+0.25*Math.sin(t*0.04+i+j)})`;lctx.beginPath();lctx.moveTo(nodes[i].x*W,nodes[i].y*H);lctx.lineTo(nodes[j].x*W,nodes[j].y*H);lctx.stroke();}}
    nodes.forEach((n,i)=>{const pulse=0.6+0.4*Math.sin(t*n.speed*10+n.phase);const r=W*(0.012+0.008*pulse);const x=n.x*W,y=n.y*H;lctx.beginPath();lctx.arc(x,y,r*2.2,0,Math.PI*2);lctx.fillStyle=`rgba(79,195,247,${0.08*pulse})`;lctx.fill();lctx.beginPath();lctx.arc(x,y,r,0,Math.PI*2);lctx.fillStyle=i<5?'#4FC3F7':'#1B6EF3';lctx.shadowColor='#4FC3F7';lctx.shadowBlur=12*pulse;lctx.fill();lctx.shadowBlur=0;});
    const lightPositions=[{x:cx-roadW-W*0.06,y:cy-roadW-W*0.06},{x:cx+roadW+W*0.01,y:cy+roadW+W*0.01},{x:cx+roadW+W*0.01,y:cy-roadW-W*0.06},{x:cx-roadW-W*0.06,y:cy+roadW+W*0.01}];
    const cycle=Math.floor(t/40)%4;
    lightPositions.forEach((pos,idx)=>{const bw=W*0.038,bh=W*0.10,r=W*0.013;lctx.fillStyle='#0A1F3A';lctx.strokeStyle='#1B6EF3';lctx.lineWidth=1.5;lctx.beginPath();lctx.roundRect(pos.x,pos.y,bw,bh,W*0.01);lctx.fill();lctx.stroke();
      const phases=['red','yellow','green'],colors=['#FF1744','#FFEA00','#00E676']; let activePhase='red';
      if(idx===0||idx===1){if(cycle===0)activePhase='green';else if(cycle===1)activePhase='yellow';else activePhase='red';}
      else{if(cycle===2)activePhase='green';else if(cycle===3)activePhase='yellow';else activePhase='red';}
      phases.forEach((p,i)=>{const active=p===activePhase;const ly=pos.y+bh*0.18+i*bh*0.28;lctx.beginPath();lctx.arc(pos.x+bw/2,ly,r,0,Math.PI*2);lctx.fillStyle=active?colors[i]:'#1A2E4A';if(active){lctx.shadowColor=colors[i];lctx.shadowBlur=W*0.03;}lctx.fill();lctx.shadowBlur=0;});
    });
    lctx.strokeStyle=`rgba(79,195,247,${0.25+0.15*Math.sin(t*0.03)})`;lctx.lineWidth=1.5;lctx.beginPath();lctx.arc(cx,cy,W*0.38,0,Math.PI*2);lctx.stroke();
    for(let i=0;i<24;i++){const a=(i/24)*Math.PI*2+t*0.008;const rx=cx+Math.cos(a)*W*0.38,ry=cy+Math.sin(a)*W*0.38;lctx.beginPath();lctx.arc(rx,ry,2.5,0,Math.PI*2);lctx.fillStyle=i%3===0?'#4FC3F7':'rgba(79,195,247,0.4)';lctx.fill();}
    t++; animId=requestAnimationFrame(drawLogoFrame);
  }
  drawLogoFrame();
  overlay.addEventListener('click',e=>{if(e.target===overlay){cancelAnimationFrame(animId);overlay.style.opacity='0';setTimeout(()=>overlay.remove(),600);}});
  logoBox.addEventListener('click',e=>e.stopPropagation());
})();
