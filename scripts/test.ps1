$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$python = Join-Path $root '.venv\Scripts\python.exe'

if (-not (Test-Path $python)) {
    throw 'Run scripts\dev-server.ps1 once to create the virtual environment.'
}

Push-Location (Join-Path $root 'server')
try {
    & $python -m ruff check .
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

    $baseTemp = $env:LOCAL_AGENTS_PYTEST_BASETEMP
    if (-not $baseTemp) {
        $baseTemp = 'C:\tmp\local-agents-pytest'
    }
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $baseTemp) | Out-Null

    & $python -m pytest --basetemp $baseTemp -p no:cacheprovider
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} finally {
    Pop-Location
}
