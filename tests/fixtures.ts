import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Document, EvalQuestion, PlanConfig } from "@/core/domain";
import { sha1 } from "@/engine/text";

export function doc(id: string, title: string, content: string, extra: Partial<Document["metadata"]> = {}): Document {
  return {
    id,
    sourceId: "src_test",
    externalId: id,
    content,
    metadata: { title, kind: "markdown", ...extra },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    version: 1,
    checksum: sha1(content),
  };
}

/** Small corpus with identifiers, paraphrase targets and cross-document links. */
export const DOCS: Document[] = [
  doc(
    "runbook",
    "Runbook: reverting a release",
    "# Runbook: reverting a release\n\n## Steps\nTo revert a bad deployment run deployctl rollback --service <name> --to <version>. Watch the canary dashboard for 10 minutes.",
  ),
  doc(
    "incident",
    "INC-9001 postmortem",
    "# INC-9001: checkout errors\n\n## Root cause\nDEP-9001 shipped a cache bug in cart-svc. The cache key ignored the currency, so carts showed wrong totals.",
  ),
  doc(
    "deploys",
    "Deploy log",
    "# Deploy log\n\n| Deploy | Service | Author | Approver |\n|---|---|---|---|\n| DEP-9001 | cart-svc | Ana Ruiz | Ben Ode |\n| DEP-9002 | search-svc | Cal Ivy | Dee Park |",
  ),
  doc("cafeteria", "Cafeteria menu", "# Cafeteria\n\nThe cafeteria serves soup on Mondays and pasta on Fridays. Coffee is free before 9 am."),
  doc("oncall", "On-call policy", "# On-call\n\n## Paging\nThe primary on-call must acknowledge a Sev1 page within 5 minutes. Escalation goes to the secondary after 5 minutes."),
  doc("flags", "Feature flags", "# Flags\n\nFlags are managed with flagctl. Kill switches must default to off and be documented."),
];

export function q(id: string, question: string, evidence: string[], split: EvalQuestion["split"], questionClass = "general"): EvalQuestion {
  return {
    id,
    question,
    questionClass,
    requiredEvidence: evidence,
    split,
    provenance: "manual",
    humanVerified: true,
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

export const QUESTIONS: EvalQuestion[] = [
  q("t1", "Who approved deploy DEP-9001?", ["DEP-9001 | cart-svc | Ana Ruiz | Ben Ode"], "optimization", "lookup"),
  q("t2", "Who approved deploy DEP-9002?", ["DEP-9002 | search-svc | Cal Ivy | Dee Park"], "optimization", "lookup"),
  q("t3", "What is the status of INC-9001?", ["DEP-9001 shipped a cache bug"], "optimization", "lookup"),
  q("t4", "How do I roll back a bad release?", ["deployctl rollback --service <name> --to <version>"], "optimization", "procedure"),
  q("t5", "How do we revert a deployment safely?", ["Watch the canary dashboard for 10 minutes"], "optimization", "procedure"),
  q("t6", "How can I page someone urgently?", ["acknowledge a Sev1 page within 5 minutes"], "optimization", "procedure"),
  q("t7", "Why were cart totals wrong?", ["The cache key ignored the currency"], "optimization", "root_cause"),
  q("t8", "Why did checkout show errors?", ["DEP-9001 shipped a cache bug"], "optimization", "root_cause"),
  q("t9", "Why must kill switches be documented?", ["Kill switches must default to off"], "optimization", "root_cause"),
  q("v1", "Which deploy broke the cart cache, and who approved it?", ["DEP-9001 shipped a cache bug", "DEP-9001 | cart-svc | Ana Ruiz | Ben Ode"], "validation", "root_cause"),
  q("v2", "How do I undo a release?", ["deployctl rollback --service <name> --to <version>"], "validation", "procedure"),
];

/** A small, model-free search space: lexical + hashed embeddings, no cross-encoder. */
export function cheapSpace(): PlanConfig[] {
  const out: PlanConfig[] = [];
  for (const chunkingStrategy of ["section", "fixed-256"] as const)
    for (const r of [
      { retrievalStrategy: "lexical", embeddingModel: null },
      { retrievalStrategy: "hybrid", embeddingModel: "hash-ngram" },
    ] as const)
      for (const exactMatchBoost of [false, true])
        for (const graphStrategy of ["none", "entity-expansion"] as const)
          for (const topK of [1, 3])
            out.push({ chunkingStrategy, ...r, exactMatchBoost, graphStrategy, reranker: "none", topK });
  return out;
}

export const CHEAP_BASELINE: PlanConfig = {
  chunkingStrategy: "fixed-512",
  retrievalStrategy: "vector",
  embeddingModel: "hash-ngram",
  exactMatchBoost: false,
  graphStrategy: "none",
  reranker: "none",
  topK: 2,
};

export function tempDir(prefix = "radar-test-"): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}
