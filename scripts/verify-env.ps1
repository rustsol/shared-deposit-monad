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
Write-Host "=== WAMP MySQL (127.0.0.1:3306, root, blank password) ==="
$mysqlClient = Get-ChildItem "E:\wamp64\bin\mysql\*\bin\mysql.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
if ($mysqlClient) {
    $version = & $mysqlClient.FullName -h 127.0.0.1 -P 3306 -u root -N -e "SELECT VERSION();" 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "[OK]   MySQL server reachable, version: $version"
        $db = & $mysqlClient.FullName -h 127.0.0.1 -P 3306 -u root -N -e "SHOW DATABASES LIKE 'shared_deposit';" 2>&1
        if ($db -match "shared_deposit") {
            Write-Host "[OK]   Database shared_deposit exists"
        } else {
            Write-Host "[INFO] Database shared_deposit does not exist yet (run setup-local.ps1)"
        }
    } else {
        Write-Host "[FAIL] MySQL connection failed: $version"
        $failures++
    }
} else {
    Write-Host "[MISS] No mysql.exe found under E:\wamp64\bin\mysql"
    $failures++
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
