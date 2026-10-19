// =========================================================
// Telas Subcategorias e Linhas (Produtos → Organizar).
// As duas funcionam igual: lista com nome, quantos produtos usam
// e setas para mudar a ordem; tocar no nome edita ou exclui.
//   Subcategoria (Shampoo, Higienizador...): pertence a uma categoria
//     (Capilar > Shampoo). A lista aparece separada por categoria; a ordem
//     é a ordem das colunas (ou dos grupos) na venda. No banco, a tabela
//     continua se chamando "tipos" (campo tipoId do produto).
//   Linha (Umeboshi, Ice Melon...): a ordem é a ordem dos grupos na venda.
//     Tem uma descrição opcional (ex.: Umeboshi → "Oriental Blend"), que
//     aparece no título do grupo na venda e entra na busca.
// =========================================================
import { db, novoId, listarTipos, listarLinhas, listarCategorias } from '../db.js';
import { esc, icones, aviso, confirmar, abrirJanela } from '../ui.js';

const CONFIG = {
  tipo: {
    tabela: 'tipos', listar: listarTipos, comCategoria: true,
    titulo: 'Subcategorias', um: 'subcategoria', novo: 'Nova subcategoria', exemplo: 'Ex.: Shampoo',
    explica: 'A subcategoria diz o que é o produto (Shampoo, Higienizador...) e fica dentro de uma categoria. Na venda, a ordem das subcategorias é a ordem das colunas (ou dos grupos).',
    vazio: 'Crie aqui ou direto no cadastro do produto.',
    usados: (produtos, id) => produtos.filter((p) => p.tipoId === id).length
  },
  linha: {
    tabela: 'linhas', listar: listarLinhas, comDescricao: true,
    titulo: 'Linhas', um: 'linha', novo: 'Nova linha', exemplo: 'Ex.: Umeboshi',
    explica: 'A linha junta produtos da mesma família (Umeboshi, Ice Melon...). No cadastro, o produto varia por linha (Shampoo: Umeboshi, Ice Melon...). Na venda, a ordem das linhas é a ordem dos grupos, com a descrição ao lado do nome.',
    vazio: 'Crie aqui ou direto no cadastro do produto. Linha é opcional.',
    usados: (produtos, id, variacoes) => new Set([...produtos.filter((p) => p.linhaId === id).map((p) => p.id), ...variacoes.filter((v) => v.linhaId === id).map((v) => v.produtoId)]).size
  }
};

export const renderTipos = (el) => desenhar(el, 'tipo');
export const renderLinhas = (el) => desenhar(el, 'linha');

async function desenhar(el, qual) {
  const c = CONFIG[qual];
  const [itens, produtos, variacoes, categorias] = await Promise.all([c.listar(), db.produtos.toArray(), db.variacoes.toArray(), listarCategorias()]);
  // Ordem sem repetição (0, 1, 2...), para as setas trocarem só dois itens
  if (itens.some((t, i) => t.ordem !== i)) { await db[c.tabela].bulkPut(itens.map((t, ordem) => Object.assign(t, { ordem }))); }
  const qtd = (id) => c.usados(produtos, id, variacoes);

  // Seções: por categoria (subcategorias) ou uma só (linhas)
  const idsCategorias = new Set(categorias.map((x) => x.id));
  const secoes = c.comCategoria
    ? [...categorias.map((cat) => ({ titulo: cat.nome, itens: itens.filter((t) => t.categoriaId === cat.id) })),
      { titulo: 'Sem categoria', itens: itens.filter((t) => !idsCategorias.has(t.categoriaId)) }].filter((s) => s.itens.length)
    : [{ titulo: '', itens }];

  const linhaItem = (t, i, lista) => `
        <li class="linha-forma">
          <button type="button" class="info" data-editar="${esc(t.id)}" style="text-align:left">
            <span><strong>${esc(t.nome)}</strong>${t.descricao ? ` <span class="sub">· ${esc(t.descricao)}</span>` : ''}<br><span class="sub">${qtd(t.id)} ${qtd(t.id) === 1 ? 'produto' : 'produtos'}</span></span>
          </button>
          <div class="setas">
            <button type="button" class="btn-icone" data-mover="${esc(lista[i - 1]?.id || '')}" data-id="${esc(t.id)}" aria-label="Subir ${esc(t.nome)}" ${i === 0 ? 'disabled' : ''}>${icones.cima}</button>
            <button type="button" class="btn-icone" data-mover="${esc(lista[i + 1]?.id || '')}" data-id="${esc(t.id)}" aria-label="Descer ${esc(t.nome)}" ${i === lista.length - 1 ? 'disabled' : ''}>${icones.baixo}</button>
          </div>
        </li>`;

  el.innerHTML = `
    <a class="voltar" href="#/produtos/organizar">${icones.voltar} Organizar produtos</a>
    <header class="cab">
      <div><h1>${c.titulo}</h1><p class="sub">${c.explica}</p></div>
      <button type="button" class="btn primario" id="novo">${icones.mais} ${c.novo}</button>
    </header>
    ${itens.length ? secoes.map((s) => `
      ${s.titulo ? `<h2 class="titulo-secao">${esc(s.titulo)}</h2>` : ''}
      <ul class="lista">${s.itens.map((t, i) => linhaItem(t, i, s.itens)).join('')}</ul>`).join('') : `
    <div class="cartao vazio">
      <div class="simbolo" aria-hidden="true">在庫</div>
      <h2>Nenhuma ${c.um}</h2>
      <p>${c.vazio}</p>
    </div>`}`;

  el.querySelectorAll('[data-mover]').forEach((b) => b.addEventListener('click', async () => {
    const a = itens.find((t) => t.id === b.dataset.id), outro = itens.find((t) => t.id === b.dataset.mover);
    if (!a || !outro) return;
    [a.ordem, outro.ordem] = [outro.ordem, a.ordem];
    await db[c.tabela].bulkPut([a, outro]);
    await desenhar(el, qual);
  }));
  el.querySelector('#novo').addEventListener('click', async () => {
    const r = await pedirNome({ titulo: c.novo, exemplo: c.exemplo, itens, comDescricao: c.comDescricao, categorias: c.comCategoria ? categorias : null });
    if (!r) return;
    await db[c.tabela].add({ id: novoId(), ...r, ordem: itens.length });
    aviso(c.um === 'linha' ? 'Linha criada.' : 'Subcategoria criada.');
    await desenhar(el, qual);
  });
  el.querySelectorAll('[data-editar]').forEach((b) => b.addEventListener('click', async () => {
    const item = itens.find((t) => t.id === b.dataset.editar);
    const n = qtd(item.id);
    const r = await pedirNome({ titulo: `Editar ${c.um}`, exemplo: c.exemplo, itens, atual: item, podeExcluir: true, comDescricao: c.comDescricao, categorias: c.comCategoria ? categorias : null });
    if (r === 'excluir') {
      if (n) { aviso(`${n} ${n === 1 ? 'produto usa' : 'produtos usam'} esta ${c.um}. Troque nos produtos antes de excluir.`, { tipo: 'erro' }); return; }
      if (!(await confirmar({ titulo: `Excluir ${item.nome}?`, botao: 'Excluir', perigo: true }))) return;
      await db[c.tabela].delete(item.id);
      aviso('Excluída.');
    } else if (r) {
      await db[c.tabela].update(item.id, r);
      aviso(c.um === 'linha' ? 'Linha alterada.' : 'Subcategoria alterada.');
    } else return;
    await desenhar(el, qual);
  }));
}

