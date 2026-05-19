// FixIt Service Worker v999
// PASSTHROUGH ONLY — no caching of JS/API/assets
// Caching caused stale code to run old broken fetch paths

const CACHE = 'fixit-v999';

self.addEventListener('install', e => {
  // Skip waiting immediately — activate this SW right away
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  // Delete ALL old caches immediately
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// FETCH: complete passthrough — never intercept anything
// This ensures /api/diagnose POST always reaches the real Vercel function
self.addEventListener('fetch', e => {
  // Do nothing — let every request go directly to the network
  return;
});
