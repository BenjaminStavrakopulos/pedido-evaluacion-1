param(
    [switch]$NoSmoke
)

$ErrorActionPreference = 'Stop'

Set-Location -Path $PSScriptRoot

$ports = @(3000, 3001, 5500)

Write-Output "[start-clean] Limpiando puertos: $($ports -join ', ')"

foreach ($port in $ports) {
    $listeners = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue
    if (-not $listeners) {
        Write-Output "[start-clean] Puerto $port libre"
        continue
    }

    $processIds = $listeners | Select-Object -ExpandProperty OwningProcess -Unique
    foreach ($processId in $processIds) {
        try {
            $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
            if ($process) {
                Stop-Process -Id $processId -Force -ErrorAction Stop
                Write-Output "[start-clean] Proceso detenido en puerto $port -> PID $processId ($($process.ProcessName))"
            }
        }
        catch {
            Write-Output "[start-clean] No se pudo detener PID $processId en puerto ${port}: $($_.Exception.Message)"
        }
    }
}

Write-Output "[start-clean] Iniciando backend en segundo plano..."
$backendProcess = Start-Process -FilePath "npm.cmd" -ArgumentList "--prefix", "backend", "start" -WorkingDirectory $PSScriptRoot -PassThru

Write-Output "[start-clean] Iniciando frontend en http://localhost:5500 ..."
$frontendProcess = Start-Process -FilePath "npx.cmd" -ArgumentList "--yes", "http-server", ".", "-p", "5500", "-c-1" -WorkingDirectory $PSScriptRoot -PassThru

Write-Output "[start-clean] PID backend: $($backendProcess.Id)"
Write-Output "[start-clean] Esperando health check en http://localhost:3000/health ..."

$maxAttempts = 40
$attempt = 0
$isHealthy = $false

while ($attempt -lt $maxAttempts -and -not $isHealthy) {
    $attempt += 1
    Start-Sleep -Milliseconds 500

    try {
        $response = Invoke-RestMethod -Uri "http://localhost:3000/health" -Method Get -TimeoutSec 2
        if ($response.status) {
            $isHealthy = $true
            break
        }
    }
    catch {
        # Reintentar hasta agotar intentos
    }
}

if (-not $isHealthy) {
    Write-Output "[start-clean] ❌ Backend no respondió health check a tiempo"
    try {
        Stop-Process -Id $backendProcess.Id -Force -ErrorAction SilentlyContinue
    }
    catch {}
    try {
        Stop-Process -Id $frontendProcess.Id -Force -ErrorAction SilentlyContinue
    }
    catch {}
    exit 1
}

Write-Output "[start-clean] ✅ Backend operativo"

Write-Output "[start-clean] Verificando frontend en http://localhost:5500/index.html ..."
Start-Sleep -Seconds 3

$frontendHealthy = $true
try {
    $frontendResponse = Invoke-WebRequest -Uri "http://localhost:5500/index.html" -UseBasicParsing -TimeoutSec 8
    if ($frontendResponse.StatusCode -eq 200) {
        $frontendHealthy = $true
    } else {
        $frontendHealthy = $false
    }
}
catch {
    $frontendHealthy = $false
}

if (-not $frontendHealthy) {
    Write-Output "[start-clean] ⚠️ Frontend no respondió en la verificación inicial, pero el proceso quedó iniciado."
    Write-Output "[start-clean]    Si no carga, prueba abrir manualmente: http://localhost:5500/index.html"
} else {
    Write-Output "[start-clean] ✅ Frontend operativo"
}

if (-not $NoSmoke) {
    Write-Output "[start-clean] Ejecutando smoke check..."
    npm --prefix backend run smoke
    if ($LASTEXITCODE -ne 0) {
        Write-Output "[start-clean] ❌ Smoke check falló"
        exit $LASTEXITCODE
    }
    Write-Output "[start-clean] ✅ Smoke check OK"
}

Write-Output "[start-clean] Listo para trabajar en frontend"
Write-Output "[start-clean] URLs:"
Write-Output "[start-clean] - Frontend: http://localhost:5500/index.html"
Write-Output "[start-clean] - Backend:  http://localhost:3000/health"
Write-Output "[start-clean] Para detener backend:  Stop-Process -Id $($backendProcess.Id) -Force"
Write-Output "[start-clean] Para detener frontend: Stop-Process -Id $($frontendProcess.Id) -Force"