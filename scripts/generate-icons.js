// Generate PNG favicon set from the SVG icon.
// Run inside the app container where sharp is installed.
const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

const svgPath = path.join(__dirname, "..", "public", "icon.svg");
const svgBuffer = fs.readFileSync(svgPath);

const sizes = [
  { name: "icon-192.png", size: 192 },
  { name: "icon-512.png", size: 512 },
  { name: "apple-touch-icon.png", size: 180 },
  { name: "favicon-32.png", size: 32 },
  { name: "favicon-16.png", size: 16 },
];

async function main() {
  for (const { name, size } of sizes) {
    const outPath = path.join(__dirname, "..", "public", name);
    await sharp(svgBuffer).resize(size, size).png().toFile(outPath);
    console.log(`Generated ${name} (${size}x${size})`);
  }

  // Also generate a 256x256 for ICO conversion fallback
  const icoPath = path.join(__dirname, "..", "public", "favicon-256.png");
  await sharp(svgBuffer).resize(256, 256).png().toFile(icoPath);
  console.log("Generated favicon-256.png (for ICO conversion)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
