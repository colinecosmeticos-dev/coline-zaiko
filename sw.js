// =========================================================
// Service worker: guarda os arquivos do app no aparelho para
// funcionar sem internet.
//
// IMPORTANTE: a cada atualização publicada, mude o número do CACHE
// (e a versão em js/versao.js). É assim que os aparelhos percebem
// que existe versão nova e baixam os arquivos de novo.
// =========================================================
const CACHE = 'zaiko-0.23.1';

// Todos os arquivos que o app precisa para funcionar offline.
// Arquivo novo no projeto = acrescentar aqui.
const ARQUIVOS = [
  './',
  './index.html',
  './manifest.json',
  './css/app.css',
  './js/app.js',
  './js/versao.js',
  './js/modo.js',
  './js/sincronizar.js',
  './js/cores.js',
  './js/atualizacao.js',
  './js/db.js',
  './js/ui.js',
  './js/tema.js',
  './js/codigos.js',
  './js/leitor.js',
  './js/foto.js',
  './js/camera.js',
  './js/pin.js',
  './js/pacote.js',
  './js/drive.js',
  './js/sons.js',
  './js/venda/carrinho.js',
  './js/venda/grupos.js',
  './js/venda/escolher-evento.js',
  './js/venda/abrir-caixa.js',
  './js/venda/cobrar.js',
  './js/venda/registro.js',
  './js/venda/devolucao.js',
  './js/telas/vender.js',
  './js/telas/vendas.js',
  './js/telas/venda-detalhe.js',
  './js/telas/caixa.js',
  './js/caixa/resumo.js',
  './js/caixa/janelas.js',
  './js/telas/painel.js',
  './js/painel/calculo.js',
  './js/telas/juntar.js',
  './js/vendas-arquivo.js',
  './js/telas/estoque.js',
  './js/estoque/calculo.js',
  './js/telas/fechamento.js',
  './js/fechamento/calculo.js',
  './js/fechamento/planilha.js',
  './js/xlsx.js',
  './js/backup.js',
  './js/telas/backup.js',
  './js/telas/codigos.js',
  './js/barras.js',
  './js/telas/precos-evento.js',
  './js/telas/pacote.js',
  './js/lib/dexie.min.mjs',
  './js/telas/inicio.js',
  './js/telas/produtos.js',
  './js/telas/produto-form.js',
  './js/telas/mais.js',
  './js/telas/configuracoes.js',
  './js/telas/formas.js',
  './js/telas/forma-form.js',
  './js/telas/categorias.js',
  './js/telas/categoria-form.js',
  './js/telas/agrupadores.js',
  './js/telas/organizar.js',
  './js/telas/configurar.js',
  './js/telas/sincronizar.js',
  './js/telas/retiradas.js',
  './js/telas/eventos.js',
  './js/telas/evento-form.js',
  './js/telas/em-breve.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png'
];

// Instalação: baixa e guarda todos os arquivos da versão nova (sem ativar ainda)
self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ARQUIVOS.map((a) => new Request(a, { cache: 'reload' }))))
  );
  // Não assume sozinho: espera o "Atualizar agora" (ver js/atualizacao.js)
});

self.addEventListener('message', (evento) => {
  if (evento.data === 'atualizar') self.skipWaiting();
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
