$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$template = Join-Path $root '.env.example'
$target = Join-Path $root '.env'

if (-not (Test-Path $template)) {
    throw '.env.example was not found.'
}

$tokenBytes = New-Object byte[] 32
$rng = [Security.Cryptography.RandomNumberGenerator]::Create()
try {
    $rng.GetBytes($tokenBytes)
} finally {
    $rng.Dispose()
}
$token = ($tokenBytes | ForEach-Object { $_.ToString('x2') }) -join ''
$content = Get-Content -Raw $template
$content = $content.Replace(
    'LOCAL_AGENTS_ADMIN_TOKEN=replace-with-at-least-32-random-characters',
    "LOCAL_AGENTS_ADMIN_TOKEN=$token"
)
[IO.File]::WriteAllText($target, $content, [Text.UTF8Encoding]::new($false))
Write-Host 'Created .env with a fresh admin token.'
