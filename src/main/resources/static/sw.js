/* Service Worker - app shell + runtime caching
   NOTE: keep this file at /sw.js (root) so scope covers the whole app.
*/

const CACHE_VERSION = "v1.5.0";
const APP_SHELL_CACHE = `app-shell-${CACHE_VERSION}`;
const RUNTIME_CACHE = `runtime-${CACHE_VERSION}`;

// Static assets that should load offline
const APP_SHELL_FILES = [
  "/",
  "/index.html",
  "/driver.html",
  "/offline.html",
  "/manifest.webmanifest",
  "/css/styles.css",
  "/js/app.js",
  "/js/driver.js",
  "/js/sw-register.js",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-192-maskable.png",
  "/icons/icon-512-maskable.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(APP_SHELL_CACHE).then((cache) => cache.addAll(APP_SHELL_FILES))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((k) => ![APP_SHELL_CACHE, RUNTIME_CACHE].includes(k))
        .map((k) => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

async function networkFirst(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  try {
    const fresh = await fetch(request);
    if (request.method === "GET" && fresh.ok) {
      cache.put(request, fresh.clone());
    }
    return fresh;
  } catch (err) {
    const cached = await cache.match(request);
    return cached || caches.match("/offline.html");
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request);

  const fetchPromise = fetch(request)
    .then((fresh) => {
      if (request.method === "GET" && fresh.ok) {
        cache.put(request, fresh.clone());
      }
      return fresh;
    })
    .catch(() => null);

  return cached || (await fetchPromise) || caches.match("/offline.html");
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Only handle GET
  if (req.method !== "GET") return;

  // Don’t intercept cross-origin (tiles, OSRM, unpkg) to avoid CORS/cache issues
  if (url.origin !== self.location.origin) return;

  // HTML navigations
  if (req.mode === "navigate") {
    event.respondWith(networkFirst(req));
    return;
  }

  // API endpoints (Spring controllers): keep data fresh when possible
  // Your API routes are at /routes, /stops, /route-stops, etc.
  if (["/routes", "/stops", "/route-stops"].some((p) => url.pathname.startsWith(p))) {
    event.respondWith(networkFirst(req));
    return;
  }

  // Static assets
  event.respondWith(staleWhileRevalidate(req));
});
