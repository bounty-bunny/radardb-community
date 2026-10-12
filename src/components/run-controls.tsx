"use client";

import { Progress } from "./ui";

const STAGES = [
  "Integrity checks",
  "Building representations",
  "Calibrating latency",
  "Embedding questions",
  "Searching configurations",
  "Selecting plans",
  "Validating on held-out questions",
];
const WEIGHTS = [0.02, 0.15, 0.05, 0.03, 0.6, 0.02, 0.13];

export function RunProgress({ progress, note = true }: { progress: { stage: string; done: number; total: number }; note?: boolean }) {
  const idx = Math.max(0, STAGES.indexOf(progress.stage));
  const within = progress.total ? progress.done / progress.total : 0;
  const overall = WEIGHTS.slice(0, idx).reduce((a, b) => a + b, 0) + WEIGHTS[idx] * within;
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-4 text-sm">
        <span className="font-medium text-fg">{progress.stage}…</span>
        <span className="tnum text-xs text-muted">
          {progress.stage === "Searching configurations" ? `${progress.done} / ${progress.total} configurations` : `${Math.round(overall * 100)}%`}
        </span>
      </div>
      <Progress value={overall} live />
      <ol className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
        {STAGES.map((s, i) => (
          <li key={s} className={i < idx ? "text-accent" : i === idx ? "font-medium text-fg" : "text-muted"}>
            {i < idx ? "✓ " : `${i + 1}. `}
            {s}
          </li>
        ))}
      </ol>
      {note && (
        <p className="mt-3 text-xs text-muted">
          Selection uses optimization questions only. Held-out questions are evaluated after plans are chosen. The first run downloads two
          local models (~45 MB) and caches embeddings, so later runs are faster.
        </p>
      )}
    </div>
  );
}
