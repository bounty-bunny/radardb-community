# Pilot guide: evaluating RadarDB on your own workload

The minimum workflow to answer one question with existing functionality: **does an automatically selected retrieval plan beat what you use today, on your documents and your questions?** Everything runs on your machine, and nothing needs to be deployed into production.

## 1. What you need

| Input | Minimum | Format today |
|---|---|---|
| Documents | a representative export, ideally 200+ documents (benchmark mode allows up to 2,000) | Markdown or text files in a folder |
| Historical questions | 50+ real user questions; 200+ for useful confidence intervals | JSON (see below) |
| Ground truth | for each question, the exact phrase(s) a correct answer must contain | `requiredEvidence` in the questions file |
| Your current retrieval (optional) | what your system returns for the same questions | compared by hand today (see step 6) |

Questions file:

```json
[
  { "question": "How do I rotate an API token?", "requiredEvidence": ["Settings → Tokens", ["revoke the old token", "old token is revoked"]] }
]
```

A list inside `requiredEvidence` means "any of these phrasings". JSON/JSONL/CSV importers for documents, gold document ids and your baseline's outputs are planned.

## 2. Validate the inputs

```bash
npm run radar -- doctor
npm run benchmark -- <folder-under-sources> questions.json "pilot dry run"
```

Read the report's **Evaluation integrity** section. Near-duplicate questions across splits, or evidence that never appears in the documents, mean the inputs need fixing before results mean anything.

## 3. Optimize (selection on optimization questions only)

For the full workflow, connect the folder on **Sources**, add the questions on **Eval set** (the split is assigned and persisted automatically), then:

```bash
npm run optimize -- balanced            # or quality / cost / latency
```

Held-out numbers are the result. Optimization-set numbers are what the search was tuned on.

## 4. Deploy and query

```bash
npm run optimize -- balanced --deploy   # or deploy the validated release on the Context plans page
npm run radar -- context "a real question from your users"
```

Or call `POST /api/v1/context` from a test harness (see API_REFERENCE.md).

## 5. Export and validate the plan

```bash
npm run radar -- plan export --out pilot-plan.json
npm run radar -- plan validate pilot-plan.json
npm run radar -- manifest --out pilot-manifest.json
```

`pilot-plan.json` records exactly what was selected, with its optimization and held-out metrics. `pilot-manifest.json` records what it ran on (dataset version, question-set hash, search-space hash). Keep both with the report.

## 6. Compare with your current system

For the held-out questions, check whether your system's top passages contain the required evidence, using the same rule the report uses. Compare at a similar context size: the report shows RadarDB's context tokens per query.

## 7. Decide

| Question | Where to look |
|---|---|
| Does RadarDB find the evidence more often than your system on held-out questions? | report → held-out table; your comparison (step 6) |
| Is it cheaper? | context tokens, estimated cost per query |
| Is it fast enough? | measured latency p50/p95 (cross-encoder plans are slower) |
| Was anything tuned by hand? | keep a log: any manual config choice, threshold change or corpus-specific code means the result is not automatic |

Small held-out sets give wide intervals; the report prints them. A plan that only ties your system but uses fewer tokens can still be worth deploying.
