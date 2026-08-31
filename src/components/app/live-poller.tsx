"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";

const POLL_INTERVAL_MS = 30_000;

const REFRESHABLE_PATHS = [
  "/dashboard",
  "/follow-ups",
  "/pipeline",
  "/leads",
  "/tasks",
  "/reports",
];

export function LivePoller() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const shouldRefresh = REFRESHABLE_PATHS.some(
      (p) => pathname === p || pathname.startsWith(`${p}/`),
    );
    if (!shouldRefresh) return;

    const id = setInterval(() => {
      router.refresh();
    }, POLL_INTERVAL_MS);

    return () => clearInterval(id);
  }, [router, pathname]);

  return null;
}
