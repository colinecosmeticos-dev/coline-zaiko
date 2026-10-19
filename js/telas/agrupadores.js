// =========================================================
// Telas Tipos e Linhas (Produtos → Organizar → Tipos / Linhas).
// As duas funcionam igual: lista com nome, quantos produtos usam
// e setas para mudar a ordem; tocar no nome renomeia ou exclui.
// A linha tem também uma descrição opcional (ex.: Umeboshi → "Oriental Blend"),
// que aparece no título do grupo na venda e entra na busca.
//   Tipo  (Shampoo, Higienizador...): a ordem é a ordem das colunas na venda.
//   Linha (Umeboshi, Ice Melon...): a ordem é a ordem dos grupos na venda.
// =========================================================
import { db, novoId, listarTipos, listarLinhas } from '../db.js';
import { esc, icones, aviso, confirmar, abrirJanela } from '../ui.js';

const CONFIG = {
  tipo: {
    tabela: 'tipos', campo: 'tipoId', listar: listarTipos,
    titulo: 'Tipos', um: 'tipo', novo: 'Novo tipo', exemplo: 'Ex.: Shampoo',
    explica: 'O tipo diz o que é o produto (Shampoo, Higienizador...). Na venda, a ordem dos tipos é a ordem das colunas: o primeiro fica sempre na primeira coluna.',
    vazio: 'Crie aqui ou direto no cadastro do produto.'
  },
  linha: {
    tabela: 'linhas', campo: 'linhaId', listar: listarLinhas,
    titulo: 'Linhas', um: 'linha', novo: 'Nova linha', exemplo: 'Ex.: Umeboshi', descricao: true,
    explica: 'A linha junta produtos da mesma família (Umeboshi, Ice Melon...). Na venda, cada linha vira um grupo, nesta ordem, com a descrição ao lado do nome. Produto sem linha fica agrupado pelo tipo.',
    vazio: 'Crie aqui ou direto no cadastro do produto. Linha é opcional.'
  }
};

export const renderTipos = (el) => desenhar(el, 'tipo');
export const renderLinhas = (el) => desenhar(el, 'linha');

async function desenhar(el, qual) {
  const c = CONFIG[qual];
  const itens = await c.listar();
  const produtos = await db.produtos.toArray();
  const qtd = (id) => produtos.filter((p) => p[c.campo] === id).length;

  el.innerHTML = `
    <a class="voltar" href="#/produtos/organizar">${icones.voltar} Organizar produtos</a>
    <header class="cab">
      <div><h1>${c.titulo}</h1><p class="sub">${c.explica}</p></div>
      <button type="button" class="btn primario" id="novo">${icones.mais} ${c.novo}</button>
    </header>
    ${itens.length ? `
    <ul class="lista">
      ${itens.map((t, i) => `
        <li class="linha-forma">
          <button type="button" class="info" data-editar="${esc(t.id)}" style="text-align:left">
            <span><strong>${esc(t.nome)}</strong>${t.descricao ? ` <span class="sub">· ${esc(t.descricao)}</span>` : ''}<br><span class="sub">${qtd(t.id)} ${qtd(t.id) === 1 ? 'produto' : 'produtos'}</span></span>
          </button>
          <div class="setas">
            <button type="button" class="btn-icone" data-mover="-1" data-i="${i}" aria-label="Subir ${esc(t.nome)}" ${i === 0 ? 'disabled' : ''}>${icones.cima}</button>
            <button type="button" class="btn-icone" data-mover="1" data-i="${i}" aria-label="Descer ${esc(t.nome)}" ${i === itens.length - 1 ? 'disabled' : ''}>${icones.baixo}</button>
          </div>
        </li>`).join('')}
    </ul>` : `
    <div class="cartao vazio">
      <div class="simbolo" aria-hidden="true">在庫</div>
      <h2>Nenhum${qual === 'linha' ? 'a linha' : ' tipo'}</h2>
      <p>${c.vazio}</p>
    </div>`}`;

  el.querySelectorAll('[data-mover]').forEach((b) => b.addEventListener('click', async () => {
    const i = Number(b.dataset.i), j = i + Number(b.dataset.mover);
    [itens[i], itens[j]] = [itens[j], itens[i]];
    await db[c.tabela].bulkPut(itens.map((t, ordem) => ({ ...t, ordem })));
    await desenhar(el, qual);
  }));
  el.querySelector('#novo').addEventListener('click', async () => {
    const r = await pedirNome({ titulo: c.novo, exemplo: c.exemplo, itens, comDescricao: c.descricao });
    if (!r) return;
    await db[c.tabela].add({ id: novoId(), ...r, ordem: itens.length });
    aviso(`${c.um === 'tipo' ? 'Tipo criado' : 'Linha criada'}.`);
    await desenhar(el, qual);
  });
  el.querySelectorAll('[data-editar]').forEach((b) => b.addEventListener('click', async () => {
    const item = itens.find((t) => t.id === b.dataset.editar);
    const n = qtd(item.id);
    const r = await pedirNome({ titulo: c.descricao ? `Editar ${c.um}` : `Renomear ${c.um}`, exemplo: c.exemplo, itens, atual: item, podeExcluir: true, comDescricao: c.descricao });
    if (r === 'excluir') {
      if (n) { aviso(`${n} ${n === 1 ? 'produto usa' : 'produtos usam'} ${qual === 'tipo' ? 'este tipo' : 'esta linha'}. Troque nos produtos antes de excluir.`, { tipo: 'erro' }); return; }
      if (!(await confirmar({ titulo: `Excluir ${item.nome}?`, botao: 'Excluir', perigo: true }))) return;
      await db[c.tabela].delete(item.id);
      aviso('Excluído.');
    } else if (r) {
      await db[c.tabela].update(item.id, r);
      aviso(c.descricao ? 'Linha alterada.' : 'Nome alterado.');
    } else return;
    await desenhar(el, qual);
  }));
}

// Janela com o nome (e, nas linhas, a descrição).
// Devolve { nome } ou { nome, descricao }, 'excluir', ou null (cancelou).
export function pedirNome({ titulo, exemplo, itens, atual = null, podeExcluir = false, comDescricao = false }) {
  return new Promise((resolver) => {
    let resultado = null;
    const d = abrirJanela(`
      <form method="dialog" novalidate>
        <h2>${esc(titulo)}</h2>
        <div class="campo" style="margin-top:12px">
          <label for="nome-agrupador">Nome</label>
          <input class="entrada" id="nome-agrupador" maxlength="40" autocomplete="off" placeholder="${esc(exemplo)}" value="${esc(atual ? atual.nome : '')}">
        </div>
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
      d.close();
    });
  });
}
