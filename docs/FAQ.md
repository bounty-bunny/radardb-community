# FAQ

**Is RadarDB a database or a vector store?**
No. The name is historical. RadarDB decides *how* to retrieve context for an AI application and serves it. It builds in-memory indexes from your documents; it doesn't replace your storage.

**Does it generate answers?**
No. It returns context with provenance, and your application calls its own LLM.

**Does it need the internet or an account?**
Only `npm install` and a one-time model download (about 45 MB) need the network. There is no account, cloud service or telemetry.

**Will it improve my retrieval?**
Possibly, and it will tell you honestly either way. It picks the best of 480 configurations for *your* questions and checks the choice on held-out questions. On WixQA, its per-question-type plans did not beat the best single configuration. On EnterpriseRAG-Bench, an experimental fusion of two configurations improved Recall@5 from 82.3% to 87.7% (CI +2.3 to +9.1 points). Run the benchmark on your data.

**Is FusionContextPlan ready for production?**
It's experimental. It's in the engine API but not yet served by `/api/v1/context` (see LIMITATIONS.md).

**How big a corpus can it handle?**
Benchmark mode: 2,000 documents. The engine was measured at 10,000 documents with one embedding representation (about 5 GB peak). The JSON embedding cache tops out around 250,000 vectors.

**Can I reproduce your benchmark numbers?**
Yes, for EnterpriseRAG-Bench and WixQA. See BENCHMARK_REPRODUCIBILITY.md; datasets are downloaded from their sources. Results for one further benchmark are withheld pending redistribution terms.

**Is it safe to expose on a network?**
Not as is. It's a single-user local tool with no user authentication. See SECURITY.md.

**Can I use it commercially?**
Yes. RadarDB is licensed under Apache-2.0, which allows commercial use, modification and redistribution under its terms (keep the LICENSE and NOTICE files).

**What's the commercial plan?**
A managed cloud and an enterprise edition built on this same engine (COMMUNITY_VS_COMMERCIAL.md). Neither exists yet, and the community edition has no feature locks.
