/**
 * V1.1B FusionContextPlan: exactly two component ContextPlans fused into one context.
 *
 *   query ─► shared query embedding ─┬─► primary branch (its own chunking/representation) ─┐
 *                                    └─► partner branch (its own chunking/representation) ─┤
 *                                                     document-level RRF (k = 60, as hybrid retrieval)
 *                                                     ─► optional shared cross-encoder rerank
 *                                                     ─► assembly under the primary plan's token budget
 *
 * Each branch is a normal `executePlan` run, so component behavior is identical
 * to the stand-alone plans. The token budget of the fused context equals the
 * context tokens the primary (Global Fixed) plan produced for this query.
 * Deterministic: every ordering has an explicit tie-break.
 */
import type { ContextItem, EmbeddingModel, FusionProvenance, PlanConfig } from "@/core/domain";
import type { RepresentationSet } from "../representations";
import { embeddingsFor, executePlan, prepareQuery, type ExecutionResult } from "../executor";
import { units } from "../assembler";
import { rerankScores } from "../models";
import { planKey } from "../labels";

export interface FusionPlanConfig {
  kind: "fusion";
  version: 1;
  primary: PlanConfig;
  partner: PlanConfig;
  /** RRF constant; 60 = the engine's hybrid-retrieval constant. */
  rrfK: number;
  sharedRerank: "none" | "cross-encoder";
  /** Candidates passed to the shared reranker (cross-encoder pool). */
  rerankPool: number;
}

export const fusionPlan = (primary: PlanConfig, partner: PlanConfig, sharedRerank: FusionPlanConfig["sharedRerank"] = "none"): FusionPlanConfig => ({
  kind: "fusion",
  version: 1,
  primary,
  partner,
  rrfK: 60,
  sharedRerank,
  rerankPool: 20,
});

export const fusionKey = (f: FusionPlanConfig) => `fusion[v${f.version}](${planKey(f.primary)} + ${planKey(f.partner)}; rrf${f.rrfK}; rerank=${f.sharedRerank})`;

export interface FusedCandidate {
  item: ContextItem;
  fusion: FusionProvenance;
  /** Position in the fused order (0-based) before any shared rerank. */
  order: number;
}

const docsOf = (items: ContextItem[]) => {
  const rank = new Map<string, number>();
  for (const it of items) if (!rank.has(it.provenance.documentId)) rank.set(it.provenance.documentId, rank.size + 1);
  return rank;
};

/**
 * Document-level reciprocal rank fusion of two branch contexts. Documents are
 * ordered by fused score; ties go to the better primary rank, then partner
 * rank, then document id. Each document contributes its primary-branch items
 * first, then its partner-branch items, each in branch order.
 */
export function fuseBranches(primary: ContextItem[], partner: ContextItem[], k = 60): FusedCandidate[] {
  const pr = docsOf(primary);
  const qr = docsOf(partner);
  const docs = [...new Set([...pr.keys(), ...qr.keys()])];
  const score = (d: string) => (pr.has(d) ? 1 / (k + pr.get(d)!) : 0) + (qr.has(d) ? 1 / (k + qr.get(d)!) : 0);
  docs.sort((a, b) => score(b) - score(a) || (pr.get(a) ?? Infinity) - (pr.get(b) ?? Infinity) || (qr.get(a) ?? Infinity) - (qr.get(b) ?? Infinity) || (a < b ? -1 : a > b ? 1 : 0));
  const out: FusedCandidate[] = [];
  for (const d of docs) {
    const document: FusionProvenance["document"] = pr.has(d) && qr.has(d) ? "both" : pr.has(d) ? "primary-only" : "partner-only";
    const base = { document, ...(pr.has(d) ? { primaryDocRank: pr.get(d) } : {}), ...(qr.has(d) ? { partnerDocRank: qr.get(d) } : {}), fusedScore: Number(score(d).toFixed(6)) };
    for (const item of primary.filter((i) => i.provenance.documentId === d)) out.push({ item, fusion: { branch: "primary", ...base }, order: out.length });
    for (const item of partner.filter((i) => i.provenance.documentId === d)) out.push({ item, fusion: { branch: "partner", ...base }, order: out.length });
  }
  return out;
}

/**
 * Assembler semantics of the frozen ContextAssembler applied to fused
 * candidates: drop repeated chunks and chunks whose text is ≥ 80% already
 * included, then fill the token budget greedily in order.
 */
