/**
 * Xsta360 Service Worker — offline-first caching strategy
 *
 * Strategies:
 * - Navigation (HTML pages): network-first → cache → offline fallback
 * - Static assets (_next/*, fonts, images): cache-first → network
 * - API GET: stale-while-revalidate (serve cache, update in background)
 * - API POST/Server Actions: network-first, queue if offline
 *
 * Write queue: offline mutations stored in IndexedDB, replayed on reconnect
 * via Background Sync API or the `online` event.
 */

const CACHE_VERSION = "xsta360-v1";
const OFFLINE_URL = "/offline.html";
const WRITE_QUEUE_DB = "xsta360-offline";
const WRITE_QUEUE_STORE = "write-queue";

// ---------------------------------------------------------------------------
// Install: pre-cache the app shell
// ---------------------------------------------------------------------------
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) =>
      cache.addAll([
        "/offline.html",
        "/manifest.json",
        "/icon-192.png",
        "/icon-512.png",
        "/favicon.ico",
      ]).catch(() => {
        // If any pre-cache fails, the SW still installs.
        // Assets will be cached on-demand as the user navigates.
      }),
    ),
  );
  self.skipWaiting();
});

// ---------------------------------------------------------------------------
// Activate: clean up old caches
// ---------------------------------------------------------------------------
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_VERSION)
          .map((key) => caches.delete(key)),
      ),
    ),
  );
  self.clients.claim();
});

// ---------------------------------------------------------------------------
// Fetch: route requests through the appropriate caching strategy
// ---------------------------------------------------------------------------
self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only handle GET and write methods (POST/PUT/DELETE).
  if (request.method !== "GET" && !isWriteMethod(request.method)) {
    return;
  }

  const url = new URL(request.url);

  // Don't intercept cross-origin requests (Paystack, Brevo, etc.)
  if (url.origin !== self.location.origin) {
    return;
  }

  // Don't intercept the transcribe endpoint (needs real-time processing)
  if (url.pathname === "/api/transcribe") {
    return;
  }

  // Don't interfere with Next.js HMR in development
  if (url.pathname.startsWith("/_next/webpack-hmr")) {
    return;
  }

  // Route the request
  if (request.method === "GET") {
    if (isNavigationRequest(request)) {
      event.respondWith(handleNavigation(request));
    } else if (isStaticAsset(url)) {
      event.respondWith(handleStaticAsset(request));
    } else if (isApiGet(url)) {
      event.respondWith(handleApiGet(request));
    }
  } else if (isWriteMethod(request.method)) {
    event.respondWith(handleWrite(request));
  }
});

// ---------------------------------------------------------------------------
// Background Sync: replay queued writes when connection is restored
// ---------------------------------------------------------------------------
self.addEventListener("sync", (event) => {
  if (event.tag === "xsta360-write-queue") {
    event.waitUntil(replayWriteQueue());
  }
});

// Also replay on `message` from the client (fallback for no Background Sync)
self.addEventListener("message", (event) => {
  if (event.data?.type === "REPLAY_QUEUE") {
    event.waitUntil(replayWriteQueue());
  }
});

// ---------------------------------------------------------------------------
// Caching strategies
// ---------------------------------------------------------------------------

/** Navigation requests: network-first, fall back to cache, then offline page. */
async function handleNavigation(request) {
  const cache = await caches.open(CACHE_VERSION);
  try {
    const response = await fetch(request);
    // Cache successful navigation responses (200, 307 redirects handled by browser)
    if (response.ok || response.type === "opaqueredirect") {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // Network failed — try cache
    const cached = await cache.match(request);
    if (cached) return cached;

    // Fall back to any cached page (e.g. dashboard when requesting /leads)
    const keys = await cache.keys();
    for (const key of keys) {
      if (key.method === "GET" && new URL(key.url).pathname.startsWith("/")) {
        const page = await cache.match(key);
        if (page && page.headers.get("content-type")?.includes("text/html")) {
          return page;
        }
      }
    }

    // Last resort: offline page
    return cache.match(OFFLINE_URL);
  }
}

/** Static assets: cache-first, fall back to network. */
async function handleStaticAsset(request) {
  const cache = await caches.open(CACHE_VERSION);
  const cached = await cache.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // Return a transparent 1x1 image for failed image requests
    if (request.destination === "image") {
      const transparentPixel = Uint8Array.from(
        atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="),
        (c) => c.charCodeAt(0),
      );
      return new Response(transparentPixel, {
        headers: { "Content-Type": "image/png" },
      });
    }
    return new Response("", { status: 504 });
  }
}

