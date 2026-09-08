<#
.SYNOPSIS
    Sweep every tracked target once and notify only when something needs a human.

.DESCRIPTION
    The wrapper a scheduled task calls. It runs `crawlee-lab watch`, appends the run to a log, and
    raises a desktop notification only when the sweep found a change or could not vouch for itself.
    A quiet sweep stays quiet: a monitor that speaks every day stops being read.

    Exit codes are passed through unchanged, so the Task Scheduler history shows the same verdict:
    0 nothing changed, 10 something did, 1 a target failed, 30 another round already held this
    group. The wrapper adds 20 for a run that decided the week was already swept, or had already
    spent its attempts on it, and did nothing.

    A 30 is silent and costs nothing: the round never crawled, so it raises no notification and the
    attempt it had already counted is refunded. The week stays owed and the next logon takes it.

    The sweep's own output is streamed to `watch-<name>.out` as it arrives rather than collected and
    written at the end, because the interesting run is the one that never reaches the end. A sweep
    the scheduler kills used to leave a log saying it had started and nothing else. It reaches the
    console at the same time, so the window a scheduled round opens shows the crawl happening
    instead of sitting blank for the tens of minutes a round takes.

    That window also says what it is. Its title carries the round and the phase, and it opens with a
    header naming the round, the corpus and the log, because a console that appears at logon with
    nothing in it reads as something having gone wrong rather than as work in progress. The phase
    matters: the crawl is not the slow part on a week that changed, the follow-up is.

    A notification waits rather than passing. It is raised as a Windows toast with scenario
    "reminder", which stays on screen until it is dismissed and remains in the notification centre
    afterwards, so a sweep that finished while nobody was looking still gets read. This is why the
    toast is raised through `powershell.exe`: the WinRT types it needs cannot be loaded from
    PowerShell 7, which is what the scheduled task runs. Where that fails the older balloon is used
    instead, and the log says which was used. The balloon is a fallback rather than the mechanism
    because it has to be disposed, and disposing it takes the notification out of the notification
    centre as well as off the screen: it was gone twelve seconds after it appeared.

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
    without overwriting each other's turn. They land wherever the run's own output goes, which is
    read from the environment and then from .env, the way the toolkit itself resolves it.

.PARAMETER Name
    Names this sweep's log and its record of the last week swept. Defaults to 'labs-docs'.

.PARAMETER Profiles
    Profiles to sweep. Defaults to every profile that asks for snapshots.

.PARAMETER Group
    Sweep only the profiles that belong to this group. Cannot be combined with -Profiles, which
    already names a set of targets.

.PARAMETER Commit
    Commit each snapshot that moved, when the data directory is inside a git repository.

.PARAMETER Repository
    The corpus repository this round covers: a directory holding data/, profiles/ and output/.
    Given, it points the run at that corpus instead of whatever .env names.

    The toolkit resolves one data root and treats groups as folders inside it, so two corpora that
    have nothing to do with each other are two repositories and two rounds, not two groups. The
    profiles a round can even see are the ones in its own repository, which is what keeps a round
    from sweeping somebody else's targets by accident.

.PARAMETER OnChange
    Script or executable to run when, and only when, the sweep found a real change. It is handed
    one argument: the path to a markdown digest of what moved, which the wrapper writes first.

    It takes a path rather than a command line on purpose. Whatever reads the digest — a model, a
    document generator, a webhook — stays outside this toolkit, which is what keeps the toolkit
    from acquiring a provider and a key. A follow-up that needs arguments of its own is a two-line
    script.

    A reordered page is not a change. A sweep that found nothing but shuffled table rows exits 0
    and never reaches here.

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
    .\scripts\watch.ps1 -Group docs-labs -Commit -OnChange .\scripts\on-change.ps1
#>
[CmdletBinding()]
param(
    [ValidatePattern('^[A-Za-z0-9][A-Za-z0-9._-]*$')]
    [string]$Name = 'labs-docs',
    [string[]]$Profiles = @(),
    [ValidatePattern('^$|^[a-z0-9][a-z0-9-]*$')]
    [string]$Group = '',
    [switch]$Commit,
    [string]$Repository = '',
    [string]$OnChange = '',
    [switch]$OncePerWeek,
    [ValidateRange(1, 10)]
    [int]$MaxAttempts = 2
)

$ErrorActionPreference = 'Stop'

