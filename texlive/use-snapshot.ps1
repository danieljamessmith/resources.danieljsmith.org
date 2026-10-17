# Points this Windows machine's TeX Live 2026 at the snapshot in
# repository.txt and installs the packages in packages.txt from it, so it
# builds exactly what every other machine builds. tlmgr never downgrades: a
# package newer than the snapshot stays as it is. Run it from an elevated
# PowerShell if TeX Live was installed for all users.
$ErrorActionPreference = 'Stop'
function Get-Entries([string] $name) {
    Get-Content -LiteralPath (Join-Path $PSScriptRoot $name) |
        Where-Object { $_.Trim() -and -not $_.StartsWith('#') }
}
$repository = (Get-Entries 'repository.txt' | Select-Object -First 1).Trim()
$packages = Get-Entries 'packages.txt'

tlmgr option repository $repository
tlmgr update --self --all
tlmgr install @packages
pdflatex --version | Select-Object -First 1
