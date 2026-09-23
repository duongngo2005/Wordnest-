const CACHE_NAME = "wordnest-cache-v3";
const STATIC_ASSETS = [
  "/",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/apple-touch-icon.png",
  "/icons/icon.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const staleCacheNames = (await caches.keys()).filter(
        (key) => key.startsWith("wordnest-cache-") && key !== CACHE_NAME
      );

      await Promise.all(staleCacheNames.map((key) => caches.delete(key)));
      await self.clients.claim();

      // v1 cached non-hashed Next dev chunks. Refresh only clients migrated
      // from that stale cache so they receive the current interactive bundle.
      if (staleCacheNames.length > 0) {
        const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
        await Promise.all(clients.map((client) => client.navigate(client.url)));
      }
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET requests and API calls from caching (always network)
  if (event.request.method !== "GET" || url.pathname.startsWith("/api/")) {
    return;
  }

  // Stale-while-revalidate for static assets, network-first for pages
  if (
    url.pathname.startsWith("/icons/") ||
    url.pathname.endsWith(".svg") ||
    url.pathname.endsWith(".png")
  ) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        const fetchPromise = fetch(event.request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              const responseClone = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(event.request, responseClone);
              });
            }
            return networkResponse;
          })
          .catch(() => cached);
        return cached || fetchPromise;
      })
    );
    return;
  }

  // Network-first for dynamic navigation pages
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response && response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        return caches.match(event.request).then((cached) => {
          if (cached) return cached;
          return caches.match("/");
        });
      })
  );
});
