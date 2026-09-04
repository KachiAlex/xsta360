import type { Metadata } from "next";
import { Logo } from "@/components/app/logo";
import { Footer } from "@/components/app/footer";

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
  return (
    <div className="min-h-screen flex flex-col">
      <header className="px-4 sm:px-12 py-4 sm:py-5 border-b border-rule">
        <Logo size="md" />
      </header>
      <main className="flex-1 flex items-center justify-center px-3 sm:px-6 py-6 sm:py-12">{children}</main>
      <Footer />
    </div>
  );
}
