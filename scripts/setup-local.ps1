# One-time local development setup for Shared Deposit on Windows with WAMP MySQL.
# Idempotent: safe to re-run. Never overwrites an existing .env file.

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

Write-Host "=== 1/5 WAMP MySQL ==="
$mysqlClient = Get-ChildItem "E:\wamp64\bin\mysql\*\bin\mysql.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $mysqlClient) {
    throw "No mysql.exe found under E:\wamp64\bin\mysql. Is WAMP installed?"
}
& $mysqlClient.FullName -h 127.0.0.1 -P 3306 -u root -e "CREATE DATABASE IF NOT EXISTS shared_deposit CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
if ($LASTEXITCODE -ne 0) { throw "MySQL connection or database creation failed." }
Write-Host "Database shared_deposit is present."

Write-Host "=== 2/5 Environment examples ==="
$envPairs = @(
    @{ Src = ".env.example";            Dst = ".env" },
    @{ Src = "backend\.env.example";    Dst = "backend\.env" },
    @{ Src = "frontend\.env.example";   Dst = "frontend\.env" },
    @{ Src = "contracts\.env.example";  Dst = "contracts\.env" }
)
foreach ($pair in $envPairs) {
    if (Test-Path $pair.Dst) {
        Write-Host "Kept existing $($pair.Dst) (never overwritten)"
    } else {
        Copy-Item $pair.Src $pair.Dst
        Write-Host "Created $($pair.Dst) from example"
    }
}

Write-Host "=== 3/5 Python backend ==="
if (-not (Test-Path "backend\.venv")) {
    python -m venv backend\.venv
}
& backend\.venv\Scripts\python.exe -m pip install --upgrade pip --quiet
& backend\.venv\Scripts\python.exe -m pip install -e "backend[dev]" --quiet
if ($LASTEXITCODE -ne 0) { throw "Backend dependency installation failed." }
Write-Host "Backend virtual environment ready."

if (Test-Path "backend\alembic.ini") {
    Write-Host "Running Alembic migrations..."
    Push-Location backend
    & .venv\Scripts\python.exe -m alembic upgrade head
    $alembicExit = $LASTEXITCODE
    Pop-Location
    if ($alembicExit -ne 0) { throw "Alembic migration failed." }
} else {
    Write-Host "No alembic.ini yet (migrations arrive in a later phase); skipping."
}

Write-Host "=== 4/5 Contracts workspace ==="
npm --prefix contracts install
if ($LASTEXITCODE -ne 0) { throw "contracts npm install failed." }

Write-Host "=== 5/5 Frontend workspace ==="
npm --prefix frontend install
if ($LASTEXITCODE -ne 0) { throw "frontend npm install failed." }

Write-Host ""
Write-Host "Setup complete. Start development with scripts\run-dev.ps1."
