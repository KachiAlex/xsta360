"use client";

import { useEffect, useState, useCallback } from "react";

/**
 * Registers the service worker for offline caching and shows an
 * offline indicator banner when the device loses connectivity.
 *
 * On Capacitor (mobile), uses @capacitor/network for native status.
 * On web, falls back to browser online/offline events.
 */
export function OfflineProvider({ children }: { children: React.ReactNode }) {
  const [isOnline, setIsOnline] = useState(true);
  const [pendingSyncs, setPendingSyncs] = useState(0);

  // Register service worker on mount
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .then(() => {
          // SW registered — check for pending writes
          checkPendingWrites();
        })
        .catch((err) => {
          console.error("SW registration failed:", err);
        });

      // Listen for queue replayed messages from SW
      navigator.serviceWorker.addEventListener("message", (event) => {
        if (event.data?.type === "QUEUE_REPLAYED") {
          setPendingSyncs(0);
        }
      });
    }
  }, []);

  // Network status detection
  useEffect(() => {
    let networkPlugin: any = null;
    let cleanup: (() => void) | null = null;

    // Try Capacitor Network plugin first (mobile)
    import("@capacitor/network")
      .then(({ Network }) => {
        networkPlugin = Network;

        Network.getStatus().then((status) => {
          setIsOnline(status.connected);
        });

        Network.addListener("networkStatusChange", (status) => {
          setIsOnline(status.connected);
          if (status.connected) {
            // Trigger write queue replay
            if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
              navigator.serviceWorker.controller.postMessage({ type: "REPLAY_QUEUE" });
            }
          }
        });
      })
      .catch(() => {
        // Not on Capacitor (web) — use browser events
        setIsOnline(navigator.onLine);

        const handleOnline = () => {
          setIsOnline(true);
          if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
            navigator.serviceWorker.controller.postMessage({ type: "REPLAY_QUEUE" });
          }
        };
        const handleOffline = () => setIsOnline(false);

        window.addEventListener("online", handleOnline);
        window.addEventListener("offline", handleOffline);

        cleanup = () => {
          window.removeEventListener("online", handleOnline);
          window.removeEventListener("offline", handleOffline);
        };
      });

    return () => {
      cleanup?.();
      if (networkPlugin) {
        networkPlugin.removeAllListeners?.("networkStatusChange").catch(() => {});
      }
    };
  }, []);

  // Check pending writes in IndexedDB
  const checkPendingWrites = useCallback(async () => {
    try {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open("xsta360-offline", 1);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      const tx = db.transaction("write-queue", "readonly");
      const count = await new Promise<number>((resolve, reject) => {
        const req = tx.objectStore("write-queue").count();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      setPendingSyncs(count);
      db.close();
    } catch {
      // DB doesn't exist yet — no pending writes
    }
  }, []);

  // Show offline banner when offline
  if (!isOnline) {
    return (
      <>
        <div
          style={{
            position: "sticky",
            top: 0,
            zIndex: 9999,
            background: "#d98a2b",
            color: "#1e2a22",
            fontSize: "13px",
            fontWeight: 600,
            padding: "8px 16px",
            textAlign: "center",
            fontFamily: "monospace",
          }}
        >
          You're offline — changes will sync when connected
          {pendingSyncs > 0 && ` · ${pendingSyncs} pending`}
        </div>
        {children}
      </>
    );
  }

  // Show sync indicator when back online with pending writes
  if (pendingSyncs > 0) {
    return (
      <>
        <div
          style={{
            position: "sticky",
            top: 0,
            zIndex: 9999,
            background: "#3b82f6",
            color: "white",
            fontSize: "13px",
            fontWeight: 600,
            padding: "8px 16px",
            textAlign: "center",
            fontFamily: "monospace",
          }}
        >
          Syncing {pendingSyncs} change{pendingSyncs !== 1 && "s"}…
        </div>
        {children}
      </>
    );
  }

  return <>{children}</>;
}
