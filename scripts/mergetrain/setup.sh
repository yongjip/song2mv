#!/bin/sh
# The first gate of every train, in a fresh worktree: a venv from uv's cache, and the template's node_modules
# (with Remotion's browser) linked from a cache kept per package-lock.json.
set -eu

uv venv -q --python 3.12
uv pip install -q -e '.[beats,dev]'

template=src/song2mv/render/template
root="${XDG_CACHE_HOME:-$HOME/.cache}/song2mv-gates"
key=node-$(shasum -a 256 "$template/package-lock.json" | cut -c1-16)
if [ ! -d "$root/$key" ]; then
  mkdir -p "$root"
  tmp=$(mktemp -d "$root/.$key.XXXXXX")
  cp "$template/package.json" "$template/package-lock.json" "$tmp/"
  (cd "$tmp" && npm ci --no-audit --no-fund)
  mv "$tmp" "$root/$key"
fi
touch "$root/$key"
ln -s "$root/$key/node_modules" "$template/node_modules"
find "$root" -mindepth 1 -maxdepth 1 ! -name "$key" -mtime +7 -exec rm -rf {} +
