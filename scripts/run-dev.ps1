# Opens the Shared Deposit development services in TWO independent, persistent
# PowerShell windows. Each window keeps running after this launcher exits,
# because Start-Process spawns a genuinely separate process - this script does
# not falsely keep servers alive inside its own lifetime.
#
# WAMP MySQL must already be running (it runs as a Windows service). Apache is
# not required.

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

$backend = "cd '$root\backend'; .\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000"
$frontend = "cd '$root\frontend'; npm run dev"

Write-Host "Launching backend and frontend in separate persistent windows..."
Write-Host ""
Write-Host "If a window does not open, run these two commands yourself in two terminals:"
Write-Host ""
Write-Host "  Backend:"
Write-Host "    cd $root\backend"
Write-Host "    .\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000"
Write-Host ""
Write-Host "  Frontend:"
Write-Host "    cd $root\frontend"
Write-Host "    npm run dev"
Write-Host ""

Start-Process powershell -ArgumentList "-NoExit", "-Command", $backend | Out-Null
Start-Process powershell -ArgumentList "-NoExit", "-Command", $frontend | Out-Null

Write-Host "Backend  -> http://127.0.0.1:8000  (docs at /docs)"
Write-Host "Frontend -> http://localhost:5173"
Write-Host ""
Write-Host "These windows run independently. Close each window to stop that service."
Write-Host "This launcher can now exit safely; the servers keep running."
