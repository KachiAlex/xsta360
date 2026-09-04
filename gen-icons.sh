#!/bin/bash
set -e

# Generate PNG icons from SVG using a temporary node container with sharp.
docker run --rm --entrypoint sh -v /opt/xsta360:/work -w /tmp node:22-slim -c '
  npm init -y 2>/dev/null
  npm i sharp 2>/dev/null
  node -e "
    const sharp = require(\"sharp\");
    const fs = require(\"fs\");
    const svg = fs.readFileSync(\"/work/public/icon.svg\");
    const og = fs.readFileSync(\"/work/public/og-template.svg\");
    Promise.all([
      sharp(svg).resize(192,192).png().toFile(\"/work/public/icon-192.png\"),
      sharp(svg).resize(512,512).png().toFile(\"/work/public/icon-512.png\"),
      sharp(svg).resize(180,180).png().toFile(\"/work/public/apple-touch-icon.png\"),
      sharp(svg).resize(32,32).png().toFile(\"/work/public/favicon-32.png\"),
      sharp(svg).resize(16,16).png().toFile(\"/work/public/favicon-16.png\"),
      sharp(og).resize(1200,630).png().toFile(\"/work/public/og.png\"),
    ]).then(() => console.log(\"All icons generated\")).catch(e => { console.error(e); process.exit(1); });
  "
'

echo "=== Generated files ==="
ls -la /opt/xsta360/public/*.png
