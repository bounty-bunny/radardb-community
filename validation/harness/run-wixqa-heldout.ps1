# WixQA held-out evaluation of the LOCKED systems. One attempt. No rerun after held-out exposure: on failure, record and STOP.
$ErrorActionPreference = "Continue"
Set-Location (Split-Path -Parent (Split-Path -Parent $PSScriptRoot))
$env:NODE_OPTIONS = "--max-old-space-size=8192"
$logDir = "validation\work\wixqa"
$runLog = "$logDir\runner-heldout.log"
function Log($m) { Add-Content -Path $runLog -Value "$(Get-Date -Format o) $m" -Encoding utf8 }
Log "START heldout"
node node_modules/tsx/dist/cli.mjs --tsconfig validation/tsconfig.json validation/harness/wixqa-heldout.ts > "$logDir\heldout.log" 2> "$logDir\heldout.err"
$code = $LASTEXITCODE
if (Test-Path "validation\results\wixqa-heldout.json") { Log "END heldout exit=$code" } else { Log "FAILURE heldout (no result file, exit=$code) - STOP, no rerun" }
