<#
.SYNOPSIS
    Register a weekly sweep with the Windows Task Scheduler.

.DESCRIPTION
    Creates a scheduled task that runs `scripts\watch.ps1` at logon and lets the wrapper decide
    whether the week is still owed a sweep. Weeks start on Monday, so the sweep runs the first time
    you log on that week: Monday if you turn the machine on that day, the first day you do if you
    do not. No week is skipped for the machine having been asleep at some fixed hour.

    The task runs only while the current user is logged on, because the notification needs a desktop
    to appear on, and with its window hidden, because a console that opens by itself at every logon
    reads as something having gone wrong.

    The execution time limit is generous on purpose. A sweep that the scheduler kills leaves the
    week unfinished, and an unfinished week is attempted again; a limit set below what a sweep
    actually takes therefore turns one weekly round into one round per logon. Measured on this
    corpus: nine targets and about 2,550 pages take some 25 minutes, and the largest group about
    40. Three hours is that with room, not a guess.

    Each sweep gets its own name under the `\crawlee-lab\` folder of the Task Scheduler, so several
    sweeps over different profiles can coexist. The name also keys the wrapper's log and its record
    of which week has been swept, so two tasks must never share one: they would take each other's
    turn and only one of them would ever run.

    Run this yourself when you want a monitor to start; nothing registers it for you. Re-running it
    replaces the task of the same name rather than adding a second one.

.PARAMETER Name
    The name the task appears under, inside the `\crawlee-lab\` folder. Defaults to 'labs-docs',
    which sweeps every profile that asks for snapshots.

.PARAMETER Profiles
    Profiles to sweep. Defaults to every profile that asks for snapshots.

.PARAMETER Group
    Sweep only the profiles that belong to this group, which is how a round stays over its own
    corpus instead of adopting every target added to the machine after it was registered. Cannot
    be combined with -Profiles, which already names a set of targets.

.PARAMETER Commit
    Commit each snapshot that moved, when the data directory is inside a git repository.

.PARAMETER Repository
    The corpus repository this task covers: a directory holding data/, profiles/ and output/. A
    machine that watches two unrelated corpora registers one task per repository, because the
    toolkit resolves a single data root and a round can only see the profiles in its own.

.PARAMETER OnChange
    Script or executable the sweep runs when it found a real change, handed the path to a markdown
    digest of what moved. The path is resolved when the task is registered, not when it fires, so a
    typo is an error here rather than a silent weekly failure at logon.

.PARAMETER Hours
    How long the task may run before the scheduler kills it. Defaults to 3.

.PARAMETER Delay
    How long to wait after logon before sweeping, as an ISO 8601 duration. Defaults to PT2M, which
    keeps the crawl out of the way of everything else that starts with the session.

.PARAMETER Unregister
    Remove the task of that name instead of creating it.

.EXAMPLE
    .\scripts\register-watch-task.ps1 -Name labs-docs -Group docs-labs
    .\scripts\register-watch-task.ps1 -Name claude-only -Profiles claude-docs, claude-code-docs
    .\scripts\register-watch-task.ps1 -Name salesforce -Group salesforce-ai -Repository ..\crawlee-salesforce-data
    .\scripts\register-watch-task.ps1 -Name labs-docs -Unregister
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
    [ValidatePattern('^P(T(\d+H)?(\d+M)?(\d+S)?)$')]
    [string]$Delay = 'PT2M',
    [ValidateRange(1, 24)]
    [int]$Hours = 3,
    [switch]$Unregister
)

$ErrorActionPreference = 'Stop'

$taskPath = '\crawlee-lab\'

if ($Unregister) {
    Unregister-ScheduledTask -TaskName $Name -TaskPath $taskPath -Confirm:$false
    Write-Output "removed the scheduled task '$Name'"
    return
}

$projectRoot = Split-Path -Parent $PSScriptRoot
$wrapper = Join-Path $PSScriptRoot 'watch.ps1'

if (-not (Test-Path $wrapper)) {
    throw "cannot find $wrapper"
}

if ($Group -and $Profiles.Count -gt 0) {
    throw 'name the profiles or name a group, not both: a group is already a set of them'
}

$arguments = @(
    '-WindowStyle', 'Hidden'
    '-NoProfile'
    '-NonInteractive'
    '-ExecutionPolicy', 'Bypass'
    '-File', "`"$wrapper`""
    '-Name', $Name
    '-OncePerWeek'
)
if ($Profiles.Count -gt 0) {
    $arguments += '-Profiles'
    $arguments += ($Profiles -join ',')
}
elseif ($Group) {
    $arguments += '-Group'
    $arguments += $Group
}
if ($Commit) {
    $arguments += '-Commit'
}
if ($Repository) {
    $corpus = (Resolve-Path -Path $Repository).Path
    $arguments += '-Repository'
    $arguments += "`"$corpus`""
}
if ($OnChange) {
    # Resolved now rather than at fire time: a task registered against a path that does not exist
    # fails once a week, in the background, at logon, which is the worst place to learn about a typo.
    $followUp = (Resolve-Path -Path $OnChange).Path
    $arguments += '-OnChange'
    $arguments += "`"$followUp`""
}

$action = New-ScheduledTaskAction -Execute 'pwsh.exe' -Argument ($arguments -join ' ') -WorkingDirectory $projectRoot
$trigger = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
$trigger.Delay = $Delay
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours $Hours)

Register-ScheduledTask -TaskName $Name -TaskPath $taskPath -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null

$covers = 'every profile that asks for snapshots'
if ($Profiles.Count -gt 0) {
    $covers = $Profiles -join ', '
}
elseif ($Group) {
    $covers = "group $Group"
}
else {
    Write-Warning "this task sweeps $covers, including any added after today. Name a group to keep it over one corpus."
}

Write-Output "registered '$Name', at logon, sweeping $covers once per week, $Hours h at most"
Write-Output "run it now with: Start-ScheduledTask -TaskName '$Name' -TaskPath '$taskPath'"
Write-Output "remove it with:  .\scripts\register-watch-task.ps1 -Name $Name -Unregister"
