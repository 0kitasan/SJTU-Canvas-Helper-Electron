$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
Add-Type @'
using System;
using System.Runtime.InteropServices;
public class StartupWindowProbe {
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr handle);
}
'@
$helper = Start-Process -FilePath (Get-Process -Id $PID).Path -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$projectRoot\run.ps1`"", 'start') -WindowStyle Hidden -PassThru -RedirectStandardOutput "$projectRoot/logs/startup-test-stdout.txt" -RedirectStandardError "$projectRoot/logs/startup-test-stderr.txt"
$windowProcess = $null
try {
  $deadline = (Get-Date).AddSeconds(25)
  while ((Get-Date) -lt $deadline) {
    $windowProcess = Get-Process -Name electron -ErrorAction SilentlyContinue | Where-Object {
      $_.Path -eq "$projectRoot\node_modules\electron\dist\electron.exe" -and $_.MainWindowTitle -like '*Canvas Helper*' -and [StartupWindowProbe]::IsWindowVisible($_.MainWindowHandle)
    } | Select-Object -First 1
    if ($windowProcess) { break }
    Start-Sleep -Milliseconds 200
  }
  if (-not $windowProcess) { throw 'Normal startup did not produce a visible application window.' }
  if ($helper.HasExited) { throw 'Launcher exited before the application window closed.' }
  @{ passed=$true; timestamp=(Get-Date).ToString('o'); entry='run.ps1 start'; visible=$true; launcherWaiting=$true; title=$windowProcess.MainWindowTitle } | ConvertTo-Json | Set-Content "$projectRoot/logs/startup-result.json" -Encoding utf8
} finally {
  if ($windowProcess) { $null = $windowProcess.CloseMainWindow() }
  if (-not $helper.WaitForExit(10000)) { $helper.Kill() }
}
if ($helper.ExitCode -ne 0) { throw "Launcher exited with $($helper.ExitCode)" }
Write-Output 'Normal startup passed: visible window, launcher waits, graceful close.'
