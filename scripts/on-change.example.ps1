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
    Where to leave whatever this produces. Defaults to the digest's own directory.

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

if (-not (Test-Path $Digest)) {
    throw "no digest at $Digest"
}
if (-not $OutputDirectory) {
    $OutputDirectory = Split-Path -Parent $Digest
}

$stamp = (Get-Date).ToString('yyyy-MM-dd')
$answer = Join-Path $OutputDirectory "review-$stamp.md"

# Replace this with whatever should read the change. The digest is plain markdown on disk, so any
# model, script or webhook can take it; what matters is that it runs only when something moved.
$prompt = @"
Read the change digest at $Digest.

It lists every documentation page that changed since the last weekly sweep, with the diff and the
path to the page's current text. Pages marked as reordered only are noise; ignore them.

Decide whether any change is worth acting on. If none is, say so in one line and stop. If some is,
write a short note saying what changed, for whom it matters, and which of our documents needs
revisiting. Read the full page files before claiming what they now say.
"@

claude -p $prompt | Out-File -FilePath $answer -Encoding utf8
if ($LASTEXITCODE -ne 0) {
    throw "the model step exited with $LASTEXITCODE"
}

Write-Output "wrote $answer"
