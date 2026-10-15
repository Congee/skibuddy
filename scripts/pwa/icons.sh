#!/usr/bin/env bash
# Renders the PWA icons from the SVG sources with resvg.
set -euo pipefail
cd "$(dirname "$0")/../.."
out=public/icons
render() { nix run nixpkgs#resvg -- "$1" "$out/$2" -w "$3" -h "$3"; }
render "$out/favicon.svg" icon-192.png 192
render "$out/favicon.svg" icon-512.png 512
render "$out/favicon.svg" favicon-32.png 32
render scripts/pwa/icon-full-bleed.svg icon-maskable-512.png 512
render scripts/pwa/icon-full-bleed.svg apple-touch-icon.png 180
