<#
.SYNOPSIS
    Register the daily sweep with the Windows Task Scheduler.

.DESCRIPTION
    Creates a scheduled task that runs `scripts\watch.ps1` once a day. The task runs only while the
    current user is logged on, because the notification needs a desktop to appear on, and it is
    allowed to start late if the machine was asleep at the scheduled time.

    Run this yourself when you want the monitor to start; nothing registers it for you. Re-running
    it replaces the existing task rather than adding a second one.

.PARAMETER Time
    When to sweep, as HH:mm. Defaults to 08:00.

.PARAMETER TaskName
    The name the task appears under in Task Scheduler. Defaults to 'crawlee-lab watch'.

.PARAMETER Profiles
    Profiles to sweep. Defaults to every profile that asks for snapshots.

.PARAMETER Unregister
    Remove the task instead of creating it.

.EXAMPLE
    .\scripts\register-watch-task.ps1
    .\scripts\register-watch-task.ps1 -Time 07:30 -Profiles claude-docs
    .\scripts\register-watch-task.ps1 -Unregister
#>
[CmdletBinding()]
param(
    [string]$Time = '08:00',
    [string]$TaskName = 'crawlee-lab watch',
    [string[]]$Profiles = @(),
    [switch]$Unregister
)

$ErrorActionPreference = 'Stop'

if ($Unregister) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Output "removed the scheduled task '$TaskName'"
    return
}

$projectRoot = Split-Path -Parent $PSScriptRoot
$wrapper = Join-Path $PSScriptRoot 'watch.ps1'

if (-not (Test-Path $wrapper)) {
    throw "cannot find $wrapper"
}

$arguments = @(
    '-NoProfile'
    '-NonInteractive'
    '-ExecutionPolicy', 'Bypass'
    '-File', "`"$wrapper`""
)
if ($Profiles.Count -gt 0) {
    $arguments += '-Profiles'
    $arguments += ($Profiles -join ',')
}

$action = New-ScheduledTaskAction -Execute 'pwsh.exe' -Argument ($arguments -join ' ') -WorkingDirectory $projectRoot
$trigger = New-ScheduledTaskTrigger -Daily -At $Time
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Hours 1)

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null

Write-Output "registered '$TaskName', daily at $Time"
Write-Output "run it now with: Start-ScheduledTask -TaskName '$TaskName'"
Write-Output "remove it with:  .\scripts\register-watch-task.ps1 -Unregister"
