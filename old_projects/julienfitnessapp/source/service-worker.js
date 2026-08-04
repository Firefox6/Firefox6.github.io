const CACHE = "fittrack-v4";
const BASE_URL = new URL("./", self.registration.scope);
const ASSETS = ["", "index.html", "styles.css", "src/app.js", "src/data/demo-data.js", "src/scores/score-config.js", "src/scores/calculate.js", "src/bridge/shell-adapter.js", "src/health/health-adapter.js", "src/health/normalization.js", "src/storage/derived-cache.js"]
  .map((path) => new URL(path, BASE_URL).toString());

self.addEventListener("install", (event) => event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())));
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  // New web bundles are fetched as soon as they are available; the cache is the
  // offline fallback, not a blocker for normal web-app updates.
  event.respondWith(fetch(event.request).then((response) => {
    const copy = response.clone();
    caches.open(CACHE).then((cache) => cache.put(event.request, copy));
    return response;
  }).catch(() => caches.match(event.request).then((cached) => cached || caches.match(new URL("index.html", BASE_URL).toString()))));
});
