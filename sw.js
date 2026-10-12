// HubAccounts — minimal offline-capable service worker.
// Caches the app shell so it still opens (and works — all data lives in the
// browser's own storage, not on a server) even with no network connection.
// `activate` below removes caches of older versions. The cache only ever
// holds static files, never vault data.
const CACHE_NAME = 'hubaccounts-cache-v39';
const APP_SHELL = [
  './HubAccounts.html', './index.html', './hubaccounts.css', './manifest.json', './icon-192.png', './icon-512.png',
  // Feature scripts, in the order HubAccounts.html loads them.
  './js/storage.js', './js/i18n.js', './js/core.js', './js/backup-sync.js', './js/auth.js', './js/home-log.js', './js/vault.js', './js/notes.js', './js/export.js', './js/tools.js', './js/status-check.js', './js/import-parse.js', './js/account-modal.js', './js/totp.js', './js/shell.js', './js/app.js'
];
const APP_SHELL_PATHS = new Set(APP_SHELL.map((path) => new URL(path, self.location.href).pathname));

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Network-first for the app file itself (so updates are picked up when
// online), falling back to the cached copy when offline.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || !APP_SHELL_PATHS.has(url.pathname)) return;
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        if (response.ok) caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy)).catch(() => {});
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
