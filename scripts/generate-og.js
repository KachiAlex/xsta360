// Generate og.png from the SVG template using sharp.
const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

const svgPath = path.join(__dirname, "..", "public", "og-template.svg");
const outPath = path.join(__dirname, "..", "public", "og.png");

async function main() {
  const svgBuffer = fs.readFileSync(svgPath);
  await sharp(svgBuffer).resize(1200, 630).png().toFile(outPath);
  console.log("Generated og.png (1200x630)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