/** API GET: stale-while-revalidate. Serve cache immediately, update in background. */
async function handleApiGet(request) {
  const cache = await caches.open(CACHE_VERSION);
  const cached = await cache.match(request);

  const networkFetch = fetch(request)
    .then((response) => {
      if (response.ok) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => cached);

  // Return cached response immediately if available, otherwise wait for network
  return cached || networkFetch;
}

/** Write requests (POST/PUT/DELETE/Server Actions): try network, queue if offline. */
async function handleWrite(request) {
  try {
    return await fetch(request);
  } catch {
    // Network failed — queue the request for later replay
    await queueWrite(request);

    // Return a synthetic response so the client doesn't see a network error
    return new Response(
      JSON.stringify({
        ok: false,
        offline: true,
        message: "Saved offline — will sync when connected.",
      }),
      {
        status: 202,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}

// ---------------------------------------------------------------------------
// Write queue (IndexedDB)
// ---------------------------------------------------------------------------

async function queueWrite(request) {
  const body = await request.clone().text();
  const entry = {
    url: request.url,
    method: request.method,
    headers: Object.fromEntries(request.headers.entries()),
    body: body || null,
    timestamp: Date.now(),
    retries: 0,
  };

  const db = await openQueueDB();
  await db.transaction(WRITE_QUEUE_STORE, "readwrite").objectStore(WRITE_QUEUE_STORE).add(entry);
  await self.registration.sync.register("xsta360-write-queue").catch(() => {
    // Background Sync not supported — clients will trigger replay on `online`
  });
}

async function replayWriteQueue() {
  const db = await openQueueDB();
  const store = db.transaction(WRITE_QUEUE_STORE, "readwrite").objectStore(WRITE_QUEUE_STORE);
  const allEntries = await store.getAll();

  const sorted = allEntries.sort((a, b) => a.timestamp - b.timestamp);

  for (const entry of sorted) {
    try {
      const response = await fetch(entry.url, {
        method: entry.method,
        headers: entry.headers,
        body: entry.body,
      });

      if (response.ok) {
        await store.delete(entry.id);
      } else if (response.status >= 400 && response.status < 500) {
        // Client error — don't retry (bad request, unauthorized, etc.)
        await store.delete(entry.id);
      } else {
        // Server error — keep in queue, increment retries
        entry.retries = (entry.retries || 0) + 1;
        if (entry.retries > 10) {
          await store.delete(entry.id);
        } else {
          await store.put(entry);
        }
      }
    } catch {
      // Network still down — keep in queue
      entry.retries = (entry.retries || 0) + 1;
      await store.put(entry);
      break; // Stop replaying if network is still down
    }
  }

  // Notify clients that the queue has been processed
  const clients = await self.clients.matchAll();
  for (const client of clients) {
    client.postMessage({ type: "QUEUE_REPLAYED" });
  }
}

function openQueueDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(WRITE_QUEUE_DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(WRITE_QUEUE_STORE)) {
        db.createObjectStore(WRITE_QUEUE_STORE, { keyPath: "id", autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isNavigationRequest(request) {
  return (
    request.mode === "navigate" ||
    (request.headers.get("accept") || "").includes("text/html")
  );
}

function isStaticAsset(url) {
  return (
    url.pathname.startsWith("/_next/") ||
    url.pathname.startsWith("/icon") ||
    url.pathname.startsWith("/favicon") ||
    url.pathname.match(/\.(css|js|woff2?|ttf|png|jpg|jpeg|gif|svg|ico|webp)$/)
  );
}

function isApiGet(url) {
  return url.pathname.startsWith("/api/") || url.pathname.startsWith("/trpc/");
}

function isWriteMethod(method) {
  return ["POST", "PUT", "PATCH", "DELETE"].includes(method);
}
