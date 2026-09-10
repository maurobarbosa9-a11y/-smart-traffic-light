import numpy as np
import random

class RLAgent:
    """
    Agente de Aprendizado por Reforço baseado em Q-Learning.
    Controla os semáforos de uma interseção de 4 vias.

    Estado: tupla com o tamanho das filas em cada via (Norte, Sul, Leste, Oeste)
             quantizado em 3 níveis: 0 (vazio), 1 (moderado), 2 (congestionado)
    Ação:   qual par de vias recebe sinal verde (0=NS, 1=LO)
    """

    def __init__(self, epsilon=1.0, alpha=0.1, gamma=0.95):
        self.epsilon       = epsilon        # taxa de exploração
        self.epsilon_min   = 0.05
        self.epsilon_decay = 0.995
        self.alpha         = alpha          # taxa de aprendizado
        self.gamma         = gamma          # fator de desconto
        self.q_table       = {}             # Q(estado, ação)
        self.n_actions     = 2              # 0=verde NS, 1=verde LO
        self.total_reward  = 0.0
        self.steps         = 0

    # ── Quantização do estado ──────────────────────────────────────────────
    def _quantize(self, queue_size):
        if queue_size <= 2:  return 0
        if queue_size <= 6:  return 1
        return 2

    def get_state(self, queues):
        """queues: dict com chaves N, S, E, W e valores inteiros."""
        return tuple(self._quantize(queues[d]) for d in ['N', 'S', 'E', 'W'])

    # ── Seleção de ação (epsilon-greedy) ──────────────────────────────────
    def choose_action(self, state):
        if random.random() < self.epsilon:
            return random.randint(0, self.n_actions - 1)
        q_vals = [self.q_table.get((state, a), 0.0) for a in range(self.n_actions)]
        return int(np.argmax(q_vals))

    # ── Atualização da Q-Table ─────────────────────────────────────────────
    def update(self, state, action, reward, next_state):
        key      = (state, action)
        old_q    = self.q_table.get(key, 0.0)
        next_max = max(self.q_table.get((next_state, a), 0.0)
                       for a in range(self.n_actions))
        self.q_table[key] = old_q + self.alpha * (
            reward + self.gamma * next_max - old_q
        )
        self.total_reward += reward
        self.steps        += 1
        # Decaimento de epsilon
        if self.epsilon > self.epsilon_min:
            self.epsilon *= self.epsilon_decay

    # ── Cálculo de recompensa ─────────────────────────────────────────────
    def compute_reward(self, queues_before, queues_after):
        """Recompensa = redução no total de veículos em fila."""
        total_before = sum(queues_before.values())
        total_after  = sum(queues_after.values())
        return float(total_before - total_after)

    def get_stats(self):
        return {
            "epsilon":      round(self.epsilon, 4),
            "q_table_size": len(self.q_table),
            "total_reward": round(self.total_reward, 2),
            "steps":        self.steps,
        }
