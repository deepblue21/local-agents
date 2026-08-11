/**
 * Offline shell for the installed console.
 *
 * Only the console's own static files are cached. API traffic — sessions, runs, event
 * streams, anything under /api — is always network-only, so the console never shows a
 * stale view of what the agent is doing and no conversation content lands in a cache.
 */

const CACHE = 'local-agents-shell-v1';
const SHELL = [
  '/app',
  '/assets/console.css',
  '/assets/console.js',
  '/assets/api.js',
  '/assets/i18n.js',
  '/assets/icon-192.png',
  '/assets/icon-512.png',
  '/manifest.webmanifest',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

function isShellRequest(url) {
  return url.origin === self.location.origin
    && (url.pathname === '/app'
      || url.pathname === '/manifest.webmanifest'
      || url.pathname.startsWith('/assets/'));
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (!isShellRequest(url)) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
        }
        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached || Response.error())),
  );
});