export function assembleFused(cands: FusedCandidate[], maxTokens: number, plan: { id: string; version: number }) {
  const seenChunks = new Set<string>();
  const seenUnits = new Set<string>();
  const items: ContextItem[] = [];
  let used = 0;
  let droppedDuplicates = 0;
  let droppedForBudget = 0;
  for (const c of cands) {
    const chunkKey = `${c.fusion.branch}:${c.item.provenance.chunkId}`;
    if (seenChunks.has(chunkKey) || seenChunks.has(c.item.provenance.chunkId)) {
      droppedDuplicates++;
      continue;
    }
    const u = units(c.item.text);
    const covered = u.length ? u.filter((x) => seenUnits.has(x)).length / u.length : 0;
    if (covered >= 0.8) {
      droppedDuplicates++;
      continue;
    }
    if (used + c.item.tokens > maxTokens) {
      droppedForBudget++;
      continue;
    }
    seenChunks.add(chunkKey);
    seenChunks.add(c.item.provenance.chunkId);
    u.forEach((x) => seenUnits.add(x));
    used += c.item.tokens;
    items.push({ ...c.item, provenance: { ...c.item.provenance, rank: items.length + 1, planId: plan.id, planVersion: plan.version, fusion: c.fusion } });
  }
  return { items, tokens: used, droppedDuplicates, droppedForBudget };
}

export interface FusionLatency {
  embedMs: number;
  primaryBranchMs: number;
  partnerBranchMs: number;
  /** Wall-clock of the concurrent branch section. */
  branchesWallMs: number;
  fusionMs: number;
  rerankMs: number;
  assemblyMs: number;
  totalMs: number;
}

export interface FusionResult {
  plan: FusionPlanConfig;
  items: ContextItem[];
  tokens: number;
  /** Token budget = context tokens of the primary (Global Fixed) plan for this query. */
  budget: number;
  primary: ExecutionResult;
  partner: ExecutionResult;
  rerankPairs: number;
  droppedDuplicates: number;
  droppedForBudget: number;
  latency: FusionLatency;
}

export interface FusionExecuteOptions {
  plan: { id: string; version: number };
  cache?: boolean;
  /** Execute branches concurrently (default) or sequentially (for latency attribution). */
  concurrent?: boolean;
}

export async function executeFusionPlan(
  f: FusionPlanConfig,
  query: string,
  reps: { primary: RepresentationSet; partner: RepresentationSet },
  opts: FusionExecuteOptions,
): Promise<FusionResult> {
  const cache = opts.cache !== false;
  const t0 = performance.now();
  const models = [...new Set<EmbeddingModel>([...embeddingsFor(f.primary), ...embeddingsFor(f.partner)])];
  const prepared = await prepareQuery(query, models, cache);
  const t1 = performance.now();
  const timed = async (cfg: PlanConfig, r: RepresentationSet, branch: string) => {
    const s = performance.now();
    const res = await executePlan(cfg, query, r, { plan: { id: `${opts.plan.id}#${branch}`, version: opts.plan.version }, cache, prepared });
    return { res, ms: performance.now() - s };
  };
  const [p, q] =
    opts.concurrent === false
      ? [await timed(f.primary, reps.primary, "primary"), await timed(f.partner, reps.partner, "partner")]
      : await Promise.all([timed(f.primary, reps.primary, "primary"), timed(f.partner, reps.partner, "partner")]);
  const t2 = performance.now();
  let cands = fuseBranches(p.res.items, q.res.items, f.rrfK);
  const t3 = performance.now();
  let rerankPairs = 0;
  if (f.sharedRerank === "cross-encoder" && cands.length) {
    const pool = cands.slice(0, f.rerankPool);
    const scores = await rerankScores(query, pool.map((c) => c.item.text), { cache });
    rerankPairs = pool.length;
    const reranked = pool.map((c, j) => ({ c, s: scores[j] })).sort((a, b) => b.s - a.s || a.c.order - b.c.order);
    cands = [...reranked.map((x) => ({ ...x.c, item: { ...x.c.item, provenance: { ...x.c.item.provenance, rerankScore: Number(x.s.toFixed(4)) } } })), ...cands.slice(f.rerankPool)];
  }
  const t4 = performance.now();
  const budget = p.res.tokens;
  const asm = assembleFused(cands, budget, opts.plan);
  const t5 = performance.now();
  return {
    plan: f,
    items: asm.items,
    tokens: asm.tokens,
    budget,
    primary: p.res,
    partner: q.res,
    rerankPairs,
    droppedDuplicates: asm.droppedDuplicates,
    droppedForBudget: asm.droppedForBudget,
    latency: { embedMs: t1 - t0, primaryBranchMs: p.ms, partnerBranchMs: q.ms, branchesWallMs: t2 - t1, fusionMs: t3 - t2, rerankMs: t4 - t3, assemblyMs: t5 - t4, totalMs: t5 - t0 },
  };
}
