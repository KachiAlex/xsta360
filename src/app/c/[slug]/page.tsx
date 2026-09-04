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
  if (!card) {
    return {
      title: "Card not found",
      description: "This contact card could not be found or is no longer active.",
      robots: { index: false, follow: false },
    };
  }
  const title = `${card.displayName} — ${card.company ?? card.orgName}`;
  const description = card.title
    ? `${card.displayName} is ${card.title} at ${card.company ?? card.orgName}. Save their contact and connect on Xsta360.`
    : `Connect with ${card.displayName} at ${card.company ?? card.orgName}. Save their contact directly to your phone.`;
  const siteUrl = process.env.APP_URL ?? "https://xsta360.com.ng";

  return {
    title,
    description,
    alternates: {
      canonical: `/c/${slug}`,
    },
    openGraph: {
      type: "profile",
      title,
      description,
      url: `${siteUrl}/c/${slug}`,
      siteName: "Xsta360",
      images: card.photoUrl
        ? [{ url: card.photoUrl, width: 400, height: 400, alt: card.displayName }]
        : [{ url: "/icon-512.png", width: 512, height: 512, alt: card.displayName }],
    },
    twitter: {
      card: "summary",
      title,
      description,
      images: card.photoUrl ? [card.photoUrl] : ["/icon-512.png"],
    },
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
