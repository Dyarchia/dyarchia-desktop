<#
.SYNOPSIS
    Sweep every tracked target once and notify only when something needs a human.

.DESCRIPTION
    The wrapper a scheduled task calls. It runs `crawlee-lab watch`, appends the run to a log, and
    raises a desktop notification only when the sweep found a change or could not vouch for itself.
    A quiet sweep stays quiet: a monitor that speaks every day stops being read.

    Exit codes are passed through unchanged, so the Task Scheduler history shows the same verdict:
    0 nothing changed, 10 something did, 1 a target failed.

.PARAMETER Profiles
    Profiles to sweep. Defaults to every profile that asks for snapshots.

.PARAMETER Commit
    Commit each snapshot that moved, when the data directory is inside a git repository.

.EXAMPLE
    .\scripts\watch.ps1
    .\scripts\watch.ps1 -Profiles claude-docs, claude-code-docs
#>
[CmdletBinding()]
param(
    [string[]]$Profiles = @(),
    [switch]$Commit
)

$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot

# The log belongs wherever the run's other output goes, which the environment may have moved.
$configuredOutput = $env:CRAWLEE_LAB_OUTPUT_DIR
if ([string]::IsNullOrWhiteSpace($configuredOutput)) {
    $logDirectory = Join-Path $projectRoot 'output'
}
elseif ([System.IO.Path]::IsPathRooted($configuredOutput)) {
    $logDirectory = $configuredOutput
}
else {
    $logDirectory = Join-Path $projectRoot $configuredOutput
}
$logFile = Join-Path $logDirectory 'watch.log'

function Write-Log {
    param([string]$Message)

    if (-not (Test-Path $logDirectory)) {
        New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
    }
    $stamp = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
    Add-Content -Path $logFile -Value "$stamp  $Message" -Encoding utf8
}

function Show-Notification {
    param(
        [string]$Title,
        [string]$Message
    )

    try {
        Add-Type -AssemblyName System.Windows.Forms -ErrorAction Stop
        Add-Type -AssemblyName System.Drawing -ErrorAction Stop

        $icon = New-Object System.Windows.Forms.NotifyIcon
        $icon.Icon = [System.Drawing.SystemIcons]::Information
        $icon.BalloonTipTitle = $Title
        $icon.BalloonTipText = $Message
        $icon.Visible = $true
        $icon.ShowBalloonTip(20000)
        Start-Sleep -Seconds 12
        $icon.Dispose()
    }
    catch {
        # A headless session has no desktop to notify. The log and the exit code still carry it.
        Write-Log "notification unavailable: $($_.Exception.Message)"
    }
}

Set-Location $projectRoot

$arguments = @('run', 'crawlee-lab', 'watch')
if ($Profiles.Count -gt 0) { $arguments += $Profiles }
if ($Commit) { $arguments += '--commit' }

Write-Log "sweep started: uv $($arguments -join ' ')"

$transcript = & uv @arguments 2>&1 | Out-String
$code = $LASTEXITCODE

$headline = ($transcript -split "`n" | Where-Object { $_ -match 'targets (changed|failed)|no change across' } | Select-Object -Last 1).Trim()
if (-not $headline) { $headline = "watch exited with $code" }

Write-Log "sweep finished ($code): $headline"

switch ($code) {
    10 { Show-Notification -Title 'crawlee-lab: a tracked site changed' -Message $headline }
    0 { }
    default { Show-Notification -Title 'crawlee-lab: the sweep failed' -Message $headline }
}

Write-Output $transcript
exit $code
