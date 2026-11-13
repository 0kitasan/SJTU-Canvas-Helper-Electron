param(
    [ValidateSet('start', 'build', 'check', 'smoke', 'sessions', 'stability')]
    [string]$Action = 'start'
)

$ErrorActionPreference = 'Stop'
$projectRoot = $PSScriptRoot

function Find-NodeRuntime {
    $candidates = @()
    $command = Get-Command node.exe -ErrorAction SilentlyContinue
    if ($command) { $candidates += $command.Source }
    $candidates += Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
    foreach ($candidate in $candidates) {
        if (Test-Path -LiteralPath $candidate) {
            $versionText = & $candidate --version
            if ($LASTEXITCODE -eq 0 -and [version]($versionText.TrimStart('v')) -ge [version]'22.12.0') {
                return $candidate
            }
        }
    }
    throw 'Node.js 22.12+ was not found. Install Node.js or restore the Codex bundled runtime, then retry. No global pnpm is required.'
}

function Require-File([string]$RelativePath) {
    $resolved = Join-Path $projectRoot $RelativePath
    if (-not (Test-Path -LiteralPath $resolved -PathType Leaf)) {
        throw "Missing project dependency: $RelativePath. Restore/install project dependencies using the existing pnpm lockfile. This script does not install packages automatically."
    }
    return $resolved
}

function Invoke-Node([string[]]$Arguments) {
    & $script:nodeRuntime @Arguments
    if ($LASTEXITCODE -ne 0) { throw "Command failed with exit code $LASTEXITCODE." }
}

function Build-App {
    Invoke-Node @((Require-File 'node_modules\typescript\bin\tsc'), '-p', 'tsconfig.electron.json')
    Invoke-Node @((Require-File 'node_modules\vite\bin\vite.js'), 'build')
}

Push-Location $projectRoot
try {
    $script:nodeRuntime = Find-NodeRuntime
    Write-Host "Node: $script:nodeRuntime"
    switch ($Action) {
        'build' { Build-App }
        'check' {
            $compiler = Require-File 'node_modules\typescript\bin\tsc'
            Invoke-Node @($compiler, '--noEmit')
            Invoke-Node @($compiler, '-p', 'tsconfig.electron.json', '--noEmit')
            $null = Require-File 'node_modules\tsx\dist\loader.mjs'
            $testFiles = @(Get-ChildItem -LiteralPath (Join-Path $projectRoot 'tests') -Filter '*.test.ts' | ForEach-Object { $_.FullName })
            Invoke-Node (@('--import', 'tsx', '--test') + $testFiles)
        }
        'smoke' {
            Build-App
            $null = Require-File 'node_modules\electron\dist\electron.exe'
            Invoke-Node @('tests/run-electron-smoke.cjs')
        }
        'stability' {
            Build-App
            $null = Require-File 'node_modules\electron\dist\electron.exe'
            Invoke-Node @('tests/run-download-stability.cjs')
        }
        'sessions' {
            Build-App
            $null = Require-File 'node_modules\electron\dist\electron.exe'
            Invoke-Node @('tests/run-session-restart.cjs')
        }
        'start' {
            Build-App
            $electronRuntime = Require-File 'node_modules\electron\dist\electron.exe'
            $logDirectory = Join-Path $projectRoot 'logs'
            $null = New-Item -ItemType Directory -Path $logDirectory -Force
            Write-Host "Application logs: $logDirectory"
            $launchId = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
            $applicationProcess = Start-Process -FilePath $electronRuntime -ArgumentList '.' -WorkingDirectory $projectRoot -WindowStyle Normal -Wait -PassThru -RedirectStandardOutput (Join-Path $logDirectory "app-$launchId-stdout.txt") -RedirectStandardError (Join-Path $logDirectory "app-$launchId-stderr.txt")
            if ($applicationProcess.ExitCode -ne 0) { throw "Application exited with code $($applicationProcess.ExitCode). See logs/app-stderr.txt." }
        }
    }
    exit 0
} catch {
    Write-Error $_ -ErrorAction Continue
    exit 1
} finally {
    Pop-Location
}
