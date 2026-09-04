import type { NextConfig } from "next";

const cspDirectives = [
  "default-src 'self'",
  // Allow inline styles (Tailwind + styled-components patterns) and self stylesheets.
  "style-src 'self' 'unsafe-inline'",
  // Allow images from self, data: URIs (avatars), and HTTPS sources.
  "img-src 'self' data: https:",
  // Fonts from self only.
  "font-src 'self'",
  // Scripts: self + Next.js inline scripts (nonce-managed by Next in prod).
  "script-src 'self' 'unsafe-inline'",
  // Allow Paystack checkout iframe + self.
  "frame-src 'self' https://paystack.com https://standard.paystack.com",
  // Connect to self + Paystack API.
  "connect-src 'self' https://api.paystack.co https://standard.paystack.com",
  // Form actions: self + Paystack.
  "form-action 'self' https://paystack.com",
  // No mixed content, no plugins.
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

const nextConfig: NextConfig = {
  // @xenova/transformers + onnxruntime-node have native dependencies (sharp, etc.)
  // that must not be bundled — load them as external packages at runtime.
  serverExternalPackages: [
    "@xenova/transformers",
    "onnxruntime-node",
    "sharp",
  ],
  async headers() {
    return [
      {
        // Apply to all routes.
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: cspDirectives },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-DNS-Prefetch-Control", value: "on" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          { key: "X-XSS-Protection", value: "1; mode=block" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
