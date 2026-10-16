// =========================================================
// Folha de códigos (Produtos → Folha de códigos).
// Uma folha A4 com o código de barras de cada item, por categoria,
// para deixar no balcão: o leitor lê o código direto do papel.
// Por padrão só os códigos internos ("20..."), que não existem na
// embalagem; dá para incluir também os códigos de fábrica.
// Imprimir abre a janela de impressão do aparelho (impressora ou PDF).
// =========================================================
import { listarProdutosCompletos } from '../db.js';
import { esc, dinheiro, icones } from '../ui.js';
import { ehCodigoInterno } from '../codigos.js';
import { svgEAN13, ehEAN13 } from '../barras.js';

const CHAVE = 'zaiko-folha-codigos';
const lerOpcoes = () => { try { return { todos: false, preco: true, inativos: false, ...JSON.parse(localStorage.getItem(CHAVE) || '{}') }; } catch (e) { return { todos: false, preco: true, inativos: false }; } };
const gravarOpcoes = (o) => { try { localStorage.setItem(CHAVE, JSON.stringify(o)); } catch (e) { /* ok */ } };

export async function render(el) {
  const produtos = await listarProdutosCompletos();
  const opcoes = lerOpcoes();

  function desenhar() {
    const itens = [];
    for (const p of produtos) {
      if (!p.ativo && !opcoes.inativos) continue;
      for (const v of p.variacoes) {
        if (!v.codigo || !ehEAN13(v.codigo)) continue;
        if (!opcoes.todos && !ehCodigoInterno(v.codigo)) continue;
        itens.push({ p, v, categoria: p.categoria || 'Sem categoria' });
      }
    }
    const grupos = new Map();
    for (const i of itens) { if (!grupos.has(i.categoria)) grupos.set(i.categoria, []); grupos.get(i.categoria).push(i); }
    const ordenados = [...grupos.entries()].sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'));
    const internos = produtos.flatMap((p) => p.variacoes).filter((v) => v.codigo && ehCodigoInterno(v.codigo)).length;

    el.innerHTML = `
      <div class="nao-imprimir">
        <a class="voltar" href="#/produtos">${icones.voltar} Produtos</a>
        <header class="cab"><div><h1>Folha de códigos</h1>
          <p class="sub">Para deixar no balcão: o leitor lê o código direto do papel. ${internos} ${internos === 1 ? 'item tem código interno' : 'itens têm código interno'} (sem código na embalagem).</p></div>
          <button type="button" class="btn primario" id="imprimir" ${itens.length ? '' : 'disabled'}>${icones.imprimir} Imprimir</button>
        </header>
        <div class="cartao opcoes-folha">
          <div class="segmentos" role="radiogroup" aria-label="Quais códigos">
            <label><input type="radio" name="quais" value="internos" ${opcoes.todos ? '' : 'checked'}><span>Só códigos internos</span></label>
            <label><input type="radio" name="quais" value="todos" ${opcoes.todos ? 'checked' : ''}><span>Todos os códigos</span></label>
          </div>
          <label class="interruptor"><span>Mostrar preço</span><input type="checkbox" id="preco" ${opcoes.preco ? 'checked' : ''}></label>
          <label class="interruptor"><span>Incluir produtos fora da venda</span><input type="checkbox" id="inativos" ${opcoes.inativos ? 'checked' : ''}></label>
        </div>
        <p class="sub nota-folha">Na janela de impressão, escolha a impressora ou "Salvar como PDF". Tamanho A4, sem ajustar à página (100%), para o leitor ler bem.</p>
      </div>
      ${itens.length ? `<div class="folha-codigos">
        <div class="folha-titulo">Coline · códigos dos produtos <span>${new Date().toLocaleDateString('pt-BR')}</span></div>
        ${ordenados.map(([cat, lista]) => `
          <section class="folha-grupo">
            <h2>${esc(cat)}</h2>
            <div class="folha-grade">${lista.map(({ p, v }) => `
              <div class="etiqueta-codigo">
                <div class="ec-nome"><strong>${esc(p.nome)}</strong>${v.nome ? ` <span>${esc(v.nome)}</span>` : ''}</div>
                ${opcoes.preco ? `<div class="ec-preco">${dinheiro(v.preco ?? p.preco)}</div>` : ''}
                ${svgEAN13(v.codigo)}
              </div>`).join('')}</div>
          </section>`).join('')}
      </div>` : `<div class="cartao vazio"><div class="simbolo" aria-hidden="true">在庫</div><h2>Nenhum código para imprimir</h2>
        <p>${opcoes.todos ? 'Nenhum produto tem código de barras cadastrado.' : 'Nenhum produto usa código interno. Escolha "Todos os códigos" para incluir os de fábrica.'}</p></div>`}`;

    el.querySelectorAll('input[name="quais"]').forEach((r) => r.addEventListener('change', () => { opcoes.todos = r.value === 'todos'; gravarOpcoes(opcoes); desenhar(); }));
    el.querySelector('#preco').addEventListener('change', (e) => { opcoes.preco = e.target.checked; gravarOpcoes(opcoes); desenhar(); });
    el.querySelector('#inativos').addEventListener('change', (e) => { opcoes.inativos = e.target.checked; gravarOpcoes(opcoes); desenhar(); });
    el.querySelector('#imprimir').addEventListener('click', () => window.print());
  }
  desenhar();
}
