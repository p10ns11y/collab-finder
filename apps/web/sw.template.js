const CACHE = 'kanithanj-v2-__VERSION__';
const PRECACHE = __PRECACHE__;
const cleanPath = (path) => {
  const bare = path.replace(/\/index\.html$/, '/').replace(/\.html$/, '');
  return bare.length > 1 ? bare.replace(/\/+$/, '') : '/';
};
const pageKey = (path) => {
  const clean = cleanPath(path);
  return PRECACHE.includes(clean) ? clean : '/';
};
const refreshable = (path) => path === '/pool.json' || /^\/pool-\d+\.json$/.test(path);
const storable = (res) => res.ok && res.type === 'basic';
const settled = async (res) => (res.redirected ? new Response(await res.blob(), { status: res.status, statusText: res.statusText, headers: res.headers }) : res);
const store = (key, res) => {
  if (!storable(res)) return;
  const copy = res.clone();
  settled(copy).then(clean => caches.open(CACHE).then(c => c.put(key, clean))).catch(() => undefined);
};

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => Promise.all(PRECACHE.map(path => fetch(path, { cache: 'reload' }).then(async res => {
        if (!storable(res)) throw new TypeError(`precache ${path}: ${res.status}`);
        await cache.put(path, await settled(res));
      }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  const key = event.request.mode === 'navigate' ? pageKey(url.pathname) : url.pathname;
  if (refreshable(key)) {
    event.respondWith(
      fetch(event.request).then(res => {
        if (storable(res)) caches.open(CACHE).then(c => settled(res.clone()).then(clean => c.put(key, clean)));
        return res;
      }).catch(() => caches.match(key).then(hit => hit ?? Promise.reject(new TypeError('network')))),
    );
    return;
  }
  event.respondWith(
    caches.match(key).then(hit => hit ?? fetch(event.request).then(res => {
      store(key, res);
      return settled(res);
    })),
  );
});
