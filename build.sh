#!/bin/sh
# Construye dist/index.html (un solo archivo) y web/ (PWA para GitHub Pages)
set -e
cd "$(dirname "$0")"
mkdir -p dist web
BUILD=$(date -u +%Y-%m-%d_%H%M)
CONFIG="window.FIREBASE_CONFIG = null;"
[ -f config.js ] && [ -z "$DEMO" ] && CONFIG=$(cat config.js)
{
  echo "<script>"
  echo "const APP_BUILD = '$BUILD';"
  echo "$CONFIG"
  for f in engine sync call app-core app-screens app-games app-games2 app-more escape3d main; do cat "src/$f.js"; echo; done
  echo "</script>"
} > dist/.scripts.html
python3 - "$1" <<'PY'
import sys
shell = open('src/shell.html').read()
scripts = open('dist/.scripts.html').read()
pwa = ('<link rel="manifest" href="manifest.webmanifest">\n'
       '<link rel="icon" href="icons/icon-192.png">\n'
       '<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">')
open('dist/index.html', 'w').write(shell.replace('<!--SCRIPTS-->', scripts).replace('<!--PWA-->', ''))
open('web/index.html', 'w').write(shell.replace('<!--SCRIPTS-->', scripts).replace('<!--PWA-->', pwa))
import re
full = shell.replace('<!--SCRIPTS-->', scripts).replace('<!--PWA-->', '')
prev = re.sub(r'<!doctype html>\s*<html[^>]*>\s*<head>\s*', '', full)
prev = prev.replace('</head>\n<body>\n', '').replace('</body>\n</html>\n', '')
prev = re.sub(r'<meta charset="utf-8">\n<meta name="viewport"[^>]*>\n', '', prev)
open('dist/preview.html', 'w').write(prev)
PY
rm dist/.scripts.html
sed "s/__BUILD__/$BUILD/" src/sw.js > web/sw.js
cp src/manifest.webmanifest web/
echo "OK $BUILD"
