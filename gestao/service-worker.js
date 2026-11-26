const CACHE_NAME = 'tinhas-gestao-v1.2.1';
const APP_FILES = [
  './','./index.html','./style.css','./config.js','./app.js','./manifest.json',
  './assets/logo-tinhas.png','./assets/icone-tinhas.png','./assets/casal-login.png',
  './assets/fernando-home.png','./assets/leticia-home.png','./assets/icon-192.png',
  './assets/icon-512.png','./assets/splash-tinhas.webp','./assets/logo-login-tinhas.png'
];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('tinhas-gestao-') && key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.includes('/exec')) return;
  event.respondWith(fetch(request).then(response => {
    if (response && response.ok) { const clone = response.clone(); caches.open(CACHE_NAME).then(cache => cache.put(request, clone)); }
    return response;
  }).catch(() => caches.match(request).then(cached => cached || caches.match('./index.html'))));
});
