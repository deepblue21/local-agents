[CmdletBinding()]
param(
    [string]$NovaRoot = 'C:\Users\salih\Nova_Agent_AI',
    [ValidateSet('Docker', 'Host')]
    [string]$CompanionMode = 'Docker',
    [string]$WslDistro = 'Ubuntu',
    [switch]$StartGateway
)

$ErrorActionPreference = 'Stop'
$localRoot = Split-Path -Parent $PSScriptRoot
$localEnv = Join-Path $localRoot '.env'
$novaEnv = Join-Path $NovaRoot 'gateway\.env'

function Get-DotEnvValue([string]$Path, [string]$Name) {
    $line = Get-Content $Path | Where-Object { $_ -match "^$([regex]::Escape($Name))=" } | Select-Object -First 1
    if (-not $line) { return '' }
    return ($line -split '=', 2)[1]
}

function Set-DotEnvValue([string]$Path, [string]$Name, [string]$Value) {
    $content = [IO.File]::ReadAllText($Path)
    $pattern = "(?m)^$([regex]::Escape($Name))=.*$"
    $replacement = "$Name=$Value"
    if ([regex]::IsMatch($content, $pattern)) {
        $content = [regex]::Replace($content, $pattern, $replacement)
    } else {
        $content = $content.TrimEnd() + [Environment]::NewLine + $replacement + [Environment]::NewLine
    }
    [IO.File]::WriteAllText($Path, $content, [Text.UTF8Encoding]::new($false))
}

if (-not (Test-Path $localEnv)) { throw "Local_Agents .env bulunamadı: $localEnv" }
if (-not (Test-Path $novaEnv)) { throw "Nova gateway .env bulunamadı: $novaEnv" }

$gatewayToken = Get-DotEnvValue $novaEnv 'GATEWAY_TOKEN'
if ([string]::IsNullOrWhiteSpace($gatewayToken)) {
    throw 'Nova GATEWAY_TOKEN boş. Önce Nova gateway/.env içinde güçlü bir token ayarlayın.'
}

$novaUrl = if ($CompanionMode -eq 'Host') {
    'http://127.0.0.1:8088/v1'
} else {
    'http://host.docker.internal:8088/v1'
}

Set-DotEnvValue $localEnv 'LOCAL_AGENTS_NOVA_URL' $novaUrl
Set-DotEnvValue $localEnv 'LOCAL_AGENTS_NOVA_TOKEN' $gatewayToken
Write-Host "Local_Agents Nova bağlantısı yapılandırıldı ($CompanionMode). Token ekrana yazdırılmadı."

if (-not $StartGateway) { return }

$headers = @{ Authorization = "Bearer $gatewayToken" }
$alreadyRunning = $false
try {
    $null = Invoke-RestMethod -Uri 'http://127.0.0.1:8088/v1/models' -Headers $headers -TimeoutSec 3
    $alreadyRunning = $true
} catch {
    $alreadyRunning = $false
}

if ($alreadyRunning) {
    Write-Host 'Nova gateway zaten çalışıyor ve token doğrulandı.'
    return
}

$keepAlive = Start-Process -FilePath 'wsl.exe' -ArgumentList @('-d', $WslDistro, '--', 'sleep', 'infinity') -WindowStyle Hidden -PassThru
Start-Sleep -Seconds 2

$addresses = (& wsl.exe -d $WslDistro -- hostname -I) -split '\s+'
$wslIp = $addresses | Where-Object { $_ -match '^\d+\.\d+\.\d+\.\d+$' } | Select-Object -First 1
if (-not $wslIp) { throw "$WslDistro için WSL IPv4 adresi bulunamadı." }

$ollamaUrl = "http://${wslIp}:11434"
$ollamaReady = $false
for ($attempt = 0; $attempt -lt 15; $attempt++) {
    try {
        $null = Invoke-RestMethod -Uri "$ollamaUrl/api/tags" -TimeoutSec 3
        $ollamaReady = $true
        break
    } catch {
        Start-Sleep -Seconds 1
    }
}
if (-not $ollamaReady) { throw "Ollama $WslDistro içinde erişilebilir değil: $ollamaUrl" }

$previousOllamaUrl = $env:OLLAMA_URL
try {
    $env:OLLAMA_URL = $ollamaUrl
    $gateway = Start-Process -FilePath 'npm.cmd' -ArgumentList @('run', 'gateway') -WorkingDirectory $NovaRoot -WindowStyle Hidden -PassThru
} finally {
    $env:OLLAMA_URL = $previousOllamaUrl
}

$gatewayReady = $false
for ($attempt = 0; $attempt -lt 30; $attempt++) {
    try {
        $models = Invoke-RestMethod -Uri 'http://127.0.0.1:8088/v1/models' -Headers $headers -TimeoutSec 3
        $gatewayReady = $true
        break
    } catch {
        Start-Sleep -Seconds 1
    }
}
if (-not $gatewayReady) { throw 'Nova gateway 30 saniye içinde hazır olmadı.' }

Write-Host "Nova gateway hazır: $($models.data.Count) model ilan edildi."
Write-Host "Gateway PID: $($gateway.Id) | WSL keepalive PID: $($keepAlive.Id)"
