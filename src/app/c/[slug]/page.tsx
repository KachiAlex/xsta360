import { Metadata } from "next";
import { notFound } from "next/navigation";
import { getContactCardBySlug } from "@/lib/contact-cards";
import { CardPublicView } from "@/components/contact-card/card-public-view";

// ISR: public card pages are cached for 60 seconds and regenerated on demand.
export const revalidate = 60;

interface CardPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: CardPageProps): Promise<Metadata> {
  const { slug } = await params;
  const card = await getContactCardBySlug(slug);
  if (!card) return { title: "Card not found — Xsta360" };
  return {
    title: `${card.displayName} — ${card.company ?? card.orgName}`,
    description: `Contact ${card.displayName} at ${card.company ?? card.orgName}`,
  };
}

export default async function CardPage({ params }: CardPageProps) {
  const { slug } = await params;
  const card = await getContactCardBySlug(slug);

  if (!card) {
    notFound();
  }

  return <CardPublicView card={card} />;
}
