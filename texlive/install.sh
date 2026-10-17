#!/usr/bin/env bash
# Installs TeX Live from the snapshot in repository.txt, with the packages in
# packages.txt, and links its programs into /usr/local/bin. For Linux machines
# such as cloud sessions; run it as root. A second run changes nothing.
#
#   TEXLIVE_DIR   where to install (default /opt/texlive/2026)
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
entries() { grep -v -e '^#' -e '^[[:space:]]*$' "$1"; }
repo="$(entries "$here/repository.txt" | head -n 1)"
mapfile -t packages < <(entries "$here/packages.txt")
dir="${TEXLIVE_DIR:-/opt/texlive/2026}"
bin="$dir/bin/x86_64-linux"

if [ ! -x "$bin/tlmgr" ]; then
  work="$(mktemp -d)"
  trap 'rm -rf "$work"' EXIT
  curl -fsSL "$repo/install-tl-unx.tar.gz" | tar -xz -C "$work" --strip-components=1
  cat > "$work/texlive.profile" <<PROFILE
selected_scheme scheme-basic
TEXDIR $dir
TEXMFLOCAL $dir/../texmf-local
TEXMFSYSCONFIG $dir/texmf-config
TEXMFSYSVAR $dir/texmf-var
TEXMFHOME ~/texmf
binary_x86_64-linux 1
instopt_adjustpath 0
tlpdbopt_install_docfiles 0
tlpdbopt_install_srcfiles 0
tlpdbopt_autobackup 0
PROFILE
  perl "$work/install-tl" --no-interaction --profile="$work/texlive.profile" \
    --repository "$repo"
fi

"$bin/tlmgr" option repository "$repo"
"$bin/tlmgr" install "${packages[@]}"
"$bin/tlmgr" path add
pdflatex --version | head -n 1
