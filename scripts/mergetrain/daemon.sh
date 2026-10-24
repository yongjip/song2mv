#!/bin/sh
# The queue's runner as a launchd agent: scripts/mergetrain/daemon.sh start|stop|status (docs/merge-queue.md).
set -eu

common=$(git -C "$(dirname "$0")" rev-parse --path-format=absolute --git-common-dir)
repo=$(dirname "$common")
label=com.yongjip.mergetrain.$(basename "$repo")
plist="$HOME/Library/LaunchAgents/$label.plist"
log="$HOME/Library/Logs/mergetrain-$(basename "$repo").log"
domain="gui/$(id -u)"

pid() { launchctl print "$domain/$label" 2>/dev/null | awk '$1 == "pid" {print $3}'; }

case "${1:-status}" in
start)
  [ -f "$repo/.mergetrain.yaml" ] || { echo "daemon.sh: $repo has no .mergetrain.yaml; check out main there" >&2; exit 1; }
  for tool in mergetrain git uv node npx ffmpeg gh; do
    command -v "$tool" >/dev/null || { echo "daemon.sh: $tool is not on PATH" >&2; exit 1; }
  done
  if [ -n "$(pid)" ]; then
    echo "daemon.sh: already running, pid $(pid)"
    exit 0
  fi
  launchctl bootout "$domain/$label" 2>/dev/null || true
  mkdir -p "$(dirname "$plist")" "$(dirname "$log")"
  cat >"$plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$label</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/sh</string><string>-c</string>
    <string>caffeinate -i -w \$\$ &amp; exec mergetrain daemon --interval 15</string>
  </array>
  <key>WorkingDirectory</key><string>$repo</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>$PATH</string>
    <key>HOME</key><string>$HOME</string>
    <key>LANG</key><string>en_US.UTF-8</string>
    <key>PYTHONUNBUFFERED</key><string>1</string>
  </dict>
  <key>StandardOutPath</key><string>$log</string>
  <key>StandardErrorPath</key><string>$log</string>
  <key>RunAtLoad</key><true/>
</dict>
</plist>
EOF
  launchctl bootstrap "$domain" "$plist"
  echo "daemon.sh: started $label for $repo, pid $(pid); log: $log"
  ;;
stop)
  # Not launchctl bootout: it kills a train that takes longer than a minute to finish.
  running=$(pid)
  if [ -n "$running" ]; then
    kill -TERM "$running"
    echo "daemon.sh: stopping pid $running; a train in progress finishes first, CI wait included"
    while kill -0 "$running" 2>/dev/null; do sleep 5; done
  fi
  launchctl bootout "$domain/$label" 2>/dev/null || true
  rm -f "$plist"
  echo "daemon.sh: stopped"
  ;;
status)
  if [ -n "$(pid)" ]; then
    echo "daemon.sh: running, pid $(pid)"
  elif [ -f "$plist" ]; then
    echo "daemon.sh: not running although started; see $log, then daemon.sh start"
  else
    echo "daemon.sh: stopped"
  fi
  mergetrain --repo "$repo" status
  ;;
*)
  echo "usage: $0 start|stop|status" >&2
  exit 2
  ;;
esac