$WINDOWS_POWERSHELL_AUMID = '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\WindowsPowerShell\v1.0\powershell.exe'

# A -File invocation hands a comma-separated list over as one string, so split it back apart.
$Profiles = @($Profiles | ForEach-Object { $_ -split ',' } | ForEach-Object { $_.Trim() } | Where-Object { $_ })

$projectRoot = Split-Path -Parent $PSScriptRoot

function Get-DotEnvValue {
    param(
        [string]$Path,
        [string]$Key
    )

    # The toolkit resolves its settings from the environment first and .env second. This reads the
    # same file the same way round, because a wrapper that guessed 'output' would write the log to
    # a directory the run itself had been told to abandon.
    if (-not (Test-Path $Path)) {
        return ''
    }
    foreach ($line in Get-Content -Path $Path) {
        $trimmed = $line.Trim()
        if (-not $trimmed -or $trimmed.StartsWith('#')) { continue }
        $split = $trimmed.IndexOf('=')
        if ($split -lt 1) { continue }
        if ($trimmed.Substring(0, $split).Trim() -eq $Key) {
            return $trimmed.Substring($split + 1).Trim().Trim('"', "'")
        }
    }
    return ''
}

if ($Repository) {
    # One round, one corpus repository. The toolkit resolves a single data root, so a machine that
    # watches two unrelated corpora points each round at its own rather than filing them together.
    # Set in the environment rather than written to .env, because the environment outranks it and a
    # round must not edit the configuration of the round that runs next.
    $corpus = (Resolve-Path -Path $Repository -ErrorAction Stop).Path
    foreach ($required in 'data', 'profiles') {
        if (-not (Test-Path (Join-Path $corpus $required))) {
            throw "$corpus does not look like a corpus repository: no $required directory"
        }
    }
    $env:CRAWLEE_LAB_DATA_DIR = Join-Path $corpus 'data'
    $env:CRAWLEE_LAB_PROFILES_DIR = Join-Path $corpus 'profiles'
    $env:CRAWLEE_LAB_OUTPUT_DIR = Join-Path $corpus 'output'
}

# The log belongs wherever the run's other output goes, which the environment may have moved.
$configuredOutput = $env:CRAWLEE_LAB_OUTPUT_DIR
if ([string]::IsNullOrWhiteSpace($configuredOutput)) {
    $configuredOutput = Get-DotEnvValue -Path (Join-Path $projectRoot '.env') -Key 'CRAWLEE_LAB_OUTPUT_DIR'
}
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

function ConvertTo-XmlText {
    param([string]$Text)

    $flat = ($Text -split "`r?`n" | ForEach-Object { $_.Trim() }) -join ' '
    return $flat.Replace('&', '&amp;').Replace('<', '&lt;').Replace('>', '&gt;')
}

function Show-Notification {
    param(
        [string]$Title,
        [string]$Message
    )

    $toast = @"
<toast scenario="reminder">
  <visual>
    <binding template="ToastGeneric">
      <text>$(ConvertTo-XmlText $Title)</text>
      <text>$(ConvertTo-XmlText $Message)</text>
    </binding>
  </visual>
  <actions>
    <action content="Dismiss" arguments="dismiss" activationType="system"/>
  </actions>
</toast>
"@

    $raiser = @"
[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] > `$null
[Windows.UI.Notifications.ToastNotification, Windows.UI.Notifications, ContentType = WindowsRuntime] > `$null
[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom, ContentType = WindowsRuntime] > `$null
`$document = New-Object Windows.Data.Xml.Dom.XmlDocument
`$document.LoadXml(@'
$toast
'@)
`$notification = New-Object Windows.UI.Notifications.ToastNotification `$document
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('$WINDOWS_POWERSHELL_AUMID').Show(`$notification)
"@

    try {
        $encoded = [Convert]::ToBase64String([System.Text.Encoding]::Unicode.GetBytes($raiser))
        & powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand $encoded 2>&1 | Out-Null
        if ($LASTEXITCODE -eq 0) {
            return
        }
        Write-Log "toast unavailable: powershell.exe exited with $LASTEXITCODE"
    }
    catch {
        Write-Log "toast unavailable: $($_.Exception.Message)"
    }

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
        Write-Log "notification unavailable: $($_.Exception.Message)"
    }
}

