# Runs every check for all workspaces and stops on the first failure.
# Reports real results only.

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Invoke-Step {
    param([string]$Name, [scriptblock]$Action)
    Write-Host ""
    Write-Host "=== $Name ==="
    & $Action
    if ($LASTEXITCODE -ne 0) {
        Write-Host "FAILED: $Name"
        exit 1
    }
}

Invoke-Step "contracts: lint"    { npm --prefix contracts run lint }
Invoke-Step "contracts: test"    { npm --prefix contracts run test }

Invoke-Step "backend: ruff"      { & backend\.venv\Scripts\python.exe -m ruff check backend }
Invoke-Step "backend: mypy"      { Push-Location backend; & .venv\Scripts\python.exe -m mypy; $code = $LASTEXITCODE; Pop-Location; $global:LASTEXITCODE = $code }
Invoke-Step "backend: pytest"    { Push-Location backend; & .venv\Scripts\python.exe -m pytest -q; $code = $LASTEXITCODE; Pop-Location; $global:LASTEXITCODE = $code }

Invoke-Step "frontend: lint"      { npm --prefix frontend run lint }
Invoke-Step "frontend: typecheck" { npm --prefix frontend run typecheck }
Invoke-Step "frontend: test"      { npm --prefix frontend run test }
Invoke-Step "frontend: build"     { npm --prefix frontend run build }

Write-Host ""
Write-Host "All checks passed."
