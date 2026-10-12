import type { Document, EvalQuestion, IntegrityIssue, IntegrityReport, Source } from "@/core/domain";
import { normalize } from "./text";
import { extractEntities, isLinkingEntity } from "./entities";

const contentWords = (s: string) => new Set(normalize(s).split(" ").filter((w) => w.length > 3));

function jaccard(a: Set<string>, b: Set<string>): number {
  const inter = [...a].filter((x) => b.has(x)).length;
  const union = new Set([...a, ...b]).size;
  return union ? inter / union : 0;
}

/** Question with identifiers and numbers masked, to catch one template reused with different IDs. */
function template(q: string): string {
  let s = q;
  for (const e of extractEntities(q)) s = s.split(e).join("#");
  return normalize(s.replace(/\d+/g, "#"));
}

const alternatives = (q: EvalQuestion) =>
  q.requiredEvidence.map((e) => (Array.isArray(e) ? e : [e]).map(normalize).filter(Boolean));

/**
 * Evaluation integrity report. Failures (not warnings) make `passed` false:
 * duplicate questions, evidence in question text, evidence in distractors,
 * evidence missing from the corpus, duplicate documents, identifier collisions.
 * Near-duplicates and template repeats across splits are warnings.
 */
export function computeIntegrity(questions: EvalQuestion[], documents: Document[], sources: Source[]): IntegrityReport {
  const opt = questions.filter((q) => q.split === "optimization");
  const val = questions.filter((q) => q.split === "validation");
  const issue = (kind: string, detail: string): IntegrityIssue => ({ kind, detail });

  const duplicateQuestions: IntegrityIssue[] = [];
  const seen = new Map<string, string>();
  for (const q of questions) {
    const k = normalize(q.question);
    if (seen.has(k)) duplicateQuestions.push(issue("duplicate", `${seen.get(k)} and ${q.id} are the same question`));
    else seen.set(k, q.id);
  }

  const nearDuplicatesAcrossSplits: IntegrityIssue[] = [];
  const templateRepeatsAcrossSplits: IntegrityIssue[] = [];
  for (const a of opt)
    for (const b of val) {
      const j = jaccard(contentWords(a.question), contentWords(b.question));
      if (j >= 0.6 && normalize(a.question) !== normalize(b.question))
        nearDuplicatesAcrossSplits.push(issue("near-duplicate", `${a.id} (optimization) ~ ${b.id} (held-out), word overlap ${j.toFixed(2)}`));
      if (template(a.question) === template(b.question) && normalize(a.question) !== normalize(b.question))
        templateRepeatsAcrossSplits.push(issue("template", `${a.id} and ${b.id} share the template "${template(a.question)}"`));
    }

  const evidenceInQuestionText: IntegrityIssue[] = [];
  for (const q of questions)
    for (const alts of alternatives(q))
      for (const other of questions) {
        const text = normalize(other.question);
        const leaked = alts.find((a) => a.length >= 12 && text.includes(a));
        if (leaked) evidenceInQuestionText.push(issue("evidence-in-question", `evidence of ${q.id} ("${leaked}") appears in the text of ${other.id}`));
      }

  const normDocs = documents.map((d) => ({ d, text: normalize(d.content) }));
  const distractorLeakage: IntegrityIssue[] = [];
  const missingEvidence: IntegrityIssue[] = [];
  for (const q of questions)
    alternatives(q).forEach((alts, i) => {
      const holders = normDocs.filter((x) => alts.some((a) => x.text.includes(a)));
      if (!holders.length) missingEvidence.push(issue("missing-evidence", `${q.id} evidence #${i + 1} ("${alts[0]}") is not in any document`));
      for (const h of holders.filter((x) => x.d.metadata.distractor))
        distractorLeakage.push(issue("distractor-leakage", `${q.id} evidence #${i + 1} appears in distractor ${h.d.id}`));
    });

  const duplicateDocuments: IntegrityIssue[] = [];
  const byChecksum = new Map<string, string>();
  for (const d of documents) {
    if (byChecksum.has(d.checksum)) duplicateDocuments.push(issue("duplicate-document", `${byChecksum.get(d.checksum)} and ${d.id} have identical content`));
    else byChecksum.set(d.checksum, d.id);
  }

  const duplicateSources: IntegrityIssue[] = [];
  const bySource = new Map<string, string>();
  for (const s of sources) {
    if (!s.connection.path) continue;
    const k = `${s.type}:${s.connection.path}`;
    if (bySource.has(k)) duplicateSources.push(issue("duplicate-source", `${bySource.get(k)} and ${s.id} point to the same location`));
    else bySource.set(k, s.id);
  }

  // Identifiers the questions depend on must not also appear in generated distractors.
  const identifierCollisions: IntegrityIssue[] = [];
  const distractors = documents.filter((d) => d.metadata.distractor);
  for (const q of questions) {
    const ids = new Set(
      [q.question, ...q.requiredEvidence.flatMap((e) => (Array.isArray(e) ? e : [e]))].flatMap(extractEntities).filter(isLinkingEntity),
    );
    for (const id of ids)
      for (const d of distractors)
        if (extractEntities(d.content).includes(id))
          identifierCollisions.push(issue("identifier-collision", `${q.id} identifier ${id} also appears in distractor ${d.id}`));
  }

  const unscorableQuestions = questions
    .filter((q) => !q.requiredEvidence.length)
    .map((q) => issue("unscorable", `${q.id} has no required evidence and is excluded from scoring`));

  const passed =
    !duplicateQuestions.length &&
    !evidenceInQuestionText.length &&
    !distractorLeakage.length &&
    !missingEvidence.length &&
    !duplicateDocuments.length &&
    !duplicateSources.length &&
    !identifierCollisions.length;

  return {
    optimizationQuestions: opt.length,
    validationQuestions: val.length,
    duplicateQuestions,
    nearDuplicatesAcrossSplits,
    templateRepeatsAcrossSplits,
    evidenceInQuestionText,
    distractorLeakage,
    missingEvidence,
    duplicateDocuments,
    duplicateSources,
    identifierCollisions,
    unscorableQuestions,
    passed,
  };
}
