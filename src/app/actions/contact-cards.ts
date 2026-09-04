"use server";

import { revalidatePath, updateTag } from "next/cache";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { toString as qrToString } from "qrcode";
import { db, schema } from "@/db";
import { verifySession, type AuthContext } from "@/lib/dal";
import { getContactCardStats } from "@/lib/contact-cards";

const ManageCardSchema = z.object({
  id: z.string().uuid().optional().or(z.literal("")),
  displayName: z.string().min(1, "Display name is required").trim(),
  title: z.string().trim().nullish().or(z.literal("")),
  role: z.string().trim().nullish().or(z.literal("")),
  company: z.string().trim().nullish().or(z.literal("")),
  website: z.string().url("Enter a valid URL").trim().nullish().or(z.literal("")),
  phone: z.string().trim().nullish().or(z.literal("")),
  whatsapp: z.string().trim().nullish().or(z.literal("")),
  email: z.string().email("Enter a valid email").trim().nullish().or(z.literal("")),
  // Only allow https: URLs or data: URIs (for inline uploaded images).
  // Prevents SSRF via arbitrary http:// or file:// URLs.
  photoUrl: z
    .string()
    .trim()
    .nullish()
    .or(z.literal(""))
    .refine(
      (val) => !val || val.startsWith("https://") || val.startsWith("data:image/"),
      "Photo URL must be https: or a data: image URI",
    ),
  socialLinks: z.string().trim().optional().or(z.literal("")),
});

export type ContactCardFormState = {
  errors?: Record<string, string[]>;
  message?: string;
  ok?: boolean;
};

export async function getMyContactCard(): Promise<{
  id?: string;
  slug?: string;
  displayName: string;
  title: string | null;
  role: string | null;
  company: string | null;
  website: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  photoUrl: string | null;
  socialLinks: Record<string, string>;
  qrCodeSvg: string | null;
  cardUrl: string;
  viewCount: number;
  leadCount: number;
} | null> {
  const ctx = await verifySession();
  if (!ctx) return null;

  const [card] = await db
    .select()
    .from(schema.contactCards)
    .where(
      and(
        eq(schema.contactCards.userId, ctx.userId),
        eq(schema.contactCards.orgId, ctx.orgId),
      ),
    )
    .limit(1);

  const [user] = await db
    .select({ email: schema.users.email, name: schema.users.name })
    .from(schema.users)
    .where(eq(schema.users.id, ctx.userId))
    .limit(1);

  const [org] = await db
    .select({ name: schema.organizations.name })
    .from(schema.organizations)
    .where(eq(schema.organizations.id, ctx.orgId))
    .limit(1);

  const appUrl = getAppUrl();

  if (!card) {
    return {
      displayName: user?.name ?? "",
      title: null,
      role: null,
      company: org?.name ?? null,
      website: null,
      phone: null,
      whatsapp: null,
      email: user?.email ?? null,
      photoUrl: null,
      socialLinks: {},
      qrCodeSvg: null,
      cardUrl: "",
      viewCount: 0,
      leadCount: 0,
    };
  }

  const stats = await getContactCardStats(card.id);

  return {
    id: card.id,
    slug: card.slug,
    displayName: card.displayName,
    title: card.title,
    role: card.role,
    company: card.company,
    website: card.website,
    phone: card.phone,
    whatsapp: card.whatsapp,
    email: card.email,
    photoUrl: card.photoUrl,
    socialLinks: (card.socialLinks as Record<string, string>) ?? {},
    qrCodeSvg: card.qrCodeSvg,
    cardUrl: `${appUrl}/c/${card.slug}`,
    viewCount: stats.viewCount,
    leadCount: stats.leadCount,
  };
}

