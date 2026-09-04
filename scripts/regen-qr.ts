// Regenerate all contact card QR codes with the current APP_URL.
// Run inside the app container: docker exec -e SKIP_SERVER_ONLY=1 xsta360-app-1 npx tsx scripts/regen-qr.ts
import { toString as qrToString } from "qrcode";
import { eq, isNotNull } from "drizzle-orm";
import { db, schema } from "../src/db";

async function main() {
  const appUrl = (process.env.APP_URL ?? "").replace(/\/$/, "");
  if (!appUrl) {
    console.error("APP_URL is not set");
    process.exit(1);
  }
  console.log(`Regenerating QR codes with APP_URL=${appUrl}`);

  const cards = await db
    .select({ id: schema.contactCards.id, slug: schema.contactCards.slug })
    .from(schema.contactCards)
    .where(isNotNull(schema.contactCards.slug));

  console.log(`Found ${cards.length} cards`);

  let updated = 0;
  for (const card of cards) {
    const cardUrl = `${appUrl}/c/${card.slug}`;
    const qrCodeSvg = await qrToString(cardUrl, {
      type: "svg",
      margin: 2,
      color: { dark: "#1e2a22", light: "#ffffff" },
    });

    await db
      .update(schema.contactCards)
      .set({ qrCodeSvg, updatedAt: new Date() })
      .where(eq(schema.contactCards.id, card.id));

    updated++;
    console.log(`  ✓ ${card.slug} → ${cardUrl}`);
  }

  console.log(`\nDone! Updated ${updated} QR codes.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
