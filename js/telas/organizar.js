// =========================================================
// Tela Organizar produtos (Produtos → Organizar).
// Todos os produtos numa lista, com categoria e subcategoria
// escolhidas direto na linha (grava na hora, sem botão Salvar).
// A subcategoria mostra só as da categoria do produto (e as que
// ainda não têm categoria; escolher uma delas a coloca nessa categoria).
// Em cima, os atalhos para as listas de Categorias, Subcategorias e Linhas.
// (Desde a v0.23.0 a linha é da variação: fica no cadastro do produto.)
// =========================================================
import { db, listarCategorias, listarTipos, listarProdutosCompletos } from '../db.js';
import { esc, icones, aviso } from '../ui.js';

export async function render(el) {
  const [categorias, subcategorias, produtos] = await Promise.all([listarCategorias(), listarTipos(), listarProdutosCompletos()]);
  let soPendentes = false;
  const sub = (id) => subcategorias.find((t) => t.id === id);
  const pendente = (p) => {
    if (!p.categoriaId || !p.tipoId || !categorias.some((c) => c.id === p.categoriaId)) return true;
    const t = sub(p.tipoId);
    return !t || (t.categoriaId && t.categoriaId !== p.categoriaId);
  };
  const opcoes = (lista, atual, vazio) =>
    `<option value="">${vazio}</option>` + lista.map((x) => `<option value="${esc(x.id)}" ${x.id === atual ? 'selected' : ''}>${esc(x.nome)}</option>`).join('');
  // Subcategorias da categoria do produto (+ sem categoria; + a atual, mesmo se for de outra)
  const opcoesSub = (p) => {
    const daCategoria = subcategorias.filter((t) => t.categoriaId && t.categoriaId === p.categoriaId);
    const soltas = subcategorias.filter((t) => !t.categoriaId);
    const atualFora = p.tipoId && sub(p.tipoId) && !daCategoria.includes(sub(p.tipoId)) && !soltas.includes(sub(p.tipoId)) ? [sub(p.tipoId)] : [];
    const grupo = (rotulo, lista) => lista.length ? `<optgroup label="${rotulo}">${lista.map((x) => `<option value="${esc(x.id)}" ${x.id === p.tipoId ? 'selected' : ''}>${esc(x.nome)}</option>`).join('')}</optgroup>` : '';
    return `<option value="">Escolha…</option>${daCategoria.map((x) => `<option value="${esc(x.id)}" ${x.id === p.tipoId ? 'selected' : ''}>${esc(x.nome)}</option>`).join('')}${grupo('Sem categoria', soltas)}${grupo('De outra categoria', atualFora)}`;
  };

  el.innerHTML = `
    <a class="voltar" href="#/produtos">${icones.voltar} Produtos</a>
    <header class="cab">
      <div><h1>Organizar produtos</h1>
        <p class="sub">Categoria e subcategoria de cada produto. Muda na hora, sem precisar salvar. A linha fica nas variações, no cadastro do produto.</p></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <a class="btn" href="#/produtos/categorias">Categorias</a>
        <a class="btn" href="#/produtos/tipos">Subcategorias</a>
        <a class="btn" href="#/produtos/linhas">Linhas</a>
      </div>
    </header>
    <div class="filtros">
      <div class="chips" role="group" aria-label="Mostrar">
        <button type="button" class="chip" data-filtro="todos" aria-pressed="true">Todos (${produtos.length})</button>
        <button type="button" class="chip" data-filtro="pendentes" aria-pressed="false" id="chip-pendentes"></button>
      </div>
    </div>
    <div class="cab-organizar" aria-hidden="true"><span>Produto</span><span>Categoria</span><span>Subcategoria</span></div>
    <ul class="lista lista-organizar" id="lista"></ul>`;

  const lista = el.querySelector('#lista');
  const contar = () => { el.querySelector('#chip-pendentes').textContent = `Falta organizar (${produtos.filter(pendente).length})`; };
  const linhaHtml = (p) => `
      <li class="linha-organizar ${pendente(p) ? 'pendente' : ''}" data-id="${esc(p.id)}">
        <a class="org-nome" href="#/produtos/${encodeURIComponent(p.id)}"><strong>${esc(p.nome)}</strong>${p.ativo ? '' : ' <span class="etiqueta">Inativo</span>'}</a>
        <label class="org-campo"><span class="rotulo-m">Categoria</span><select class="entrada" data-campo="categoriaId">${opcoes(categorias, p.categoriaId, 'Escolha…')}</select></label>
        <label class="org-campo"><span class="rotulo-m">Subcategoria</span><select class="entrada" data-campo="tipoId">${opcoesSub(p)}</select></label>
      </li>`;
  function desenhar() {
    contar();
    const visiveis = soPendentes ? produtos.filter(pendente) : produtos;
    lista.innerHTML = visiveis.length ? visiveis.map(linhaHtml).join('') : '<li class="sub" style="padding:24px;text-align:center">Tudo organizado.</li>';
  }

  lista.addEventListener('change', async (e) => {
    const sel = e.target.closest('select[data-campo]');
    if (!sel) return;
    const li = sel.closest('[data-id]');
    const p = produtos.find((x) => x.id === li.dataset.id);
    const campo = sel.dataset.campo;
    const valor = sel.value || null;
    try {
      await db.produtos.update(p.id, { [campo]: valor, atualizadoEm: new Date().toISOString() });
      p[campo] = valor;
      // Subcategoria sem categoria escolhida aqui: passa a ser desta categoria
      const t = campo === 'tipoId' ? sub(valor) : null;
      if (t && !t.categoriaId && p.categoriaId) { await db.tipos.update(t.id, { categoriaId: p.categoriaId }); t.categoriaId = p.categoriaId; }
      if (campo === 'categoriaId' || t) desenhar();   // as opções de subcategoria mudam
      else { li.classList.toggle('pendente', pendente(p)); contar(); }
    } catch (erro) {
      console.error(erro);
      aviso('Não foi possível salvar. Tente de novo.', { tipo: 'erro' });
    }
  });
  el.querySelectorAll('[data-filtro]').forEach((b) => b.addEventListener('click', () => {
    soPendentes = b.dataset.filtro === 'pendentes';
    el.querySelectorAll('[data-filtro]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    desenhar();
  }));
  desenhar();
}
