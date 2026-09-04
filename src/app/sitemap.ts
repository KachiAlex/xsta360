import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = process.env.APP_URL ?? "https://xsta360.com.ng";
  const now = new Date();

  // Static public pages that should be indexed.
  const staticRoutes = [
    {
      url: `${siteUrl}/`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 1.0,
    },
    {
      url: `${siteUrl}/login`,
      lastModified: now,
      changeFrequency: "yearly" as const,
      priority: 0.3,
    },
    {
      url: `${siteUrl}/signup`,
      lastModified: now,
      changeFrequency: "yearly" as const,
      priority: 0.5,
    },
  ];

  return staticRoutes;
}
