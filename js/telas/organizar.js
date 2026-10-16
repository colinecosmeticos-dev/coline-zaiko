// =========================================================
// Tela Organizar produtos (Produtos → Organizar).
// Todos os produtos numa lista, com categoria, tipo e linha
// escolhidos direto na linha (grava na hora, sem botão Salvar).
// Em cima, os atalhos para editar as listas de Categorias,
// Tipos e Linhas (nomes e ordem).
// =========================================================
import { db, listarCategorias, listarTipos, listarLinhas, listarProdutosCompletos } from '../db.js';
import { esc, icones, aviso } from '../ui.js';

export async function render(el) {
  const [categorias, tipos, linhas, produtos] = await Promise.all([listarCategorias(), listarTipos(), listarLinhas(), listarProdutosCompletos()]);
  let soPendentes = false;
  const pendente = (p) => !p.categoriaId || !p.tipoId || !categorias.some((c) => c.id === p.categoriaId) || !tipos.some((t) => t.id === p.tipoId);

  const opcoes = (lista, atual, vazio) =>
    `<option value="">${vazio}</option>` + lista.map((x) => `<option value="${esc(x.id)}" ${x.id === atual ? 'selected' : ''}>${esc(x.nome)}</option>`).join('');

  el.innerHTML = `
    <a class="voltar" href="#/produtos">${icones.voltar} Produtos</a>
    <header class="cab">
      <div><h1>Organizar produtos</h1>
        <p class="sub">Categoria, tipo e linha de cada produto. Muda na hora, sem precisar salvar.</p></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <a class="btn" href="#/produtos/categorias">Categorias</a>
        <a class="btn" href="#/produtos/tipos">Tipos</a>
        <a class="btn" href="#/produtos/linhas">Linhas</a>
      </div>
    </header>
    <div class="filtros">
      <div class="chips" role="group" aria-label="Mostrar">
        <button type="button" class="chip" data-filtro="todos" aria-pressed="true">Todos (${produtos.length})</button>
        <button type="button" class="chip" data-filtro="pendentes" aria-pressed="false" id="chip-pendentes"></button>
      </div>
    </div>
    <div class="cab-organizar" aria-hidden="true"><span>Produto</span><span>Categoria</span><span>Tipo</span><span>Linha</span></div>
    <ul class="lista lista-organizar" id="lista"></ul>`;

  const lista = el.querySelector('#lista');
  function desenhar() {
    const qtdPend = produtos.filter(pendente).length;
    el.querySelector('#chip-pendentes').textContent = `Falta categoria ou tipo (${qtdPend})`;
    const visiveis = soPendentes ? produtos.filter(pendente) : produtos;
    lista.innerHTML = visiveis.length ? visiveis.map((p) => `
      <li class="linha-organizar ${pendente(p) ? 'pendente' : ''}" data-id="${esc(p.id)}">
        <a class="org-nome" href="#/produtos/${encodeURIComponent(p.id)}"><strong>${esc(p.nome)}</strong>${p.ativo ? '' : ' <span class="etiqueta">Inativo</span>'}</a>
        <label class="org-campo"><span class="rotulo-m">Categoria</span><select class="entrada" data-campo="categoriaId">${opcoes(categorias, p.categoriaId, 'Escolha…')}</select></label>
        <label class="org-campo"><span class="rotulo-m">Tipo</span><select class="entrada" data-campo="tipoId">${opcoes(tipos, p.tipoId, 'Escolha…')}</select></label>
        <label class="org-campo"><span class="rotulo-m">Linha</span><select class="entrada" data-campo="linhaId">${opcoes(linhas, p.linhaId, 'Sem linha')}</select></label>
      </li>`).join('') : '<li class="sub" style="padding:24px;text-align:center">Tudo organizado.</li>';
  }

  lista.addEventListener('change', async (e) => {
    const sel = e.target.closest('select[data-campo]');
    if (!sel) return;
    const li = sel.closest('[data-id]');
    const p = produtos.find((x) => x.id === li.dataset.id);
    const valor = sel.value || null;
    try {
      await db.produtos.update(p.id, { [sel.dataset.campo]: valor, atualizadoEm: new Date().toISOString() });
      p[sel.dataset.campo] = valor;
      li.classList.toggle('pendente', pendente(p));
      el.querySelector('#chip-pendentes').textContent = `Falta categoria ou tipo (${produtos.filter(pendente).length})`;
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
