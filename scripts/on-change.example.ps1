<#
.SYNOPSIS
    Example of the follow-up `watch.ps1 -OnChange` runs when a sweep found a real change.

.DESCRIPTION
    Copy this next to it, edit it, and point -OnChange at your copy. It is an example rather than
    a feature: what to do with a change is an editorial decision, and the toolkit deliberately does
    not hold one. This is the seam.

    The wrapper hands one argument, the path to the markdown digest of what moved. The digest names
    every changed page, its diff, and the file holding its current text, so a model can read the
    page in full instead of inferring it from the diff.

    Everything here is the part you own: which model, which prompt, where the answer goes, and
    whether a document gets rewritten or a message gets sent. Nothing in crawlee-lab needs a key.

.PARAMETER Digest
    Path to the digest the sweep wrote. Passed positionally by watch.ps1.

.PARAMETER OutputDirectory
    Where to leave whatever this produces. Derived from the digest when not given: the digest lands
    in the corpus repository's output/, so this defaults to that repository's reviews/.

.EXAMPLE
    .\scripts\watch.ps1 -Group docs-labs -OncePerWeek -Commit -OnChange .\scripts\on-change.ps1
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [string]$Digest,

    [string]$OutputDirectory = ''
)

$ErrorActionPreference = 'Stop'

# claude writes UTF-8 to stdout; PowerShell decodes it with the console codepage, which under the
# scheduled task is the OEM one. Without this the review is captured double-encoded and lands on
# disk as valid UTF-8 holding the wrong characters -- it wrote "S..." for "Si" on the first real run.
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function Get-ReviewDirectory {
    param([string]$DigestPath)

    # The digest is written to <repository>/output/, so the repository is two levels up and its
    # reviews/ sits beside the corpus the review is about. Deriving it rather than naming it is
    # what lets one follow-up serve every corpus repository: a hardcoded path would file one
    # round's notes with another's.
    $output = Split-Path -Parent $DigestPath
    $repository = Split-Path -Parent $output
    if ((Split-Path -Leaf $output) -eq 'output' -and (Test-Path (Join-Path $repository 'data'))) {
        return Join-Path $repository 'reviews'
    }
    return $output
}

if (-not (Test-Path $Digest)) {
    throw "no digest at $Digest"
}
if (-not $OutputDirectory) {
    $OutputDirectory = Get-ReviewDirectory -DigestPath $Digest
}
if (-not (Test-Path $OutputDirectory)) {
    New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
}

$stamp = (Get-Date).ToString('yyyy-MM-dd')
$review = Join-Path $OutputDirectory "review-$stamp.md"

# Replace this with whatever should read the change. The digest is plain markdown on disk, so any
# model, script or webhook can take it; what matters is that it runs only when something moved.
$prompt = @"
Read the change digest at $Digest.

It lists every documentation page that changed since the last sweep, with the diff and the path to
the page's current text. Pages listed under "Reordered only" are noise; ignore them.

Decide whether any change is worth acting on. If none is, say so in one line and stop. If some is,
write a short note saying what changed, for whom it matters, and which of our documents needs
revisiting. Read the full page files before claiming what they now say; the diff shows what moved,
not what the page means.

Write that note to $review and nothing else to disk. Do not create a sibling of it under any other
name. Print a one-line confirmation and no more: this run is unattended and stdout goes to a log.
"@

# Name the destination in the prompt and leave the file alone until the step is over. Piping the
# model straight into the review creates that file and holds it open for the whole run, so a model
# that writes files finds its own destination locked and writes a sibling instead. Stdout is
# captured and used only if nothing was written, so a model that answers in the terminal still works.
$transcript = & claude -p $prompt 2>&1
$exit = $LASTEXITCODE
if ($exit -ne 0) {
    throw "the model step exited with $exit"
}

if (-not (Test-Path $review)) {
    $transcript | Set-Content -Path $review -Encoding utf8
}

Write-Output "wrote $review"
