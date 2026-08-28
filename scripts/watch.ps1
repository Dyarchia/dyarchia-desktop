<#
.SYNOPSIS
    Sweep every tracked target once and notify only when something needs a human.

.DESCRIPTION
    The wrapper a scheduled task calls. It runs `crawlee-lab watch`, appends the run to a log, and
    raises a desktop notification only when the sweep found a change or could not vouch for itself.
    A quiet sweep stays quiet: a monitor that speaks every day stops being read.

    Exit codes are passed through unchanged, so the Task Scheduler history shows the same verdict:
    0 nothing changed, 10 something did, 1 a target failed. The wrapper adds 20 for a run that
    decided the week was already swept, or had already spent its attempts on it, and did nothing.

    The sweep's own output is streamed to `watch-<name>.out` as it arrives rather than collected and
    written at the end, because the interesting run is the one that never reaches the end. A sweep
    the scheduler kills used to leave a log saying it had started and nothing else.

    With -OncePerWeek the wrapper keeps a record of the current ISO week and refuses to sweep that
    week twice, which is what turns a trigger that fires on every logon into one sweep a week. The
    record counts attempts as well as completion: a week whose sweep did not finish is still owed
    one and the next logon takes it, but only up to -MaxAttempts, because a sweep that cannot
    finish would otherwise start again at every logon for the rest of the week. That is not a
    hypothetical. A run killed by the scheduler's execution time limit leaves exactly that state,
    and seven consecutive logons each spent an hour crawling before this was written.

    Giving up is announced once, on the desktop, rather than quietly. A monitor that stops trying
    and says nothing is worse than one that never ran.

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
    Do nothing if this name has already swept the current ISO week, or has already spent its
    attempts on it.

.PARAMETER MaxAttempts
    How many times a single week may be attempted before the wrapper stops trying until the next
    one. Defaults to 2. Only counts under -OncePerWeek; a sweep run by hand never spends an attempt.

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
    [switch]$OncePerWeek,
    [ValidateRange(1, 10)]
    [int]$MaxAttempts = 2
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
$outputFile = Join-Path $logDirectory "watch-$Name.out"

function Write-Log {
    param([string]$Message)

    if (-not (Test-Path $logDirectory)) {
        New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
    }
    $stamp = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
    Add-Content -Path $logFile -Value "$stamp  $Message" -Encoding utf8
}

function Read-SweepState {
    param([string]$Path)

    if (-not (Test-Path $Path)) {
        return $null
    }
    $raw = (Get-Content -Path $Path -Raw).Trim()
    if (-not $raw) {
        return $null
    }
    if (-not $raw.StartsWith('{')) {
        # The record used to be the bare week that had been swept, which means one that finished.
        return [pscustomobject]@{ week = $raw; attempts = 1; completed = $true; notified = $false }
    }
    return $raw | ConvertFrom-Json
}

function Write-SweepState {
    param(
        [string]$Path,
        [string]$Week,
        [int]$Attempts,
        [bool]$Completed,
        [bool]$Notified
    )

    if (-not (Test-Path $logDirectory)) {
        New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
    }
    $state = [pscustomobject]@{ week = $Week; attempts = $Attempts; completed = $Completed; notified = $Notified }
    $state | ConvertTo-Json -Compress | Set-Content -Path $Path -Encoding utf8
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
$state = Read-SweepState $weekFile
$attempts = if ($state -and $state.week -eq $week) { [int]$state.attempts } else { 0 }

if ($OncePerWeek -and $state -and $state.week -eq $week) {
    if ($state.completed) {
        Write-Log "skipped: $week has already been swept"
        exit 20
    }
    if ($attempts -ge $MaxAttempts) {
        Write-Log "skipped: $week has had $attempts attempts that did not finish, and is given up on"
        if (-not $state.notified) {
            Show-Notification -Title 'crawlee-lab: the week could not be swept' `
                -Message "$Name gave up on $week after $attempts attempts that did not finish"
            Write-SweepState $weekFile $week $attempts $false $true
        }
        exit 20
    }
}

if ($OncePerWeek) {
    $attempts = $attempts + 1
    Write-SweepState $weekFile $week $attempts $false $false
}

Set-Location $projectRoot

$arguments = @('run', 'crawlee-lab', 'watch')
if ($Profiles.Count -gt 0) { $arguments += $Profiles }
elseif ($Group) { $arguments += @('--group', $Group) }
if ($Commit) { $arguments += '--commit' }

Write-Log "sweep started ($week): uv $($arguments -join ' ')"

# Streamed rather than collected, so a run the scheduler kills still says how far it got.
$transcript = & uv @arguments 2>&1 | Tee-Object -FilePath $outputFile | Out-String
$code = $LASTEXITCODE

$headline = ($transcript -split "`n" | Where-Object { $_ -match 'targets (changed|failed)|no change across' } | Select-Object -Last 1).Trim()
if (-not $headline) { $headline = "watch exited with $code" }

Write-Log "sweep finished ($code): $headline"

if ($code -eq 0 -or $code -eq 10) {
    Write-SweepState $weekFile $week ([Math]::Max($attempts, 1)) $true $false
}

switch ($code) {
    10 { Show-Notification -Title 'crawlee-lab: a tracked site changed' -Message $headline }
    0 { }
    default { Show-Notification -Title 'crawlee-lab: the sweep failed' -Message $headline }
}

Write-Output $transcript
exit $code
