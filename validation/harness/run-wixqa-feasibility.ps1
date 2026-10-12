# WixQA feasibility (optimization questions only; no held-out labels). Sequential, one process at a time.
# Order: V1 full -> F bge-base full -> [F bge-small full iff bge-base exceeded a budget: preregistered fallback] -> V1 2000 -> F bge-base 2000.
$ErrorActionPreference = "Continue"
Set-Location (Split-Path -Parent (Split-Path -Parent $PSScriptRoot))
$env:NODE_OPTIONS = "--max-old-space-size=8192"
$logDir = "validation\work\wixqa"
$runLog = "$logDir\runner-feasibility.log"
function Log($m) { Add-Content -Path $runLog -Value "$(Get-Date -Format o) $m" -Encoding utf8 }
function Run($name, $res, $script, $argsList) {
  for ($attempt = 1; $attempt -le 2; $attempt++) {
    if (Test-Path $res) { Remove-Item $res }
    Log "START $name attempt $attempt"
    node node_modules/tsx/dist/cli.mjs --tsconfig validation/tsconfig.json $script @argsList > "$logDir\$name.log" 2> "$logDir\$name.err"
    if (Test-Path $res) { $r = Get-Content $res -Raw | ConvertFrom-Json; Log "END $name outcome=$($r.outcome) class=$($r.classification)"; return $r }
    Log "CRASH $name attempt $attempt (no result file, exit=$LASTEXITCODE)"
  }
  return $null
}
Run "v1-full" "validation\results\wixqa-feasibility-full.json" "validation/harness/wixqa-feasibility.ts" @("full") | Out-Null
$fb = Run "F-bge-base-full" "validation\results\wixqa-baselineF-feasibility-bge-base-full.json" "validation/harness/wixqa-f-feasibility.ts" @("full", "bge-base")
if ($fb -eq $null -or $fb.outcome -ne "PASS") {
  Log "FALLBACK bge-small full (bge-base full outcome=$($fb.outcome) class=$($fb.classification))"
  Run "F-bge-small-full" "validation\results\wixqa-baselineF-feasibility-bge-small-full.json" "validation/harness/wixqa-f-feasibility.ts" @("full", "bge-small") | Out-Null
}
Run "v1-2000" "validation\results\wixqa-feasibility-2000.json" "validation/harness/wixqa-feasibility.ts" @("2000") | Out-Null
Run "F-bge-base-2000" "validation\results\wixqa-baselineF-feasibility-bge-base-2000.json" "validation/harness/wixqa-f-feasibility.ts" @("2000", "bge-base") | Out-Null
Log "WIXQA FEASIBILITY RUNNER DONE"
