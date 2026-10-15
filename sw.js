// =========================================================
// Service worker: guarda os arquivos do app no aparelho para
// funcionar sem internet.
//
// IMPORTANTE: a cada atualização publicada, mude o número do CACHE
// (e a versão em js/versao.js). É assim que os aparelhos percebem
// que existe versão nova e baixam os arquivos de novo.
// =========================================================
const CACHE = 'zaiko-0.2.1';

// Todos os arquivos que o app precisa para funcionar offline.
// Arquivo novo no projeto = acrescentar aqui.
const ARQUIVOS = [
  './',
  './index.html',
  './manifest.json',
  './css/app.css',
  './js/app.js',
  './js/versao.js',
  './js/db.js',
  './js/ui.js',
  './js/tema.js',
  './js/codigos.js',
  './js/leitor.js',
  './js/foto.js',
  './js/lib/dexie.min.mjs',
  './js/telas/inicio.js',
  './js/telas/produtos.js',
  './js/telas/produto-form.js',
  './js/telas/mais.js',
  './js/telas/configuracoes.js',
  './js/telas/em-breve.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png'
];

// Instalação: baixa e guarda todos os arquivos da versão nova
self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ARQUIVOS.map((a) => new Request(a, { cache: 'reload' }))))
  );
  self.skipWaiting();
});

// Ativação: apaga os arquivos de versões antigas
self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches.keys().then((nomes) =>
      Promise.all(nomes.filter((n) => n !== CACHE).map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();
});

// Cada pedido de arquivo: entrega o que está guardado; se não houver, busca na internet
self.addEventListener('fetch', (evento) => {
  if (evento.request.method !== 'GET') return;
  evento.respondWith(
    caches.match(evento.request, { ignoreSearch: true })
      .then((guardado) => guardado || fetch(evento.request))
  );
});
