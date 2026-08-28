/**
 * Seed superadmin account + default plans.
 * Run with: npx tsx src/db/seed-admin.ts
 *
 * This creates:
 * 1. A superadmin user (or promotes an existing one by email)
 * 2. Three default plans: Starter, Pro, Enterprise
 */
import { db, schema } from "@/db";
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

  // Seed default plans
  console.log("Seeding default plans...");

  const defaultPlans = [
    {
      name: "Starter",
      priceMonthly: 5000,
      priceYearly: 50000,
      maxUsers: 3,
      maxLeads: 500,
      features: { sequences: false, custom_fields: true, api_access: false },
      position: 0,
    },
    {
      name: "Pro",
      priceMonthly: 15000,
      priceYearly: 150000,
      maxUsers: 10,
      maxLeads: 5000,
      features: { sequences: true, custom_fields: true, api_access: true, reports: true },
      position: 1,
    },
    {
      name: "Enterprise",
      priceMonthly: 50000,
      priceYearly: 500000,
      maxUsers: -1,
      maxLeads: -1,
      features: { sequences: true, custom_fields: true, api_access: true, reports: true, sso: true, dedicated_support: true },
      position: 2,
    },
  ];

  for (const plan of defaultPlans) {
    const [existingPlan] = await db
      .select()
      .from(schema.plans)
      .where(eq(schema.plans.name, plan.name))
      .limit(1);

    if (existingPlan) {
      console.log(`Plan "${plan.name}" already exists — skipping`);
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
