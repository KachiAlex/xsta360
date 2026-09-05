import type { Metadata, Viewport } from "next";
import { Inter, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const siteUrl = process.env.APP_URL ?? "https://xsta360.com.ng";
const siteName = "Xsta360";
const siteDescription =
  "Xsta360 is a sales management hub for teams that close. Capture leads, log remarks, set follow-up reminders, track your pipeline, and never let a deal go cold again.";
const siteImage = `${siteUrl}/og.png`;

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Xsta360 — Manage. Follow Up. Close.",
    template: "%s · Xsta360",
  },
  description: siteDescription,
  keywords: [
    "sales management",
    "lead management",
    "CRM",
    "follow-up reminders",
    "pipeline tracking",
    "sales pipeline",
    "contact management",
    "Nigeria CRM",
    "small business sales",
    "lead tracking",
    "sales automation",
  ],
  authors: [{ name: "Kreatix Technologies", url: "https://kreatix.tech" }],
  creator: "Kreatix Technologies",
  publisher: "Kreatix Technologies",
  applicationName: "Xsta360",
  category: "Business",
  manifest: "/manifest.json",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: siteUrl,
    siteName,
    title: "Xsta360 — Manage. Follow Up. Close.",
    description: siteDescription,
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "Xsta360 — Manage. Follow Up. Close.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Xsta360 — Manage. Follow Up. Close.",
    description: siteDescription,
    images: ["/og.png"],
    creator: "@kreatixtech",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
    shortcut: ["/favicon.ico"],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Xsta360",
    startupImage: ["/icon-512.png"],
  },
  formatDetection: {
    telephone: true,
    address: false,
    email: true,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f3f0e6" },
    { media: "(prefers-color-scheme: dark)", color: "#1e2a22" },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
