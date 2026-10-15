#!/usr/bin/env bash
# Usage: scripts/anatomy/build.sh <Startup.blend> <work-dir>
# Builds public/models/anatomy.glb from the Z-Anatomy template; needs nix.
set -euo pipefail
blend=$1
work=$2
here=$(cd "$(dirname "$0")" && pwd)
repo=$(cd "$here/../.." && pwd)
mkdir -p "$work" "$repo/public/models"
(cd "$repo" && bun scripts/anatomy/pose-track.ts 24) > "$work/pose-track.json"
nix run nixpkgs#blender -- -b --disable-autoexec "$blend" --python-exit-code 1 \
  --python "$here/build_anatomy.py" -- --out "$work/anatomy-raw.glb" --report "$work/report.json" --pose "$work/pose-track.json" "${@:3}"
# -kv keeps the fibre UVs, which no material references; -kn/-km/-ke keep the names and extras the viewer reads.
nix run nixpkgs#meshoptimizer -- -i "$work/anatomy-raw.glb" -o "$repo/public/models/anatomy.glb" -cc -kv -kn -km -ke -v
ls -l "$work/anatomy-raw.glb" "$repo/public/models/anatomy.glb"
