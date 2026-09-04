import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const siteUrl = process.env.APP_URL ?? "https://xsta360.com.ng";
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/dashboard",
          "/leads",
          "/pipeline",
          "/reports",
          "/settings",
          "/team",
          "/tasks",
          "/sequences",
          "/follow-ups",
          "/billing",
          "/contact-card",
          "/admin",
          "/api/",
          "/join/",
        ],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}
