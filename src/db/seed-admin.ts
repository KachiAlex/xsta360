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

  // Seed default plans — hybrid per-seat pricing, 7-day trial on all tiers.
  // Signup assigns the lowest-position active plan (Starter).
  console.log("Seeding default plans...");

  const defaultPlans = [
    {
      name: "Starter",
      basePriceMonthly: 1500,   // ₦1,500 for the workspace admin
      perSeatPriceMonthly: 500, // ₦500 per additional member
      trialDays: 7,
      currency: "₦",
      features: {
        contact_card: true,
        custom_fields: true,
        reports: false,
        sequences: false,
        api_access: false,
        sso: false,
        dedicated_support: false,
        max_members: 3,
      },
      position: 0,
    },
    {
      name: "Standard",
      basePriceMonthly: 3000,
      perSeatPriceMonthly: 1000,
      trialDays: 7,
      currency: "₦",
      features: {
        contact_card: true,
        custom_fields: true,
        reports: true,
        sequences: true,
        api_access: false,
        sso: false,
        dedicated_support: false,
        max_members: 10,
      },
      position: 1,
    },
    {
      name: "Pro",
      basePriceMonthly: 6000,
      perSeatPriceMonthly: 1500,
      trialDays: 7,
      currency: "₦",
      features: {
        contact_card: true,
        custom_fields: true,
        reports: true,
        sequences: true,
        api_access: true,
        sso: false,
        dedicated_support: false,
        max_members: 25,
      },
      position: 2,
    },
    {
      name: "Enterprise",
      basePriceMonthly: 15000,
      perSeatPriceMonthly: 2000,
      trialDays: 7,
      currency: "₦",
      features: {
        contact_card: true,
        custom_fields: true,
        reports: true,
        sequences: true,
        api_access: true,
        sso: true,
        dedicated_support: true,
        max_members: null, // unlimited
      },
      position: 3,
    },
  ];

  for (const plan of defaultPlans) {
    const [existingPlan] = await db
      .select()
      .from(schema.plans)
      .where(eq(schema.plans.name, plan.name))
      .limit(1);

    if (existingPlan) {
      await db
        .update(schema.plans)
        .set({
          basePriceMonthly: plan.basePriceMonthly,
          perSeatPriceMonthly: plan.perSeatPriceMonthly,
          trialDays: plan.trialDays,
          currency: plan.currency,
          features: plan.features,
          position: plan.position,
          active: true,
        })
        .where(eq(schema.plans.id, existingPlan.id));
      console.log(`Updated plan "${plan.name}"`);
    } else {
      await db.insert(schema.plans).values(plan);
      console.log(`Created plan: ${plan.name}`);
    }
  }

  console.log("Done!");
  process.exit(0);
}

seedAdmin().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
