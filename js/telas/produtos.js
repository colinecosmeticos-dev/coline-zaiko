// =========================================================
// Tela Produtos: lista, busca e filtro por categoria.
// Também escuta o leitor: ler um código aqui abre o produto
// (ou oferece cadastrar, se o código for novo).
// =========================================================
import { listarProdutosCompletos, buscarPorCodigo } from '../db.js';
import { esc, dinheiro, aviso, icones, iniciais } from '../ui.js';
import { ouvirLeitor } from '../leitor.js';

export async function render(el) {
  const produtos = await listarProdutosCompletos();
  const urlsFotos = [];

  if (!produtos.length) {
    el.innerHTML = `
      <header class="cab"><h1>Produtos</h1></header>
      <div class="cartao vazio">
        <div class="simbolo" aria-hidden="true">在庫</div>
        <h2>Nenhum produto cadastrado</h2>
        <p>Cadastre os produtos que você leva para os eventos. Com o leitor ligado, você também pode ler um código aqui para começar o cadastro.</p>
        <a class="btn primario" href="#/produtos/novo">Cadastrar o primeiro produto</a>
      </div>`;
    return ouvirLeitor(aoLerCodigo);
  }

  const categorias = [...new Set(produtos.map((p) => p.categoria).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const totalItens = produtos.reduce((s, p) => s + p.variacoes.length, 0);
  let filtroCategoria = '';
  let termo = '';

  el.innerHTML = `
    <header class="cab">
      <div>
        <h1>Produtos</h1>
        <p class="sub">${produtos.length} ${produtos.length === 1 ? 'produto' : 'produtos'}, ${totalItens} ${totalItens === 1 ? 'item vendável' : 'itens vendáveis'}</p>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <a class="btn" href="#/produtos/categorias">Categorias</a>
        <a class="btn" href="#/produtos/codigos">Folha de códigos</a>
        <a class="btn primario" href="#/produtos/novo">${icones.mais} Novo produto</a>
      </div>
    </header>

    <div class="filtros">
      <label class="busca">
        <span class="oculto">Buscar</span>
        ${icones.busca}
        <input class="entrada" type="search" placeholder="Buscar por nome, variação ou código" autocomplete="off">
      </label>
      ${categorias.length > 1 ? `
        <div class="chips" role="group" aria-label="Filtrar por categoria">
          <button class="chip" aria-pressed="true" data-cat="">Todas</button>
          ${categorias.map((c) => `<button class="chip" aria-pressed="false" data-cat="${esc(c)}">${esc(c)}</button>`).join('')}
        </div>` : ''}
    </div>

    <ul class="lista" id="lista-produtos"></ul>
    <p class="sub" id="sem-resultado" hidden style="text-align:center;padding:32px 0">Nenhum produto encontrado.</p>`;

  const lista = el.querySelector('#lista-produtos');
  const semResultado = el.querySelector('#sem-resultado');

  function desenharLista() {
    const t = termo.toLowerCase();
    const visiveis = produtos.filter((p) => {
      if (filtroCategoria && p.categoria !== filtroCategoria) return false;
      if (!t) return true;
      return p.nome.toLowerCase().includes(t)
        || p.variacoes.some((v) => v.nome.toLowerCase().includes(t) || v.codigo.includes(t));
    });
    lista.innerHTML = visiveis.map(linhaProduto).join('');
    lista.hidden = !visiveis.length;
    semResultado.hidden = !!visiveis.length;
  }

  function linhaProduto(p) {
    let foto = `<div class="foto" aria-hidden="true">${iniciais(p.nome)}</div>`;
    if (p.foto) {
      const url = URL.createObjectURL(p.foto);
      urlsFotos.push(url);
      foto = `<div class="foto"><img src="${url}" alt=""></div>`;
    }
    const qtd = p.variacoes.length;
    const temVariacoes = qtd > 1 || (qtd === 1 && p.variacoes[0].nome);
    return `
      <li><a class="item-produto ${p.ativo ? '' : 'inativo'}" href="#/produtos/${encodeURIComponent(p.id)}">
        ${foto}
        <div style="min-width:0">
          <div class="nome">${esc(p.nome)}</div>
          <div class="detalhe">
            ${p.categoria ? `<span class="etiqueta">${esc(p.categoria)}</span>` : ''}
            ${temVariacoes ? `<span>${qtd} ${esc((p.atributo || 'variação').toLowerCase())}${qtd === 1 ? '' : 's'}</span>` : ''}
            ${p.ativo ? '' : '<span class="etiqueta">Inativo</span>'}
          </div>
        </div>
        <div class="preco">${faixaDePreco(p)}</div>
      </a></li>`;
  }

  el.querySelector('input[type="search"]').addEventListener('input', (e) => { termo = e.target.value.trim(); desenharLista(); });
  el.querySelectorAll('.chip').forEach((chip) => chip.addEventListener('click', () => {
    filtroCategoria = chip.dataset.cat;
    el.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', String(c === chip)));
    desenharLista();
  }));

  desenharLista();
  const pararLeitor = ouvirLeitor(aoLerCodigo);

  // Ao sair da tela: desliga o leitor e libera as fotos da memória
  return () => { pararLeitor(); urlsFotos.forEach(URL.revokeObjectURL); };
}

// Preço exibido na lista: um valor, ou "de ... a ..." se as variações têm preços diferentes
export function faixaDePreco(p) {
  const precos = p.variacoes.map((v) => v.preco ?? p.preco);
  if (!precos.length) return dinheiro(p.preco);
  const min = Math.min(...precos), max = Math.max(...precos);
  return min === max ? dinheiro(min) : `${dinheiro(min)}<br><span class="sub" style="font-weight:400">a ${dinheiro(max)}</span>`;
}

async function aoLerCodigo(codigo) {
  const v = await buscarPorCodigo(codigo);
  if (v) { location.hash = `#/produtos/${encodeURIComponent(v.produtoId)}`; return; }
  aviso(`Código ${codigo} não cadastrado.`, {
    acao: 'Cadastrar',
    aoClicar: () => { location.hash = `#/produtos/novo?codigo=${encodeURIComponent(codigo)}`; }
  });
}
