import { AppShell } from "@/components/app/app-shell";

export default function BillingLayout({ children }: { children: React.ReactNode }) {
  return <AppShell enforceSubscription={false}>{children}</AppShell>;
}
