/** S7 product-constrained ceiling check (PREREGISTRATION §9): Baseline A optimization-set Recall@5 at 2K. Optimization questions only. */
import fs from "node:fs";
import type { PlanConfig, TrialSummary } from "@/core/domain";
import { planKey } from "@/engine/labels";
import { readJson } from "./datasets/enterpriserag";
import { loadPrimaryQuestions, toHarnessQuestions } from "./datasets/wixqa";
import { selectOn, type QOutcome, type SearchResult } from "./select";
import { rankMetrics } from "./scorers";

const s = readJson<{ baselineKey: string; trials: TrialSummary[]; routedClass: Record<string, string>; outcomes: Record<string, Record<string, QOutcome>> }>("validation/work/wixqa/v1-2000/search.json");
const qs = toHarnessQuestions(await loadPrimaryQuestions(), readJson<any>("validation/splits/wixqa.json").questions).filter((q) => q.split === "optimization");
const res = { questions: qs, trials: s.trials, outcomes: new Map(Object.entries(s.outcomes).map(([k, m]) => [k, new Map(Object.entries(m))])), routedClass: new Map(Object.entries(s.routedClass)), baselineKey: s.baselineKey } as unknown as SearchResult;
const A = (c: PlanConfig) => c.retrievalStrategy === "lexical" && !c.exactMatchBoost && c.graphStrategy === "none" && c.reranker === "none";
const sel = selectOn(res, qs, "*", "quality", {}, A);
const k = planKey(sel.config);
const r5 = qs.reduce((a, q) => a + rankMetrics(s.outcomes[k][q.id].ranking!, q.goldDocIds!).recall5, 0) / qs.length;
const out = { check: "S7 (PREREGISTRATION §9)", scale: 2000, n: qs.length, baselineA: k, optimizationRecall5: Number(r5.toFixed(4)), threshold: 0.95, triggered: r5 >= 0.95, heldOutLabelsRead: 0 };
fs.writeFileSync("validation/results/wixqa-s7-2000.json", JSON.stringify(out, null, 2));
console.log(out);
