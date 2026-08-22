<#
.SYNOPSIS
    Sweep every tracked target once and notify only when something needs a human.

.DESCRIPTION
    The wrapper a scheduled task calls. It runs `crawlee-lab watch`, appends the run to a log, and
    raises a desktop notification only when the sweep found a change or could not vouch for itself.
    A quiet sweep stays quiet: a monitor that speaks every day stops being read.

    Exit codes are passed through unchanged, so the Task Scheduler history shows the same verdict:
    0 nothing changed, 10 something did, 1 a target failed. The wrapper adds 20 for a run that
    decided the week was already swept and did nothing.

    With -OncePerWeek the wrapper keeps a record of the last ISO week it swept and refuses to sweep
    that week twice, which is what turns a trigger that fires on every logon into one sweep a week.
    The record is written only after a sweep that finished, so a week whose sweep failed is still
    owed one and the next logon takes it.

    The log and that record are named after -Name, so several scheduled sweeps can run side by side
    without overwriting each other's turn.

.PARAMETER Name
    Names this sweep's log and its record of the last week swept. Defaults to 'labs-docs'.

.PARAMETER Profiles
    Profiles to sweep. Defaults to every profile that asks for snapshots.

.PARAMETER Group
    Sweep only the profiles that belong to this group. Cannot be combined with -Profiles, which
    already names a set of targets.

.PARAMETER Commit
    Commit each snapshot that moved, when the data directory is inside a git repository.

.PARAMETER OncePerWeek
    Do nothing if this name has already swept the current ISO week.

.EXAMPLE
    .\scripts\watch.ps1
    .\scripts\watch.ps1 -Profiles claude-docs, claude-code-docs
    .\scripts\watch.ps1 -Name labs-docs -Group docs-labs -OncePerWeek
#>
[CmdletBinding()]
param(
    [ValidatePattern('^[A-Za-z0-9][A-Za-z0-9._-]*$')]
    [string]$Name = 'labs-docs',
    [string[]]$Profiles = @(),
    [ValidatePattern('^$|^[a-z0-9][a-z0-9-]*$')]
    [string]$Group = '',
    [switch]$Commit,
    [switch]$OncePerWeek
)

$ErrorActionPreference = 'Stop'

# A -File invocation hands a comma-separated list over as one string, so split it back apart.
$Profiles = @($Profiles | ForEach-Object { $_ -split ',' } | ForEach-Object { $_.Trim() } | Where-Object { $_ })

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
$logFile = Join-Path $logDirectory "watch-$Name.log"
$weekFile = Join-Path $logDirectory "watch-$Name.week"

function Write-Log {
    param([string]$Message)

    if (-not (Test-Path $logDirectory)) {
        New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
    }
    $stamp = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
    Add-Content -Path $logFile -Value "$stamp  $Message" -Encoding utf8
}

function Get-WeekKey {
    $now = Get-Date
    '{0}-W{1:d2}' -f [System.Globalization.ISOWeek]::GetYear($now), [System.Globalization.ISOWeek]::GetWeekOfYear($now)
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

$week = Get-WeekKey

if ($OncePerWeek -and (Test-Path $weekFile) -and (Get-Content -Path $weekFile -Raw).Trim() -eq $week) {
    Write-Log "skipped: $week has already been swept"
    exit 20
}

Set-Location $projectRoot

$arguments = @('run', 'crawlee-lab', 'watch')
if ($Profiles.Count -gt 0) { $arguments += $Profiles }
elseif ($Group) { $arguments += @('--group', $Group) }
if ($Commit) { $arguments += '--commit' }

Write-Log "sweep started ($week): uv $($arguments -join ' ')"

$transcript = & uv @arguments 2>&1 | Out-String
$code = $LASTEXITCODE

$headline = ($transcript -split "`n" | Where-Object { $_ -match 'targets (changed|failed)|no change across' } | Select-Object -Last 1).Trim()
if (-not $headline) { $headline = "watch exited with $code" }

Write-Log "sweep finished ($code): $headline"

if ($code -eq 0 -or $code -eq 10) {
    if (-not (Test-Path $logDirectory)) {
        New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
    }
    Set-Content -Path $weekFile -Value $week -Encoding utf8
}

switch ($code) {
    10 { Show-Notification -Title 'crawlee-lab: a tracked site changed' -Message $headline }
    0 { }
    default { Show-Notification -Title 'crawlee-lab: the sweep failed' -Message $headline }
}

Write-Output $transcript
exit $code
