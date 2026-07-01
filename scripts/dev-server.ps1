$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$venv = Join-Path $root '.venv'

if (-not (Test-Path $venv)) {
    python -m venv $venv
}

$python = Join-Path $venv 'Scripts\python.exe'
& $python -m pip install -r (Join-Path $root 'server\requirements-dev.txt')
Push-Location (Join-Path $root 'server')
try {
    & $python -m local_agents.main
} finally {
    Pop-Location
}
