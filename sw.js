// ======================================================================
// sw.js — lets SpaceKeeper open without an internet connection
// ======================================================================
// Keeps a copy of SpaceKeeper's own files (nothing else) and serves them
// when you're offline. Online, it fetches fresh copies first, so updates
// arrive the next time you open SpaceKeeper. Bump VERSION on each release.
// ======================================================================

const VERSION = "spacekeeper-1.0.0";
const FILES = [
  "./", "index.html", "styles.css", "manifest.webmanifest",
  "js/app.js", "js/desks.js", "js/store.js", "js/colors.js", "js/text.js",
  "icons/icon-192.png", "icons/icon-512.png", "icons/maskable-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Network first (so you get updates), falling back to the saved copy.
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin) return;
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(VERSION).then((cache) => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(() => caches.match(event.request, { ignoreSearch: true })),
  );
});
