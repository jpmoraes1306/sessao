/* Service worker do Sessão.
   - Arquivos do app: rede primeiro, cache como reserva (abre sem internet e nunca fica preso em versão velha).
   - Imagens do TMDB e fontes: cache primeiro.
   - APIs (TMDB, OMDb): passam direto; o cache delas é feito pelo próprio app (IndexedDB). */
const VERSAO = 'v16';
const CACHE_APP = `sessao-app-${VERSAO}`;
const CACHE_IMG = 'sessao-img-v1';
const CACHE_FONTE = 'sessao-fonte-v1';
const MAX_IMG = 700;

const CASCA = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'js/app.js', 'js/config.js', 'js/cache.js', 'js/tmdb.js', 'js/omdb.js', 'js/dados.js', 'js/ui.js', 'js/wikidata.js', 'js/ovo.js', 'js/nuvem.js', 'js/supabase-config.js', 'js/letterboxd.js', 'js/importar.js', 'js/telas/importar.js', 'js/social.js', 'js/telas/comum.js', 'js/mix.js', 'js/streaming.js', 'js/andamento.js', 'js/especial.js', 'js/telas/calendario.js', 'js/curiosidades.js', 'js/avisos.js',
  'js/telas/inicio.js', 'js/telas/buscar.js', 'js/telas/lista.js', 'js/telas/diario.js', 'js/telas/perfil.js',
  'js/telas/filme.js', 'js/telas/serie.js', 'js/telas/pessoa.js',
  'icones/icon-192.png', 'icones/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE_APP).then((c) => c.addAll(CASCA)).catch(() => {}).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const manter = new Set([CACHE_APP, CACHE_IMG, CACHE_FONTE]);
    for (const k of await caches.keys()) if (!manter.has(k)) await caches.delete(k);
    await self.clients.claim();
  })());
});

async function redePrimeiro(req) {
  const cache = await caches.open(CACHE_APP);
  try {
    const r = await fetch(req);
    if (r.ok) cache.put(req, r.clone());
    return r;
  } catch (erro) {
    const salvo = await cache.match(req, { ignoreSearch: true });
    if (salvo) return salvo;
    if (req.mode === 'navigate') { const casca = await cache.match('index.html'); if (casca) return casca; }
    throw erro;
  }
}

async function cachePrimeiro(req, nome, max) {
  const cache = await caches.open(nome);
  const salvo = await cache.match(req);
  if (salvo) return salvo;
  const r = await fetch(req);
  if (r.ok) {
    cache.put(req, r.clone());
    if (max && Math.random() < 0.04) aparar(cache, max); // confere o limite de vez em quando, não a cada imagem
  }
  return r;
}

async function aparar(cache, max) {
  const chaves = await cache.keys();
  for (let i = 0; i < chaves.length - max; i++) await cache.delete(chaves[i]);
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    if (url.pathname.endsWith('config.local.js')) return; // chaves locais: nunca guardar
    e.respondWith(redePrimeiro(req));
  } else if (url.hostname === 'image.tmdb.org') {
    e.respondWith(cachePrimeiro(req, CACHE_IMG, MAX_IMG));
  } else if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com' || url.hostname === 'cdn.jsdelivr.net') {
    e.respondWith(cachePrimeiro(req, CACHE_FONTE));
  }
});

/* ---------- avisos (push) ---------- */
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data.json(); } catch { d = { titulo: 'Sessão', corpo: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.titulo || 'Sessão', {
    body: d.corpo || '', icon: 'icones/icon-192.png', badge: 'icones/icon-192.png', tag: d.chave || undefined, data: { url: d.url || '' },
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const destino = new URL(`./${e.notification.data?.url || ''}`, self.registration.scope).href;
  e.waitUntil((async () => {
    const janelas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const aberta = janelas.find((j) => j.url.startsWith(self.registration.scope));
    if (aberta) { aberta.postMessage({ ir: e.notification.data?.url || '' }); return aberta.focus(); }
    return self.clients.openWindow(destino);
  })());
});