const CACHE_NAME = 'tuprendario-v2';
const CACHE_ASSETS = [
	'/',
	'/index.html',
	'/styles.css',
	'/main.js',
	'/manifest.json',
	'/Imagenes/logoTuPrendario.png',
	'/Imagenes/logoTuPrendario.svg',
	'/Imagenes/icon-192.png',
	'/Imagenes/icon-512.png'
];

self.addEventListener('install', e => {
	e.waitUntil(
		caches.open(CACHE_NAME).then(cache => cache.addAll(CACHE_ASSETS))
	);
	self.skipWaiting();
});

self.addEventListener('activate', e => {
	e.waitUntil(
		caches.keys().then(keys =>
			Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
		)
	);
	self.clients.claim();
});

self.addEventListener('fetch', e => {
	if (e.request.method !== 'GET') return;
	e.respondWith(
		caches.match(e.request).then(cached => {
			if (cached) return cached;
			return fetch(e.request).then(res => {
				if (!res || res.status !== 200 || res.type === 'opaque') return res;
				const resClone = res.clone();
				caches.open(CACHE_NAME).then(cache => cache.put(e.request, resClone));
				return res;
			}).catch(() => caches.match('/index.html'));
		})
	);
});
