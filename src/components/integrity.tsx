"use client";

import { useState } from "react";
import clsx from "clsx";
import type { IntegrityReport } from "@/core/domain";
import { Badge } from "./ui";

export function IntegrityPanel({ report }: { report: IntegrityReport }) {
  const [open, setOpen] = useState(false);
  const items: { label: string; n: number; failing: boolean }[] = [
    { label: "Duplicate questions", n: report.duplicateQuestions.length, failing: true },
    { label: "Near-duplicates across splits", n: report.nearDuplicatesAcrossSplits.length, failing: false },
    { label: "Templates repeated across splits", n: report.templateRepeatsAcrossSplits.length, failing: false },
    { label: "Evidence in question text", n: report.evidenceInQuestionText.length, failing: true },
    { label: "Distractor answer leakage", n: report.distractorLeakage.length, failing: true },
    { label: "Identifier collisions", n: report.identifierCollisions.length, failing: true },
    { label: "Evidence missing from corpus", n: report.missingEvidence.length, failing: true },
    { label: "Duplicate documents", n: report.duplicateDocuments.length, failing: true },
    { label: "Duplicate sources", n: report.duplicateSources.length, failing: true },
  ];
  const issues = [
    ...report.duplicateQuestions,
    ...report.nearDuplicatesAcrossSplits,
    ...report.templateRepeatsAcrossSplits,
    ...report.evidenceInQuestionText,
    ...report.distractorLeakage,
    ...report.identifierCollisions,
    ...report.missingEvidence,
    ...report.duplicateDocuments,
    ...report.duplicateSources,
    ...report.unscorableQuestions,
  ];
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3 text-sm">
        <Badge tone={report.passed ? "accent" : "danger"}>{report.passed ? "Passed" : "Issues found"}</Badge>
        <span className="tnum text-fg-2">
          Optimization questions <b className="text-fg">{report.optimizationQuestions}</b> · Held-out questions <b className="text-fg">{report.validationQuestions}</b>
        </span>
      </div>
      <ul className="grid gap-x-6 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((i) => (
          <li key={i.label} className="flex items-center justify-between gap-2 border-b border-line py-1.5 text-xs">
            <span className="text-fg-2">{i.label}</span>
            <span className={clsx("tnum font-semibold", i.n === 0 ? "text-accent" : i.failing ? "text-danger" : "text-warn")}>{i.n}</span>
          </li>
        ))}
      </ul>
      {issues.length > 0 && (
        <button onClick={() => setOpen(!open)} className="mt-3 text-xs font-medium text-accent hover:underline">
          {open ? "Hide" : "Show"} {issues.length} finding{issues.length === 1 ? "" : "s"}
        </button>
      )}
      {open && (
        <ul className="mt-2 space-y-1 text-xs text-fg-2">
          {issues.map((i, k) => (
            <li key={k}>
              <Badge>{i.kind}</Badge> {i.detail}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
