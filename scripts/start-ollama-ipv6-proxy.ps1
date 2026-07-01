$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$python = Join-Path $root '.venv\Scripts\python.exe'
if (-not (Test-Path $python)) {
    $python = 'python.exe'
}

$env:LOCAL_AGENTS_OLLAMA_PROXY_LISTEN_HOST = '0.0.0.0'
$env:LOCAL_AGENTS_OLLAMA_PROXY_LISTEN_PORT = '11435'
$env:LOCAL_AGENTS_OLLAMA_PROXY_TARGET_HOST = '::1'
$env:LOCAL_AGENTS_OLLAMA_PROXY_TARGET_PORT = '11434'

$logDir = Join-Path $root '.runtime'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$out = Join-Path $logDir 'local-agents-ollama-proxy.out.log'
$err = Join-Path $logDir 'local-agents-ollama-proxy.err.log'

& $python (Join-Path $root 'scripts\ollama-ipv6-proxy.py') 1>> $out 2>> $err
