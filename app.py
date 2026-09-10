from flask import Flask, jsonify, render_template, request
from flask_cors import CORS
from models.simulation import Simulation

app = Flask(__name__)
CORS(app)

# ── Estado global da simulação (passo-a-passo para o frontend) ────────────
_sim = None

# ═══════════════════════════════════════════════════════════════════════════
# ROTAS PRINCIPAIS
# ═══════════════════════════════════════════════════════════════════════════

@app.route('/')
def index():
    return render_template('index.html')

# ── Iniciar / reiniciar simulação passo-a-passo ───────────────────────────
@app.route('/api/start', methods=['POST'])
def start():
    global _sim
    data       = request.get_json(silent=True) or {}
    mode       = data.get('mode', 'ai')          # 'ai' | 'fixed'
    spawn_rate = float(data.get('spawn_rate', 0.4))
    fixed_cycle = int(data.get('fixed_cycle', 5))
    _sim = Simulation(mode=mode, spawn_rate=spawn_rate, fixed_cycle=fixed_cycle)
    _sim.running = True
    return jsonify({"status": "started", "mode": mode})

# ── Avançar um ciclo ──────────────────────────────────────────────────────
@app.route('/api/step', methods=['POST'])
def step():
    global _sim
    if _sim is None or not _sim.running:
        return jsonify({"error": "Simulação não iniciada"}), 400
    snap = _sim.step()
    return jsonify(snap)

# ── Parar simulação ───────────────────────────────────────────────────────
@app.route('/api/stop', methods=['POST'])
def stop():
    global _sim
    if _sim:
        _sim.running  = False
        _sim.finished = True
    return jsonify({"status": "stopped"})

# ── Resumo da simulação atual ─────────────────────────────────────────────
@app.route('/api/summary')
def summary():
    global _sim
    if _sim is None:
        return jsonify({"error": "Nenhuma simulação iniciada"}), 400
    return jsonify(_sim.summary())

# ── Comparação completa: IA vs Tempo Fixo ────────────────────────────────
@app.route('/api/compare', methods=['POST'])
def compare():
    data        = request.get_json(silent=True) or {}
    cycles      = int(data.get('cycles', 100))
    spawn_rate  = float(data.get('spawn_rate', 0.4))
    fixed_cycle = int(data.get('fixed_cycle', 5))

    sim_ai    = Simulation(mode='ai',    spawn_rate=spawn_rate, fixed_cycle=fixed_cycle)
    sim_fixed = Simulation(mode='fixed', spawn_rate=spawn_rate, fixed_cycle=fixed_cycle)

    result_ai    = sim_ai.run_all(cycles)
    result_fixed = sim_fixed.run_all(cycles)

    # Histórico de tempo de espera por ciclo (para gráfico de linha)
    history_ai    = [h["avg_wait"] for h in sim_ai.history]
    history_fixed = [h["avg_wait"] for h in sim_fixed.history]

    # Melhoria percentual da IA sobre tempo fixo
    if result_fixed["avg_wait_mean"] > 0:
        improvement = round(
            (1 - result_ai["avg_wait_mean"] / result_fixed["avg_wait_mean"]) * 100, 1
        )
    else:
        improvement = 0.0

    return jsonify({
        "ai":          result_ai,
        "fixed":       result_fixed,
        "history_ai":    history_ai,
        "history_fixed": history_fixed,
        "improvement_pct": improvement,
    })

# ── Histórico completo da simulação atual (para gráfico ao vivo) ──────────
@app.route('/api/history')
def history():
    global _sim
    if _sim is None:
        return jsonify([])
    return jsonify(_sim.history[-50:])   # últimos 50 ciclos

if __name__ == '__main__':
    app.run(debug=True)
