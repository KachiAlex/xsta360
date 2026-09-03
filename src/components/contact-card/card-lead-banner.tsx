import Link from "next/link";
import { getMyCardStats } from "@/lib/contact-cards";

interface CardLeadBannerProps {
  userId: string;
  orgId: string;
}

export async function CardLeadBanner({ userId, orgId }: CardLeadBannerProps) {
  const stats = await getMyCardStats(userId, orgId);
  if (!stats) return null;

  const hasActivity = stats.viewCount > 0 || stats.leadCount > 0;
  if (!hasActivity) return null;

  return (
    <div className="mb-4 sm:mb-7 rounded border border-rule bg-paper px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div>
        <p className="text-sm font-medium text-ink">
          Your contact card is performing today
        </p>
        <p className="text-xs text-ink-soft">
          {stats.viewCount} view{stats.viewCount === 1 ? "" : "s"} · {stats.leadCount} lead{stats.leadCount === 1 ? "" : "s"} · {Math.round((stats.leadCount / Math.max(stats.viewCount, 1)) * 100)}% conversion
        </p>
      </div>
      <Link
        href="/contact-card"
        className="text-sm font-semibold text-ink hover:underline shrink-0"
      >
        Manage card →
      </Link>
    </div>
  );
}
