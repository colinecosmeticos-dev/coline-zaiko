// =========================================================
// Preços do evento (Eventos → evento → Preços deste evento).
// Preço especial de cada item só neste evento. Campo vazio = vale o
// preço normal do cadastro. Salva sozinho, dentro do próprio evento,
// então vai para os outros aparelhos junto com o pacote.
// =========================================================
import { db, listarProdutosCompletos } from '../db.js';
import { esc, dinheiro, icones, aviso, confirmar, campoDinheiro, campoPercentual, lerCentavos, escreverCentavos, abrirJanela, percentual } from '../ui.js';

export async function render(el, { id }) {
  const evento = await db.eventos.get(id);
  if (!evento) { location.replace('#/eventos'); return; }
  const produtos = (await listarProdutosCompletos()).filter((p) => p.variacoes.length);
  const precos = { ...(evento.precos || {}) };
  let busca = '';

  const base = (p, v) => v.preco ?? p.preco;
  const gravar = async () => { await db.eventos.update(id, { precos: { ...precos } }); resumo(); };

  el.innerHTML = `
    <a class="voltar" href="#/eventos/${encodeURIComponent(id)}">${icones.voltar} ${esc(evento.nome)}</a>
    <header class="cab"><div><h1>Preços deste evento</h1>
      <p class="sub">Preço especial só em "${esc(evento.nome)}". Campo vazio = preço normal. Salva sozinho.</p></div></header>
    <section class="cartao">
      <div class="cab-cartao"><h2>Ações rápidas</h2><strong class="num" id="resumo-precos"></strong></div>
      <div class="acoes">
        <button type="button" class="btn" id="percentual">% de desconto em tudo</button>
        <button type="button" class="btn texto perigo" id="limpar">Voltar tudo ao preço normal</button>
      </div>
      <p class="sub nota-mov">Depois de mudar os preços, envie o pacote de novo aos outros aparelhos (Mais → Preparar outros aparelhos).</p>
      <label class="busca" style="margin-top:12px"><span class="oculto">Buscar produto</span>${icones.busca}
        <input class="entrada" id="busca" type="search" placeholder="Buscar produto" autocomplete="off"></label>
    </section>
    <div id="lista"></div>`;

  function resumo() {
    const n = Object.keys(precos).length;
    el.querySelector('#resumo-precos').textContent = n ? `${n} ${n === 1 ? 'item com preço especial' : 'itens com preço especial'}` : 'Todos com preço normal';
  }

  function desenhar() {
    const t = busca.toLowerCase();
    const lista = produtos.filter((p) => !t || p.nome.toLowerCase().includes(t) || p.variacoes.some((v) => (v.nome || '').toLowerCase().includes(t)));
    el.querySelector('#lista').innerHTML = lista.length ? lista.map((p) => `
      <section class="cartao grupo-estoque">
        <h3>${esc(p.nome)}${p.ativo ? '' : ' <span class="etiqueta">fora da venda</span>'}</h3>
        <ul class="linhas-estoque">${p.variacoes.map((v) => `
          <li data-variacao="${esc(v.id)}">
            <span class="le-nome">${esc(v.nome || 'Único')}<span class="sub num">normal: ${dinheiro(base(p, v))}</span></span>
            <span class="le-dif" data-dif></span>
            <input class="entrada num preco-evento" aria-label="Preço no evento de ${esc(p.nome)} ${esc(v.nome || '')}">
          </li>`).join('')}</ul>
      </section>`).join('') : '<div class="cartao"><p class="sub">Nenhum produto encontrado.</p></div>';
    el.querySelectorAll('[data-variacao]').forEach((li) => {
      const vid = li.dataset.variacao;
      const p = produtos.find((x) => x.variacoes.some((v) => v.id === vid));
      const v = p.variacoes.find((x) => x.id === vid);
      const campo = li.querySelector('.preco-evento');
      campoDinheiro(campo);
      campo.placeholder = 'normal';
      escreverCentavos(campo, precos[vid] ?? null);
      const marcar = () => {
        const valor = precos[vid];
        const b = base(p, v);
        const dif = li.querySelector('[data-dif]');
        li.classList.toggle('com-preco', valor != null);
        dif.className = 'le-dif ' + (valor == null ? '' : valor < b ? 'confere' : valor > b ? 'sobra' : '');
        dif.textContent = valor == null ? '' : valor === b ? 'igual ao normal' : `${valor < b ? '−' : '+'}${Math.round(Math.abs(1 - valor / b) * 100)}%`;
      };
      // O campo de dinheiro formata sozinho (o navegador não avisa "change"):
      // salva quando o campo perde o foco, se o valor mudou
      campo.addEventListener('blur', async () => {
        const valor = lerCentavos(campo);
        if ((valor ?? null) === (precos[vid] ?? null)) return;
        if (valor == null || valor === base(p, v)) delete precos[vid]; else precos[vid] = valor;
        if (valor === base(p, v)) escreverCentavos(campo, null);
        marcar(); await gravar();
      });
      marcar();
    });
  }

  el.querySelector('#busca').addEventListener('input', (e) => { busca = e.target.value.trim(); desenhar(); });
  el.querySelector('#limpar').addEventListener('click', async () => {
    if (!Object.keys(precos).length) return;
    if (!(await confirmar({ titulo: 'Voltar tudo ao preço normal?', texto: 'Todos os preços especiais deste evento serão apagados.', botao: 'Voltar ao normal', perigo: true }))) return;
    for (const k of Object.keys(precos)) delete precos[k];
    await gravar(); desenhar();
    aviso('Preços do evento apagados.');
  });
  el.querySelector('#percentual').addEventListener('click', async () => {
    const pct = await pedirPercentual();
    if (!pct) return;
    for (const p of produtos) for (const v of p.variacoes) precos[v.id] = Math.round((base(p, v) * (10000 - pct)) / 10000);
    await gravar(); desenhar();
    aviso(`${percentual(pct)} de desconto aplicado em todos os itens.`);
  });

  desenhar();
  resumo();
}

function pedirPercentual() {
  return new Promise((resolver) => {
    let valor = null;
    const d = abrirJanela(`
      <form method="dialog" novalidate>
        <h2>Desconto em tudo</h2>
        <p>Calcula o preço do evento de todos os itens a partir do preço normal. Depois dá para ajustar item a item.</p>
        <div class="campo" style="margin-top:12px"><label for="pct">Desconto</label><input class="entrada entrada-grande" id="pct"></div>
        <div class="acoes"><button type="button" class="btn" id="voltar">Cancelar</button><button type="submit" class="btn primario">Aplicar</button></div>
      </form>`, { aoFechar: () => resolver(valor) });
    const campo = d.querySelector('#pct');
    campoPercentual(campo);
    campo.placeholder = '0,00 %';
    d.querySelector('#voltar').addEventListener('click', () => d.close());
    d.querySelector('form').addEventListener('submit', (e) => {
      e.preventDefault();
      const v = lerCentavos(campo);
      if (!v || v >= 10000) { aviso('Informe um desconto entre 0,01% e 99,99%.', { tipo: 'erro' }); return; }
      valor = v; d.close();
    });
    campo.focus();
  });
}
