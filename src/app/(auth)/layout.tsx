import type { Metadata } from "next";

export const metadata: Metadata = {
  title: {
    default: "Sign in",
    template: "%s",
  },
  description: "Sign in to your Xsta360 workspace.",
  robots: {
    index: false,
    follow: false,
  },
  alternates: {
    canonical: "/login",
  },
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return children;
}
