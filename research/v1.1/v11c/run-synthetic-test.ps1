# WixQA Synthetic locked test (lock a67c294), run exactly once. Keeps the system awake only while running.
$ErrorActionPreference = "Continue"
Set-Location (Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)))
Add-Type -Namespace Win32 -Name Power -MemberDefinition '[DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint esFlags);'
[Win32.Power]::SetThreadExecutionState([uint32]"0x80000001") | Out-Null   # ES_CONTINUOUS | ES_SYSTEM_REQUIRED
$env:NODE_OPTIONS = "--max-old-space-size=8192"
node node_modules/tsx/dist/cli.mjs --tsconfig research/v1.1/tsconfig.json research/v1.1/v11c/synthetic-eval.ts test > research\v1.1\v11c\results\synthetic-test.log 2> research\v1.1\v11c\results\synthetic-test.err
"exit $LASTEXITCODE" | Out-File -FilePath research\v1.1\v11c\results\synthetic-test.done -Encoding utf8
[Win32.Power]::SetThreadExecutionState([uint32]"0x80000000") | Out-Null   # release
