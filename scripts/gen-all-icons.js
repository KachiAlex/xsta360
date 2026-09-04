const sharp = require("/app/node_modules/sharp");
const fs = require("fs");

async function main() {
  const svg = fs.readFileSync("/work/public/icon.svg");
  const ogSvg = fs.readFileSync("/work/public/og-template.svg");

  await Promise.all([
    sharp(svg).resize(192, 192).png().toFile("/work/public/icon-192.png"),
    sharp(svg).resize(512, 512).png().toFile("/work/public/icon-512.png"),
    sharp(svg).resize(180, 180).png().toFile("/work/public/apple-touch-icon.png"),
    sharp(svg).resize(32, 32).png().toFile("/work/public/favicon-32.png"),
    sharp(svg).resize(16, 16).png().toFile("/work/public/favicon-16.png"),
    sharp(ogSvg).resize(1200, 630).png().toFile("/work/public/og.png"),
  ]);

  console.log("All icons generated successfully");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