export async function createOrUpdateContactCard(
  _prev: ContactCardFormState,
  formData: FormData,
): Promise<ContactCardFormState> {
  const ctx = await verifySession();
  if (!ctx) return { message: "Not signed in" };

  const raw = {
    id: formData.get("id"),
    displayName: formData.get("displayName"),
    title: formData.get("title"),
    role: formData.get("role"),
    company: formData.get("company"),
    website: formData.get("website"),
    phone: formData.get("phone"),
    whatsapp: formData.get("whatsapp"),
    email: formData.get("email"),
    photoUrl: formData.get("photoUrl"),
    socialLinks: formData.get("socialLinks"),
  };

  const parsed = ManageCardSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      errors: parsed.error.issues.reduce<Record<string, string[]>>((acc, i) => {
        const key = i.path[0]?.toString() ?? "_";
        (acc[key] ??= []).push(i.message);
        return acc;
      }, {}),
    };
  }

  const { id, socialLinks: socialRaw, ...rest } = parsed.data;

  let socialLinks: Record<string, string> = {};
  if (socialRaw) {
    try {
      const parsed = JSON.parse(socialRaw);
      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
        socialLinks = Object.fromEntries(
          Object.entries(parsed).filter(([_, v]) => typeof v === "string" && v.trim()) as [string, string][],
        );
      }
    } catch {
      // ignore invalid JSON
    }
  }

  const appUrl = getAppUrl();

  if (id) {
    // Update existing card. Slug stays stable.
    const [existing] = await db
      .select({ id: schema.contactCards.id, slug: schema.contactCards.slug })
      .from(schema.contactCards)
      .where(
        and(
          eq(schema.contactCards.id, id),
          eq(schema.contactCards.orgId, ctx.orgId),
          eq(schema.contactCards.userId, ctx.userId),
        ),
      )
      .limit(1);

    if (!existing) return { message: "Card not found" };

    const cardUrl = `${appUrl}/c/${existing.slug}`;
    const qrCodeSvg = await qrToString(cardUrl, {
      type: "svg",
      margin: 2,
      color: { dark: "#1e2a22", light: "#ffffff" },
    });

    await db
      .update(schema.contactCards)
      .set({
        ...rest,
        photoUrl: rest.photoUrl || null,
        email: rest.email || null,
        company: rest.company || null,
        title: rest.title || null,
        role: rest.role || null,
        website: rest.website || null,
        phone: rest.phone || null,
        whatsapp: rest.whatsapp || null,
        socialLinks,
        qrCodeSvg,
        updatedAt: new Date(),
      })
      .where(eq(schema.contactCards.id, existing.id));

    revalidatePath("/contact-card");
    revalidatePath(`/c/${existing.slug}`);
    updateTag("contact-card");
    return { ok: true };
  }

  // Create new card.
  const slug = await generateUniqueSlug(rest.displayName);
  const cardUrl = `${appUrl}/c/${slug}`;
  const qrCodeSvg = await qrToString(cardUrl, {
    type: "svg",
    margin: 2,
    color: { dark: "#1e2a22", light: "#ffffff" },
  });

  await db.insert(schema.contactCards).values({
    orgId: ctx.orgId,
    userId: ctx.userId,
    slug,
    displayName: rest.displayName,
    title: rest.title || null,
    role: rest.role || null,
    company: rest.company || null,
    website: rest.website || null,
    phone: rest.phone || null,
    whatsapp: rest.whatsapp || null,
    email: rest.email || null,
    photoUrl: rest.photoUrl || null,
    socialLinks,
    qrCodeSvg,
  });

  revalidatePath("/contact-card");
  revalidatePath(`/c/${slug}`);
  updateTag("contact-card");
  return { ok: true };
}

async function generateUniqueSlug(name: string): Promise<string> {
  const base = slugify(name) || "card";
  for (let i = 0; i < 10; i++) {
    const suffix = i === 0 ? "" : `-${Math.random().toString(36).slice(2, 6)}`;
    const slug = `${base}${suffix}`;
    const [existing] = await db
      .select({ id: schema.contactCards.id })
      .from(schema.contactCards)
      .where(eq(schema.contactCards.slug, slug))
      .limit(1);
    if (!existing) return slug;
  }
  throw new Error("Could not generate a unique card slug");
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function getAppUrl(): string {
  return process.env.APP_URL?.replace(/\/$/, "") ?? "https://xsta360.com.ng";
}
