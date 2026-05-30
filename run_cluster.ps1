Write-Host "Starting Gok Boru Distributed Local AI Cluster Simulation..." -ForegroundColor Cyan

# Quick check if WSL works
try {
    $null = wsl pwd
} catch {
    Write-Error "WSL is not running or not configured properly. Please ensure WSL is installed and set up."
    exit 1
}

Write-Host "Starting Master Node Backend on http://localhost:7878..." -ForegroundColor Green
Start-Process wsl -ArgumentList "-d", "Ubuntu", "--cd", "/mnt/c/Users/salih/Gök_Börü/local-ai-dashboard/backend", ".venv/bin/uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "7878" -WindowStyle Minimized

Write-Host "Starting Local Worker n1 (workstation) on port 7879..." -ForegroundColor Green
Start-Process wsl -ArgumentList "-d", "Ubuntu", "--cd", "/mnt/c/Users/salih/Gök_Börü/local-ai-dashboard/backend", ".venv/bin/python", "-m", "app.worker.agent", "--host", "0.0.0.0", "--port", "7879" -WindowStyle Minimized

Write-Host "Starting Simulated Worker n2 (wsl.local) on port 7880..." -ForegroundColor Green
Start-Process wsl -ArgumentList "-d", "Ubuntu", "--cd", "/mnt/c/Users/salih/Gök_Börü/local-ai-dashboard/backend", ".venv/bin/python", "-m", "app.worker.agent", "--host", "0.0.0.0", "--port", "7880" -WindowStyle Minimized

Write-Host "Starting Simulated Worker n3 (studio.local) on port 7881..." -ForegroundColor Green
Start-Process wsl -ArgumentList "-d", "Ubuntu", "--cd", "/mnt/c/Users/salih/Gök_Börü/local-ai-dashboard/backend", ".venv/bin/python", "-m", "app.worker.agent", "--host", "0.0.0.0", "--port", "7881" -WindowStyle Minimized

Write-Host "All cluster services launched in background WSL windows!" -ForegroundColor Cyan
Write-Host "Open your browser at http://localhost:7878 to view the dashboard." -ForegroundColor Yellow