function Set-WindowTitle {
    param([string]$Phase)

    try {
        $Host.UI.RawUI.WindowTitle = "crawlee-lab: $Name, $Phase"
    }
    catch {
        Write-Log "window title unavailable: $($_.Exception.Message)"
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

$covers = if ($Group) { "group $Group" } elseif ($Profiles.Count -gt 0) { $Profiles -join ', ' } else { 'every snapshot profile' }
$corpus = if ($env:CRAWLEE_LAB_DATA_DIR) { $env:CRAWLEE_LAB_DATA_DIR } else { $logDirectory }

Set-WindowTitle "sweeping $covers ($week)"
Write-Host ''
Write-Host 'crawlee-lab: the weekly documentation sweep'
Write-Host "  round    $Name, $covers, week $week"
Write-Host "  corpus   $corpus"
Write-Host "  log      $logFile"
Write-Host '  This window is the sweep itself. It closes when the crawl and its follow-up have'
Write-Host '  finished, which takes tens of minutes, and it needs nothing from you.'
Write-Host ''

Write-Log "sweep started ($week): uv $($arguments -join ' ')"

# Streamed rather than collected, so a run the scheduler kills still says how far it got, and so
# the window shows the crawl while it happens rather than a blank console for tens of minutes.
& uv @arguments 2>&1 |
    Tee-Object -FilePath $outputFile |
    Tee-Object -Variable swept
$code = $LASTEXITCODE
$transcript = $swept | Out-String

$headline = ($transcript -split "`n" | Where-Object { $_ -match 'targets (changed|failed)|no change across' } | Select-Object -Last 1).Trim()
if (-not $headline) { $headline = "watch exited with $code" }

Write-Log "sweep finished ($code): $headline"

if ($code -eq 0 -or $code -eq 10) {
    Write-SweepState $weekFile $week ([Math]::Max($attempts, 1)) $true $false
}
elseif ($code -eq 30 -and $OncePerWeek) {
    # 30 means another round held the group, so this one never crawled. An attempt was counted
    # before the sweep started, and a round that did not happen must not spend one: two collisions
    # with a manual sweep would otherwise make the week give up on itself.
    Write-SweepState $weekFile $week ([Math]::Max($attempts - 1, 0)) $false $false
    Write-Log "attempt refunded: the round never started"
}

# Exit 10 is the only code that means "something moved". The digest is built then and only then,
# while the change reports it reads are still the ones this sweep wrote: the next sweep overwrites
# them. Whatever -OnChange names is handed the file and left to decide what it is for.
if ($code -eq 10) {
    Set-WindowTitle 'writing the digest'
    $digestFile = Join-Path $logDirectory "digest-$Name.md"
    $digestArguments = @('run', 'crawlee-lab', 'digest', '--changed', '--out', $digestFile)
    if ($Profiles.Count -gt 0) { $digestArguments += $Profiles }
    elseif ($Group) { $digestArguments += @('--group', $Group) }

    & uv @digestArguments 2>&1 | Out-String | ForEach-Object { Write-Log "digest: $($_.Trim())" }
    if ($LASTEXITCODE -ne 0) {
        Write-Log "digest failed with $LASTEXITCODE"
        $digestFile = ''
    }

    if ($OnChange -and $digestFile) {
        Set-WindowTitle 'running the follow-up, which is the slow part'
        Write-Host "running the follow-up: $OnChange"
        Write-Log "on-change: $OnChange $digestFile"
        try {
            & $OnChange $digestFile
            $followUp = $LASTEXITCODE
        }
        catch {
            $followUp = 1
            Write-Log "on-change could not be run: $($_.Exception.Message)"
        }
        if ($followUp -ne 0) {
            # A follow-up that fails quietly is the failure mode this whole script exists to avoid.
            Write-Log "on-change failed with $followUp"
            Show-Notification -Title 'crawlee-lab: the follow-up failed' `
                -Message "$OnChange exited with $followUp. The digest is at $digestFile"
        }
        else {
            Write-Log 'on-change finished'
        }
    }
}

Set-WindowTitle "finished ($code)"

switch ($code) {
    10 { Show-Notification -Title 'crawlee-lab: a tracked site changed' -Message $headline }
    0 { }
    # Another round held the group. Nothing failed and nothing is owed a human, so it stays quiet.
    30 { }
    default { Show-Notification -Title 'crawlee-lab: the sweep failed' -Message $headline }
}

exit $code
