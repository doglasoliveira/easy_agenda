/* Easy Agenda — service worker
 * - Guarda os ficheiros da app para abrir rápido e mesmo sem internet.
 * - Páginas: tenta a rede primeiro (para receber logo as atualizações) e usa a cópia guardada se estiver offline.
 * - Pedidos ao Apps Script (marcações, horários, painel) NUNCA são guardados: vão sempre à rede.
 * Ao alterar ficheiros, muda a VERSION para forçar a atualização nos telemóveis.
 */
const VERSION = 'easy-agenda-v1';
const SHELL = [
  './', './index.html', './admin.html', './pwa.js', './manifest.webmanifest', './admin.webmanifest',
  './icons/app.svg', './icons/app-192.png', './icons/app-512.png', './icons/app-apple-180.png', './icons/app-32.png',
  './icons/admin.svg', './icons/admin-192.png', './icons/admin-512.png', './icons/admin-apple-180.png', './icons/admin-32.png',
];
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Tipo de letra: guarda na primeira vez e reutiliza
  if (FONT_HOSTS.includes(url.hostname)) {
    e.respondWith(caches.open(VERSION).then(async c => {
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok || res.type === 'opaque') c.put(req, res.clone());
      return res;
    }));
    return;
  }

  // Só ficheiros do próprio site; tudo o resto (Apps Script, Google) segue direto para a rede
  if (url.origin !== location.origin) return;

  if (req.mode === 'navigate' || req.destination === 'document') {
    e.respondWith(fetch(req)
      .then(res => { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); return res; })
      .catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match('./index.html'))));
    return;
  }

  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
    return res;
  })));
});