// Janela com o nome e, conforme o caso, a descrição (linhas) ou a categoria (subcategorias).
// Devolve { nome, descricao?, categoriaId? }, 'excluir', ou null (cancelou).
export function pedirNome({ titulo, exemplo, itens, atual = null, podeExcluir = false, comDescricao = false, categorias = null, categoriaInicial = null }) {
  return new Promise((resolver) => {
    let resultado = null;
    const catAtual = atual ? atual.categoriaId : categoriaInicial;
    const d = abrirJanela(`
      <form method="dialog" novalidate>
        <h2>${esc(titulo)}</h2>
        <div class="campo" style="margin-top:12px">
          <label for="nome-agrupador">Nome</label>
          <input class="entrada" id="nome-agrupador" maxlength="40" autocomplete="off" placeholder="${esc(exemplo)}" value="${esc(atual ? atual.nome : '')}">
        </div>
        ${categorias ? `
        <div class="campo" style="margin-top:12px">
          <label for="categoria-agrupador">Categoria</label>
          <select class="entrada" id="categoria-agrupador">
            <option value="">Sem categoria</option>
            ${categorias.map((x) => `<option value="${esc(x.id)}" ${x.id === catAtual ? 'selected' : ''}>${esc(x.nome)}</option>`).join('')}
          </select>
        </div>` : ''}
        ${comDescricao ? `
        <div class="campo" style="margin-top:12px">
          <label for="descricao-agrupador">Descrição <span class="sub" style="font-weight:400">(opcional)</span></label>
          <input class="entrada" id="descricao-agrupador" maxlength="40" autocomplete="off" placeholder="Ex.: Oriental Blend, Hidratação" value="${esc(atual ? atual.descricao || '' : '')}">
          <span class="dica">Aparece ao lado do nome na tela de venda, e a busca encontra por ela.</span>
        </div>` : ''}
        <div class="acoes">
          ${podeExcluir ? '<button type="button" class="btn texto perigo" id="excluir" style="margin-right:auto">Excluir</button>' : ''}
          <button type="button" class="btn" id="cancelar">Cancelar</button>
          <button type="submit" class="btn primario">Salvar</button>
        </div>
      </form>`, { aoFechar: () => resolver(resultado) });
    const campo = d.querySelector('#nome-agrupador');
    campo.focus();
    d.querySelector('#cancelar').addEventListener('click', () => d.close());
    if (podeExcluir) d.querySelector('#excluir').addEventListener('click', () => { resultado = 'excluir'; d.close(); });
    d.querySelector('form').addEventListener('submit', (e) => {
      e.preventDefault();
      const nome = campo.value.trim();
      if (!nome) { campo.setAttribute('aria-invalid', 'true'); campo.focus(); return; }
      if (itens.some((t) => t.id !== (atual && atual.id) && t.nome.toLowerCase() === nome.toLowerCase())) {
        aviso('Já existe um com esse nome.', { tipo: 'erro' }); campo.focus(); return;
      }
      resultado = { nome: nome.charAt(0).toUpperCase() + nome.slice(1) };
      if (comDescricao) resultado.descricao = d.querySelector('#descricao-agrupador').value.trim();
      if (categorias) resultado.categoriaId = d.querySelector('#categoria-agrupador').value || null;
      d.close();
    });
  });
}
