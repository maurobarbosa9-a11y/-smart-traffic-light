import random
from models.rl_agent import RLAgent

DIRECTIONS = ['N', 'S', 'E', 'W']

class Vehicle:
    def __init__(self, vid, direction):
        self.id        = vid
        self.direction = direction
        self.wait_time = 0
        self.passed    = False

class TrafficLight:
    def __init__(self, direction):
        self.direction = direction
        self.phase     = 'red'

class Intersection:
    def __init__(self, spawn_rate=0.4):
        self.lights     = {d: TrafficLight(d) for d in DIRECTIONS}
        self.queues     = {d: []              for d in DIRECTIONS}
        self.spawn_rate = spawn_rate
        self.green_pair = 'NS'
        self._vid       = 0   # contador local de IDs de veículo

    def apply_phase(self, action):
        """action 0 → verde NS, action 1 → verde EW."""
        self.green_pair = 'NS' if action == 0 else 'EW'
        green_dirs = ['N', 'S'] if action == 0 else ['E', 'W']
        for d in DIRECTIONS:
            self.lights[d].phase = 'green' if d in green_dirs else 'red'

    def spawn_vehicles(self):
        for d in DIRECTIONS:
            if random.random() < self.spawn_rate:
                self._vid += 1
                self.queues[d].append(Vehicle(self._vid, d))

    def advance_vehicles(self, max_per_cycle=2):
        passed     = 0
        green_dirs = ['N', 'S'] if self.green_pair == 'NS' else ['E', 'W']
        for d in green_dirs:
            for _ in range(max_per_cycle):
                if self.queues[d]:
                    self.queues[d].pop(0)
                    passed += 1
        for d in DIRECTIONS:
            for v in self.queues[d]:
                v.wait_time += 1
        return passed

    def queue_sizes(self):
        return {d: len(self.queues[d]) for d in DIRECTIONS}

    def avg_wait(self):
        waits = [v.wait_time for d in DIRECTIONS for v in self.queues[d]]
        return round(sum(waits) / len(waits), 2) if waits else 0.0

    def total_waiting(self):
        return sum(len(self.queues[d]) for d in DIRECTIONS)


class Simulation:
    """Gerencia a simulação completa com modo IA ou tempo fixo."""

    def __init__(self, mode='ai', spawn_rate=0.4, fixed_cycle=5):
        self.mode          = mode
        self.inter         = Intersection(spawn_rate)
        self.agent         = RLAgent() if mode == 'ai' else None
        self.fixed_cycle   = fixed_cycle
        self.fixed_counter = 0
        self.cycle         = 0
        self.total_passed  = 0
        self.total_stops   = 0
        self.history       = []
        self.running       = False
        self.finished      = False

    def step(self):
        self.inter.spawn_vehicles()
        queues_before      = self.inter.queue_sizes()
        self.total_stops  += self.inter.total_waiting()

        if self.mode == 'ai':
            state      = self.agent.get_state(queues_before)
            action     = self.agent.choose_action(state)
            self.inter.apply_phase(action)
            passed     = self.inter.advance_vehicles()
            queues_after = self.inter.queue_sizes()
            reward     = self.agent.compute_reward(queues_before, queues_after)
            next_state = self.agent.get_state(queues_after)
            self.agent.update(state, action, reward, next_state)
        else:
            self.fixed_counter += 1
            if self.fixed_counter >= self.fixed_cycle:
                self.fixed_counter = 0
                cur = 0 if self.inter.green_pair == 'NS' else 1
                self.inter.apply_phase(1 - cur)
            passed = self.inter.advance_vehicles()

        self.total_passed += passed
        self.cycle        += 1

        snap = {
            "cycle":         self.cycle,
            "queues":        self.inter.queue_sizes(),
            "green_pair":    self.inter.green_pair,
            "avg_wait":      self.inter.avg_wait(),
            "total_waiting": self.inter.total_waiting(),
            "passed":        passed,
        }
        if self.mode == 'ai':
            snap["agent"] = self.agent.get_stats()
        self.history.append(snap)
        return snap

    def run_all(self, cycles=100):
        for _ in range(cycles):
            self.step()
        self.finished = True
        return self.summary()

    def summary(self):
        if not self.history:
            return {}
        avg_waits = [h["avg_wait"] for h in self.history]
        return {
            "mode":          self.mode,
            "cycles":        self.cycle,
            "total_passed":  self.total_passed,
            "total_stops":   self.total_stops,
            "avg_wait_mean": round(sum(avg_waits) / len(avg_waits), 2),
            "avg_wait_max":  round(max(avg_waits), 2),
            "throughput":    round(self.total_passed / max(self.cycle, 1), 2),
        }
