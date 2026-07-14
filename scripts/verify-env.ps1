# Verifies the local development environment for Shared Deposit.
# Read-only: makes no changes to the machine, database, or repository.

$ErrorActionPreference = "Continue"
$failures = 0

function Test-Tool {
    param([string]$Name, [string]$Command)
    try {
        $output = Invoke-Expression $Command 2>&1 | Select-Object -First 1
        Write-Host "[OK]   $Name -> $output"
    } catch {
        Write-Host "[MISS] $Name -> not found ($Command)"
        $script:failures++
    }
}

Write-Host "=== Tooling ==="
Test-Tool "git" "git --version"
Test-Tool "gh" "gh --version"
Test-Tool "node" "node --version"
Test-Tool "npm" "npm --version"
Test-Tool "python" "python --version"

Write-Host ""
Write-Host "=== WAMP MySQL (127.0.0.1:3306, Python-based check) ==="
$backendPython = Join-Path (Split-Path -Parent $PSScriptRoot) "backend\.venv\Scripts\python.exe"
if (Test-Path $backendPython) {
    Push-Location (Join-Path (Split-Path -Parent $PSScriptRoot) "backend")
    & $backendPython -m app.database.setup --check
    $dbExit = $LASTEXITCODE
    Pop-Location
    if ($dbExit -eq 0) {
        Write-Host "[OK]   MySQL reachable and database present"
    } else {
        Write-Host "[INFO] MySQL unreachable or database missing (run setup-local.ps1)"
        $failures++
    }
} else {
    Write-Host "[INFO] backend\.venv not created yet (run setup-local.ps1 first); skipping DB check"
}

Write-Host ""
Write-Host "=== Ports ==="
foreach ($port in 5173, 8000, 8545, 3306) {
    $inUse = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    if ($inUse) {
        Write-Host "[INFO] Port $port is in use"
    } else {
        Write-Host "[OK]   Port $port is available"
    }
}

Write-Host ""
if ($failures -gt 0) {
    Write-Host "verify-env: $failures problem(s) found."
    exit 1
}
Write-Host "verify-env: environment looks usable."
