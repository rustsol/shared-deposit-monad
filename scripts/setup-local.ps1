# One-time local development setup for Shared Deposit on Windows with WAMP MySQL.
# Idempotent: safe to re-run. Never overwrites an existing .env. Never drops data.

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

Write-Host "=== 1/5 Environment examples ==="
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

Write-Host "=== 2/5 Python backend ==="
if (-not (Test-Path "backend\.venv")) {
    python -m venv backend\.venv
}
& backend\.venv\Scripts\python.exe -m pip install --upgrade pip --quiet
& backend\.venv\Scripts\python.exe -m pip install -e "backend[dev]" --quiet
if ($LASTEXITCODE -ne 0) { throw "Backend dependency installation failed." }
Write-Host "Backend virtual environment ready."

Write-Host "=== 3/5 WAMP MySQL database (Python-based, MySQL CLI not required) ==="
Push-Location backend
& .venv\Scripts\python.exe -m app.database.setup
$dbExit = $LASTEXITCODE
Pop-Location
if ($dbExit -ne 0) { throw "Database setup failed. Is WAMP MySQL running on 127.0.0.1:3306?" }

Write-Host "=== 4/5 Alembic migrations ==="
Push-Location backend
& .venv\Scripts\python.exe -m alembic upgrade head
$alembicExit = $LASTEXITCODE
if ($alembicExit -eq 0) {
    & .venv\Scripts\python.exe -m alembic current
}
Pop-Location
if ($alembicExit -ne 0) { throw "Alembic migration failed." }

Write-Host "=== 5/5 Node workspaces ==="
npm --prefix contracts install
if ($LASTEXITCODE -ne 0) { throw "contracts npm install failed." }
npm --prefix frontend install
if ($LASTEXITCODE -ne 0) { throw "frontend npm install failed." }

Write-Host ""
Write-Host "Setup complete. Start development with scripts\run-dev.ps1."
