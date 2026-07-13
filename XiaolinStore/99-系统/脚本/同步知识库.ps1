param(
    [string]$Message = "Sync Obsidian notes $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
)

$ErrorActionPreference = 'Stop'
$vaultRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location -LiteralPath $vaultRoot

if (-not (Test-Path -LiteralPath '.git')) {
    throw "Not a Git repository: $vaultRoot"
}

git diff --cached --quiet
if ($LASTEXITCODE -ne 0) {
    throw 'The staging area is not empty. Commit or unstage it first.'
}

git pull --rebase --autostash origin main
if ($LASTEXITCODE -ne 0) {
    throw 'Pull failed. Resolve the network or Git conflict before pushing.'
}

$pathspecs = @(
    '*.md', '*.canvas', '*.base',
    '*.png', '*.jpg', '*.jpeg', '*.gif', '*.webp', '*.svg', '*.pdf',
    '.gitignore', 'CLAUDE.md', '99-系统/脚本/*.ps1'
)
git add -- @pathspecs
if ($LASTEXITCODE -ne 0) {
    throw 'Failed to stage note changes.'
}

git diff --cached --quiet
if ($LASTEXITCODE -eq 0) {
    Write-Host 'No note changes to sync.'
    exit 0
}

git status --short
git commit -m $Message
if ($LASTEXITCODE -ne 0) {
    throw 'Commit failed; nothing was pushed.'
}

git push origin main
if ($LASTEXITCODE -ne 0) {
    throw 'The commit is local, but push failed. Check the network and remote state.'
}

Write-Host 'The vault has been synced to GitHub.'
