/**
 * service-worker.js — Fussball Tracker
 * App-Shell-Caching: die App startet offline. Inhalte kommen entweder aus
 * dem mitgelieferten data.js oder aus einem importierten Datensatz in
 * localStorage (siehe store.js) — beides braucht kein Netzwerk.
 *
 * Bump CACHE_VERSION, wenn Dateien geändert werden, damit Clients das
 * Update laden.
 */

const CACHE_VERSION = "fussball-tracker-v4";
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/style.css",
  "./js/app.js",
  "./js/store.js",
  "./js/data.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/favicon-64.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

// Cache-first für die App-Shell, mit Netzwerk-Fallback; erfolgreiche
// Netzwerk-Antworten werden nachträglich im Cache abgelegt (stale-while-
// revalidate für same-origin GETs).
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // keine Cross-Origin-Requests abfangen

  event.respondWith(
    caches.match(req).then((cached) => {
      const networkFetch = fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => cached || caches.match("./index.html"));

      return cached || networkFetch;
    })
  );
});
