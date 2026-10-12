import type { PlanConfig, TrialSummary } from "@/core/domain";
import { planKey } from "../labels";

/**
 * Proposes configurations to evaluate. Sequential by design so adaptive
 * strategies (Bayesian, learned) can use the history of results.
 */
export interface OptimizerStrategy {
  readonly name: string;
  readonly params: Record<string, number | string>;
  init(space: PlanConfig[]): void;
  /** Next configuration to evaluate, or null when done. */
  next(history: TrialSummary[]): PlanConfig | null;
  /** Upper bound on how many configurations will be proposed. */
  readonly budget: number;
}

/** Evaluates every configuration. The ground truth smarter strategies are measured against. */
export class ExhaustiveSearch implements OptimizerStrategy {
  readonly name = "exhaustive";
  readonly params = {};
  private queue: PlanConfig[] = [];
  budget = 0;
  init(space: PlanConfig[]) {
    this.queue = [...space];
    this.budget = space.length;
  }
  next() {
    return this.queue.shift() ?? null;
  }
}

/** Uniform sample without replacement, seeded for reproducibility. */
export class RandomSearch implements OptimizerStrategy {
  readonly name = "random";
  readonly params: Record<string, number>;
  private queue: PlanConfig[] = [];
  budget = 0;
  constructor(
    private samples: number,
    private seed = 42,
  ) {
    this.params = { samples, seed };
  }
  init(space: PlanConfig[]) {
    let s = this.seed >>> 0;
    const rand = () => {
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const shuffled = [...space].sort((a, b) => planKey(a).localeCompare(planKey(b)));
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    this.queue = shuffled.slice(0, Math.min(this.samples, shuffled.length));
    this.budget = this.queue.length;
  }
  next() {
    return this.queue.shift() ?? null;
  }
}

// Future: BayesianSearch, LearnedOptimizer — trained on persisted ExperimentResult rows.

export function strategyFor(name: string, params: { samples?: number; seed?: number } = {}): OptimizerStrategy {
  if (name === "random") return new RandomSearch(params.samples ?? 60, params.seed ?? 42);
  return new ExhaustiveSearch();
}
