param([Parameter(Mandatory=$true)][string]$Executable)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
Add-Type @'
using System;
using System.Runtime.InteropServices;
public class DistributionWindowProbe {
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr handle);
}
'@
$exe = (Resolve-Path -LiteralPath $Executable).Path
$previousProfile = $env:CANVAS_HELPER_SMOKE_PROFILE
$before = @(Get-Process | Select-Object -ExpandProperty Id)
$env:CANVAS_HELPER_SMOKE_PROFILE = Join-Path $root '.test-profiles\distribution'
$window = $null
$process = $null
try {
  $process = Start-Process -FilePath $exe -WorkingDirectory (Split-Path $exe -Parent) -WindowStyle Normal -PassThru
  $deadline = (Get-Date).AddSeconds(60)
  while ((Get-Date) -lt $deadline) {
    $window = Get-Process | Where-Object { $_.Id -notin $before -and $_.MainWindowTitle -like '*Canvas Helper*' -and [DistributionWindowProbe]::IsWindowVisible($_.MainWindowHandle) } | Select-Object -First 1
    if ($window) { break }
    Start-Sleep -Milliseconds 250
  }
  if (-not $window) { throw 'Packaged application did not show a visible window.' }
  Start-Sleep -Milliseconds 800
  $null = $window.CloseMainWindow()
  if (-not $process.WaitForExit(20000)) { throw 'Packaged launcher did not exit after window close.' }
  if ($process.ExitCode -ne 0) { throw "Packaged application exited with $($process.ExitCode)" }
  $result = @{passed=$true;timestamp=(Get-Date).ToString('o');executable=(Split-Path $exe -Leaf);visible=$true;exitCode=$process.ExitCode;cleanTestProfile=$true;otherMachineTested=$false}
  $result | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $root 'logs\distribution-result.json') -Encoding utf8
  $result | ConvertTo-Json
} finally {
  if ($window -and -not $window.HasExited) { $null = $window.CloseMainWindow() }
  $env:CANVAS_HELPER_SMOKE_PROFILE = $previousProfile
}
