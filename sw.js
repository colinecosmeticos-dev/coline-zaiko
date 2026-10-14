// Versão do cache. Sempre que publicarmos uma atualização,
// trocamos este número para os aparelhos baixarem os arquivos novos.
const CACHE = 'zaiko-v1';

// Arquivos que o app precisa para funcionar sem internet.
const ARQUIVOS = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png'
];

// Na instalação: baixa e guarda todos os arquivos.
self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ARQUIVOS))
  );
  self.skipWaiting();
});

// Na ativação: apaga caches de versões antigas.
self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches.keys().then((nomes) =>
      Promise.all(nomes.filter((n) => n !== CACHE).map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();
});

// A cada pedido de arquivo: entrega o que está guardado;
// se não estiver, busca na internet.
self.addEventListener('fetch', (evento) => {
  if (evento.request.method !== 'GET') return;
  evento.respondWith(
    caches.match(evento.request, { ignoreSearch: true })
      .then((guardado) => guardado || fetch(evento.request))
  );
});