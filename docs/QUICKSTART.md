# Quick start (about 10 minutes)

> Want a measured comparison first, without touching the workspace? Run the [5-minute example](../examples/quickstart/README.md): 10 fictional help-center articles, 20 questions, one command.

You need Node.js 20.9 or newer. No account or API key is required.

```bash
npm install
npm run radar -- doctor     # checks Node, the workspace directory, cached models
npm run dev                 # http://127.0.0.1:3000
```

The first start creates `./.radar/` with the bundled **synthetic** demo workspace: 58 documents (runbooks, incidents, deploy logs, Slack, Jira) and 48 questions with required evidence.

## 1. Optimize

**Overview → Run optimizer**, or headless:

```bash
npm run optimize -- balanced
```

RadarDB tries 480 retrieval configurations on the optimization questions, picks a plan per question class plus a fallback, and validates them on held-out questions it never used for selection. The first run downloads two local models (about 45 MB, once). After that, everything works offline.

## 2. Deploy and query

On **Context plans**, deploy the validated plan set. Then:

```bash
npm run radar -- context "Who approved deploy DEP-1187?"
curl -X POST http://127.0.0.1:3000/api/v1/context -H 'content-type: application/json' -d '{"query":"Who approved deploy DEP-1187?"}'
```

Each returned item tells you where it came from: document, chunk, method, scores and plan version.

## 3. Export what you found

```bash
npm run radar -- plan export --out my-plan.json
npm run radar -- plan validate my-plan.json
npm run radar -- manifest --out experiment.json
```

`my-plan.json` is a portable `radardb.plan-release` v1 document. You can also export from the Plans page with **Export JSON**.

## 4. Try your own documents

Put Markdown or text files under `sources/<folder>/`, add the folder on **Sources**, write questions with the exact evidence a correct answer needs on **Eval set**, and run the optimizer again. Or use the benchmark without touching the workspace: see [LOCAL_EVALUATION.md](LOCAL_EVALUATION.md).

Results on the demo are illustrative: the corpus is synthetic and small. Measure your own workload before drawing conclusions.
