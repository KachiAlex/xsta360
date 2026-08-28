"use client";

import { useState } from "react";

/**
 * Wraps action buttons so they appear as a floating action button on mobile
 * (above the bottom nav) and inline on desktop.
 */
export function MobileFab({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* Inline on desktop */}
      <div className="hidden sm:block">{children}</div>
      {/* FAB on mobile */}
      <div
        className="sm:hidden fixed right-3 z-40"
        style={{ bottom: "calc(env(safe-area-inset-bottom) + 68px)" }}
      >
        {children}
      </div>
    </>
  );
}
