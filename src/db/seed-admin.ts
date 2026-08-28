/**
 * Seed superadmin account + default plans.
 * Run with: npx tsx src/db/seed-admin.ts
 *
 * This creates:
 * 1. A superadmin user (or promotes an existing one by email)
 * 2. Three default plans: Starter, Pro, Enterprise
 */
process.env.SKIP_SERVER_ONLY = "1";
import { db, schema } from "./index";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

async function seedAdmin() {
  const email = process.env.SUPERADMIN_EMAIL ?? "admin@kreatix.tech";
  const password = process.env.SUPERADMIN_PASSWORD ?? "Kreatix2026!";
  const name = process.env.SUPERADMIN_NAME ?? "Kreatix Admin";

  console.log(`Seeding superadmin: ${email}`);

  // Check if user already exists
  const [existing] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, email))
    .limit(1);

  if (existing) {
    // Promote to superadmin if not already.
    if (!existing.isSuperadmin) {
      await db
        .update(schema.users)
        .set({ isSuperadmin: true, suspendedAt: null })
        .where(eq(schema.users.id, existing.id));
      console.log(`Promoted existing user to superadmin: ${email}`);
    } else {
      console.log(`Superadmin already exists: ${email}`);
    }
  } else {
    const passwordHash = await bcrypt.hash(password, 10);
    await db.insert(schema.users).values({
      name,
      email,
      passwordHash,
      isSuperadmin: true,
    });
    console.log(`Created superadmin: ${email}`);
  }

  // Seed default plan — hybrid per-seat pricing
  console.log("Seeding default plan...");

  const defaultPlan = {
    name: "Standard",
    basePriceMonthly: 1000,    // ₦1000 for the workspace admin
    perSeatPriceMonthly: 500,  // ₦500 per additional member
    trialDays: 30,             // 1 month free trial
    currency: "₦",
    features: { sequences: true, custom_fields: true, reports: true },
    position: 0,
  };

  const [existingPlan] = await db
    .select()
    .from(schema.plans)
    .where(eq(schema.plans.name, defaultPlan.name))
    .limit(1);

  if (existingPlan) {
    // Update existing plan to new pricing model
    await db
      .update(schema.plans)
      .set({
        basePriceMonthly: defaultPlan.basePriceMonthly,
        perSeatPriceMonthly: defaultPlan.perSeatPriceMonthly,
        trialDays: defaultPlan.trialDays,
        currency: defaultPlan.currency,
        features: defaultPlan.features,
      })
      .where(eq(schema.plans.id, existingPlan.id));
    console.log(`Updated plan "${defaultPlan.name}" to hybrid pricing`);
  } else {
    await db.insert(schema.plans).values(defaultPlan);
    console.log(`Created plan: ${defaultPlan.name} (₦1000 base + ₦500/seat, 30-day trial)`);
  }

  console.log("Done!");
  process.exit(0);
}

seedAdmin().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
