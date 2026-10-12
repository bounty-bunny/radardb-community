# EnterpriseRAG 10K resource-only feasibility of the candidate FusionContextPlan (optimization questions only).
$ErrorActionPreference = "Continue"
Set-Location (Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)))
$env:NODE_OPTIONS = "--max-old-space-size=8192"
node node_modules/tsx/dist/cli.mjs --tsconfig research/v1.1/tsconfig.json research/v1.1/v11b/erb10k-feasibility.ts > research\v1.1\v11b\work\erb10k.log 2> research\v1.1\v11b\work\erb10k.err
"DONE" | Out-File -FilePath research\v1.1\v11b\work\erb10k.done -Encoding utf8
