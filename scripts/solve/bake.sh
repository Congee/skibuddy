#!/bin/sh
# Bakes src/physics/carve-cycles.json from the six carved cells' solves: replay then bake.
# usage: scripts/solve/bake.sh <solve dir>, holding sol-<cell>-n80.json, -n40.json and the other start's sol-<cell>-carve-n80.json, -n40.json
set -eu
dir=$1
here=$(cd "$(dirname "$0")" && pwd)
root=$(cd "$here/../.." && pwd)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
set --
for cell in gs-gentle gs-moderate gs-dynamic sl-gentle sl-moderate sl-dynamic; do
  uv run --script "$here/carve_cycle.py" samples "$dir/sol-$cell-n80.json" "$work/samples-$cell.json"
  bun "$here/replay.ts" "$work/samples-$cell.json" "$work/replay-$cell.json"
  set -- "$@" --cell "$cell" "$dir/sol-$cell-n80.json" "$dir/sol-$cell-n40.json" "$work/replay-$cell.json" \
    --other "$cell" "$dir/sol-$cell-carve-n80.json" "$dir/sol-$cell-carve-n40.json"
done
uv run --script "$here/carve_cycle.py" bake "$root/src/physics/carve-cycles.json" "$@"
