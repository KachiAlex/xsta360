import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, schema } from "./index";
import { nanoid } from "nanoid";

async function main() {
  const email = "tunde@kreatix.com";
  const password = "password123";

  // Idempotent: if the demo user exists, reset.
  const [existing] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, email))
    .limit(1);

  if (existing) {
    console.log("Seed user already exists. Skipping (drop the DB to re-seed).");
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const [org] = await db
    .insert(schema.organizations)
    .values({ name: "Kreatix Technologies", formToken: nanoid(24) })
    .returning();

  const [tunde] = await db
    .insert(schema.users)
    .values({ name: "Tunde Bakare", email, passwordHash })
    .returning();

  await db.insert(schema.memberships).values({
    orgId: org.id,
    userId: tunde.id,
    role: "admin",
  });

  // Default stages.
  const stages = await db
    .insert(schema.pipelineStages)
    .values([
      { orgId: org.id, name: "New", kind: "open", position: 0 },
      { orgId: org.id, name: "Contacted", kind: "open", position: 1 },
      { orgId: org.id, name: "Negotiating", kind: "open", position: 2 },
      { orgId: org.id, name: "Won", kind: "won", position: 3 },
      { orgId: org.id, name: "Lost", kind: "lost", position: 4 },
    ])
    .returning();

  await db.insert(schema.lostReasons).values([
    { orgId: org.id, label: "Price too high", position: 0, isDefault: true },
    { orgId: org.id, label: "Went with competitor", position: 1 },
    { orgId: org.id, label: "No response / ghosted", position: 2 },
    { orgId: org.id, label: "Not a fit", position: 3 },
    { orgId: org.id, label: "Budget / timing", position: 4 },
  ]);

  const [newStage, contactedStage, negotiatingStage, wonStage] = stages;

  // Leads matching the mockup.
  const leads = await db
    .insert(schema.leads)
    .values([
      { orgId: org.id, name: "Adaeze Okonkwo", company: "Lagos Freight Co.", email: "adaeze@lagosfreight.com", phone: "+234 802 555 0101", source: "embedded_form", campaign: "Q3 freight push", stageId: negotiatingStage.id, assigneeId: tunde.id, createdById: tunde.id },
      { orgId: org.id, name: "Tunde Bakare", company: "Zenith Retail", email: "tunde@zenithretail.com", phone: "+234 803 555 0102", source: "walk_in", stageId: contactedStage.id, assigneeId: tunde.id, createdById: tunde.id },
      { orgId: org.id, name: "Ngozi Eze", company: "Coastal Traders", email: "ngozi@coastaltraders.com", phone: "+234 805 555 0103", source: "referral", stageId: contactedStage.id, assigneeId: tunde.id, createdById: tunde.id },
      { orgId: org.id, name: "Femi Adeyemi", company: "Bright Homes Ltd.", email: "femi@brighthomes.com", phone: "+234 807 555 0104", source: "ad", campaign: "Instagram Q3", stageId: negotiatingStage.id, assigneeId: tunde.id, createdById: tunde.id },
      { orgId: org.id, name: "Chidinma Obi", company: "Palmgrove Logistics", source: "referral", stageId: newStage.id, assigneeId: tunde.id, createdById: tunde.id },
      { orgId: org.id, name: "Ibrahim Sule", company: "Northgate Motors", source: "ad", stageId: newStage.id, assigneeId: tunde.id, createdById: tunde.id },
      { orgId: org.id, name: "Kemi Ayodele", company: "Ayodele & Sons", source: "embedded_form", stageId: newStage.id, assigneeId: tunde.id, createdById: tunde.id },
      { orgId: org.id, name: "Bola Fashola", company: "Fashola Textiles", source: "referral", stageId: wonStage.id, assigneeId: tunde.id, createdById: tunde.id },
    ])
    .returning();

  const [adaeze, , ngozi, femi] = leads;

  // Remarks matching the mockup.
  const now = new Date();
  const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000);

  await db.insert(schema.remarks).values([
    { leadId: adaeze.id, orgId: org.id, authorId: tunde.id, body: "Interested, comparing against one competitor", createdAt: daysAgo(1) },
    { leadId: ngozi.id, orgId: org.id, authorId: tunde.id, body: "Asked for a revised quote, wants it by Friday", createdAt: daysAgo(6) },
    { leadId: femi.id, orgId: org.id, authorId: tunde.id, body: "Ready to sign, waiting on final terms", createdAt: daysAgo(1) },
  ]);

  // Reminders: overdue (Ngozi), today (Adaeze 2pm, Tunde 4:30pm, Femi 5:15pm).
  const todayAt = (h: number, m: number) => {
    const d = new Date();
    d.setHours(h, m, 0, 0);
    return d;
  };
  const overdue = daysAgo(2);

  await db.insert(schema.reminders).values([
    { leadId: ngozi.id, orgId: org.id, assigneeId: tunde.id, dueAt: overdue, note: "Asked for a revised quote, wants it by Friday", status: "pending" },
    { leadId: adaeze.id, orgId: org.id, assigneeId: tunde.id, dueAt: todayAt(14, 0), note: "Interested, comparing against one competitor", status: "pending" },
    { leadId: leads[1].id, orgId: org.id, assigneeId: tunde.id, dueAt: todayAt(16, 30), note: "Requested pricing for 3 branches", status: "pending" },
    { leadId: femi.id, orgId: org.id, assigneeId: tunde.id, dueAt: todayAt(17, 15), note: "Ready to sign, waiting on final terms", status: "pending" },
  ]);

  console.log("Seed complete!");
  console.log(`  Org: ${org.name}`);
  console.log(`  Login: ${email} / ${password}`);
  console.log(`  ${leads.length} leads across stages`);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
