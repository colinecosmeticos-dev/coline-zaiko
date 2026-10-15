// =========================================================
// Tela Categorias de retirada (Mais → Configurações).
// Usadas ao tirar dinheiro do caixa. "É despesa" desligado =
// dinheiro que só muda de lugar (ex.: Sangria), não entra como gasto.
// =========================================================
import { db, novoId, listarCategoriasRetirada } from '../db.js';
import { esc, aviso, icones } from '../ui.js';

export async function render(el) {
  const categorias = await listarCategoriasRetirada();

  el.innerHTML = `
    <a class="voltar" href="#/configuracoes">${icones.voltar} Configurações</a>
    <header class="cab">
      <div>
        <h1>Categorias de retirada</h1>
        <p class="sub">Aparecem ao tirar dinheiro do caixa. Os fechamentos somam os gastos por categoria.</p>
      </div>
    </header>

    <form class="cartao" novalidate>
      <div class="cab-categorias" aria-hidden="true"><span>Nome</span><span>É despesa</span><span></span></div>
      <div id="linhas" class="lista-categorias"></div>
      <button type="button" class="btn texto" id="adicionar" style="margin-top:8px">${icones.mais} Adicionar categoria</button>
      <p class="sub" style="margin-top:12px">Desligue "É despesa" para retiradas que não são gasto, como a Sangria (dinheiro guardado em local seguro).</p>
      <div class="acoes" style="display:flex;justify-content:flex-end;margin-top:16px">
        <button type="submit" class="btn primario">Salvar categorias</button>
      </div>
    </form>`;

  const linhas = el.querySelector('#linhas');
  function adicionar(c = { id: novoId(), nome: '', despesa: true }) {
    const div = document.createElement('div');
    div.className = 'linha-categoria';
    div.dataset.id = c.id;
    div.innerHTML = `
      <input class="entrada" maxlength="40" aria-label="Nome da categoria" placeholder="Ex.: Combustível" value="${esc(c.nome)}">
      <label class="interruptor" style="min-height:0"><span class="oculto">É despesa</span><input type="checkbox" ${c.despesa ? 'checked' : ''}></label>
      <button type="button" class="btn-icone" aria-label="Remover categoria">${icones.lixo}</button>`;
    div.querySelector('.btn-icone').addEventListener('click', () => div.remove());
    linhas.append(div);
    return div;
  }
  categorias.filter((c) => c.ativo !== false).forEach((c) => adicionar(c));
  el.querySelector('#adicionar').addEventListener('click', () => adicionar().querySelector('input').focus());

  el.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const itens = [...linhas.children].map((div, ordem) => ({
      id: div.dataset.id,
      nome: div.querySelector('input.entrada').value.trim(),
      despesa: div.querySelector('input[type=checkbox]').checked,
      ativo: true,
      ordem
    })).filter((c) => c.nome);
    const vistos = new Set();
    for (const c of itens) {
      const k = c.nome.toLowerCase();
      if (vistos.has(k)) { aviso(`Categoria repetida: ${c.nome}.`, { tipo: 'erro' }); return; }
      vistos.add(k);
    }
    // Removidas ficam guardadas como inativas: retiradas antigas continuam com o nome certo
    const mantidos = new Set(itens.map((c) => c.id));
    const removidas = categorias.filter((c) => !mantidos.has(c.id)).map((c) => ({ ...c, ativo: false }));
    await db.categoriasRetirada.bulkPut([...itens, ...removidas]);
    aviso('Categorias salvas.');
    location.hash = '#/configuracoes';
  });
}
