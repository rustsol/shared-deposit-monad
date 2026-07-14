# Starts the Shared Deposit development services, each in its own window.
# WAMP MySQL must already be running. Apache is not required.

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

Write-Host "Starting development services from $root"
Write-Host ""

# Optional local Hardhat node (uncomment when contract work needs it):
# Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\contracts'; npx hardhat node"

Write-Host "[1] FastAPI backend -> http://127.0.0.1:8000"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\backend'; .\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000"

# Chain event worker starts here once implemented (later phase):
# Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\backend'; .\.venv\Scripts\python.exe -m app.worker"

Write-Host "[2] Vite frontend -> http://localhost:5173"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\frontend'; npm run dev"

Write-Host ""
Write-Host "Windows launched. Close each window to stop its service."
