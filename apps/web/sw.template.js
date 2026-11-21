const CACHE = 'kanithanj-__VERSION__';
const PRECACHE = __PRECACHE__;
const refreshable = (path) => path === '/pool.json' || /^\/pool-\d+\.json$/.test(path);

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  const key = event.request.mode === 'navigate' ? '/' : url.pathname;
  if (refreshable(key)) {
    event.respondWith(
      fetch(event.request).then(res => {
        if (res.ok && res.type === 'basic') { const copy = res.clone(); caches.open(CACHE).then(c => c.put(key, copy)); }
        return res;
      }).catch(() => caches.match(key).then(hit => hit ?? Promise.reject(new TypeError('network')))),
    );
    return;
  }
  event.respondWith(
    caches.match(key).then(hit => hit ?? fetch(event.request).then(res => {
      if (res.ok && res.type === 'basic') { const copy = res.clone(); caches.open(CACHE).then(c => c.put(key, copy)); }
      return res;
    })),
  );
});
