// =========================================================
// Preços do evento (Eventos → evento → Preços deste evento).
// Preço especial de cada item só neste evento. Campo vazio = vale o
// preço normal do cadastro. Fica dentro do próprio evento, então vai
// para os outros aparelhos junto com o pacote.
// As mudanças ficam num rascunho: cada item alterado mostra o valor
// de antes, e nada é gravado até tocar em "Salvar alterações".
// Sair da tela com mudanças pendentes pede confirmação.
// =========================================================
import { db, listarProdutosCompletos } from '../db.js';
import { esc, dinheiro, icones, aviso, confirmar, campoDinheiro, campoPercentual, lerCentavos, escreverCentavos, abrirJanela, percentual, saida } from '../ui.js';

export async function render(el, { id }) {
  const evento = await db.eventos.get(id);
  if (!evento) { location.replace('#/eventos'); return; }
  const produtos = (await listarProdutosCompletos()).filter((p) => p.variacoes.length);
  let salvos = { ...(evento.precos || {}) };      // o que está gravado
  let rascunho = { ...salvos };                    // o que está na tela
  let busca = '';
  let soAlterados = false;

  const base = (p, v) => v.preco ?? p.preco;
  const daVariacao = new Map();
  for (const p of produtos) for (const v of p.variacoes) daVariacao.set(v.id, { p, v });
  const alterado = (vid) => (rascunho[vid] ?? null) !== (salvos[vid] ?? null);
  const alterados = () => [...daVariacao.keys()].filter(alterado);
  // Grava no rascunho: vazio ou igual ao normal = sem preço especial
  const definir = (vid, valor) => {
    const { p, v } = daVariacao.get(vid);
    if (valor == null || valor === base(p, v)) delete rascunho[vid]; else rascunho[vid] = valor;
  };

  el.innerHTML = `
    <a class="voltar" href="#/eventos/${encodeURIComponent(id)}">${icones.voltar} ${esc(evento.nome)}</a>
    <header class="cab"><div><h1>Preços deste evento</h1>
      <p class="sub">Preço especial só em "${esc(evento.nome)}". Campo vazio = preço normal. Confira as mudanças e toque em Salvar.</p></div></header>
    <section class="cartao">
      <div class="cab-cartao"><h2>Ações rápidas</h2><strong class="num" id="resumo-precos"></strong></div>
      <div class="acoes">
        <button type="button" class="btn" id="percentual">% de desconto em tudo</button>
        <button type="button" class="btn texto perigo" id="limpar">Voltar tudo ao preço normal</button>
      </div>
      <p class="sub nota-mov">Depois de salvar, envie o pacote de novo aos outros aparelhos (Mais → Preparar outros aparelhos).</p>
      <label class="busca" style="margin-top:12px"><span class="oculto">Buscar produto</span>${icones.busca}
        <input class="entrada" id="busca" type="search" placeholder="Buscar produto" autocomplete="off"></label>
    </section>
    <div id="lista"></div>
    <div class="barra-rascunho" id="barra" hidden>
      <div class="br-texto"><strong id="br-qtd"></strong>
        <label class="br-filtro"><input type="checkbox" id="so-alterados"> Mostrar só os alterados</label></div>
      <div class="br-botoes">
        <button type="button" class="btn" id="desfazer">Desfazer</button>
        <button type="button" class="btn primario" id="salvar">Salvar alterações</button>
      </div>
    </div>`;

  function atualizarBarra() {
    const n = alterados().length;
    const q = Object.keys(rascunho).length;
    el.querySelector('#resumo-precos').textContent = q ? `${q} ${q === 1 ? 'item com preço especial' : 'itens com preço especial'}` : 'Todos com preço normal';
    el.querySelector('#barra').hidden = n === 0;
    el.querySelector('#br-qtd').textContent = `${n} ${n === 1 ? 'alteração não salva' : 'alterações não salvas'}`;
    if (!n && soAlterados) { soAlterados = false; el.querySelector('#so-alterados').checked = false; desenhar(); }
  }

  function marcar(li) {
    const vid = li.dataset.variacao;
    const { p, v } = daVariacao.get(vid);
    const valor = rascunho[vid];
    const b = base(p, v);
    const dif = li.querySelector('[data-dif]');
    li.classList.toggle('com-preco', valor != null);
    li.classList.toggle('alterado', alterado(vid));
    dif.className = 'le-dif ' + (valor == null ? '' : valor < b ? 'confere' : valor > b ? 'sobra' : '');
    dif.textContent = valor == null ? '' : `${valor < b ? '−' : '+'}${Math.round(Math.abs(1 - valor / b) * 100)}%`;
    const antes = li.querySelector('[data-antes]');
    antes.hidden = !alterado(vid);
    antes.querySelector('span').innerHTML = `antes: <s>${salvos[vid] != null ? dinheiro(salvos[vid]) : 'normal'}</s>`;
  }

  function desenhar() {
    const t = busca.toLowerCase();
    const lista = produtos
      .map((p) => ({ p, vs: p.variacoes.filter((v) => !soAlterados || alterado(v.id)) }))
      .filter(({ p, vs }) => vs.length && (!t || p.nome.toLowerCase().includes(t) || vs.some((v) => (v.nome || '').toLowerCase().includes(t))));
    el.querySelector('#lista').innerHTML = lista.length ? lista.map(({ p, vs }) => `
      <section class="cartao grupo-estoque">
        <h3>${esc(p.nome)}${p.ativo ? '' : ' <span class="etiqueta">fora da venda</span>'}</h3>
        <ul class="linhas-estoque">${vs.map((v) => `
          <li data-variacao="${esc(v.id)}">
            <span class="le-nome">${esc(v.nome || 'Único')}<span class="sub num">normal: ${dinheiro(base(p, v))}</span>
              <span class="antes-preco num" data-antes hidden><span></span> <button type="button" class="btn texto mini" data-desfazer-item>desfazer</button></span></span>
            <span class="le-dif" data-dif></span>
            <input class="entrada num preco-evento" inputmode="numeric" aria-label="Preço no evento de ${esc(p.nome)} ${esc(v.nome || '')}">
          </li>`).join('')}</ul>
      </section>`).join('') : `<div class="cartao"><p class="sub">${soAlterados ? 'Nenhuma alteração pendente.' : 'Nenhum produto encontrado.'}</p></div>`;
    el.querySelectorAll('[data-variacao]').forEach((li) => {
      const vid = li.dataset.variacao;
      const campo = li.querySelector('.preco-evento');
      campoDinheiro(campo);
      campo.placeholder = 'normal';
      escreverCentavos(campo, rascunho[vid] ?? null);
      // Cada tecla atualiza o rascunho (nada é gravado ainda)
      campo.addEventListener('input', () => { definir(vid, lerCentavos(campo)); marcar(li); atualizarBarra(); });
      // Ao sair do campo: preço igual ao normal vira campo vazio
      campo.addEventListener('blur', () => { if (rascunho[vid] == null) escreverCentavos(campo, null); });
      li.querySelector('[data-desfazer-item]').addEventListener('click', () => {
        definir(vid, salvos[vid] ?? null);
        escreverCentavos(campo, rascunho[vid] ?? null);
        marcar(li); atualizarBarra();
      });
      marcar(li);
    });
  }

  el.querySelector('#busca').addEventListener('input', (e) => { busca = e.target.value.trim(); desenhar(); });
  el.querySelector('#so-alterados').addEventListener('change', (e) => { soAlterados = e.target.checked; desenhar(); });
  el.querySelector('#limpar').addEventListener('click', () => {
    if (!Object.keys(rascunho).length) { aviso('Todos os itens já estão com o preço normal.'); return; }
    for (const k of Object.keys(rascunho)) delete rascunho[k];
    desenhar(); atualizarBarra();
    aviso('Preços especiais retirados. Confira e toque em Salvar alterações.');
  });
  el.querySelector('#percentual').addEventListener('click', async () => {
    const pct = await pedirPercentual();
    if (!pct) return;
    for (const { p, v } of daVariacao.values()) definir(v.id, Math.round((base(p, v) * (10000 - pct)) / 10000));
    desenhar(); atualizarBarra();
    aviso(`${percentual(pct)} de desconto calculado em todos os itens. Confira e toque em Salvar alterações.`);
  });
  el.querySelector('#desfazer').addEventListener('click', async () => {
    const n = alterados().length;
    if (!(await confirmar({ titulo: 'Desfazer as alterações?', texto: `${n} ${n === 1 ? 'preço volta' : 'preços voltam'} ao que estava salvo.`, botao: 'Desfazer', perigo: true }))) return;
    rascunho = { ...salvos };
    desenhar(); atualizarBarra();
  });
  el.querySelector('#salvar').addEventListener('click', async () => {
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    const n = alterados().length;
    await db.eventos.update(id, { precos: { ...rascunho } });
    salvos = { ...rascunho };
    desenhar(); atualizarBarra();
    aviso(`${n} ${n === 1 ? 'preço salvo' : 'preços salvos'}.`);
  });

  saida.pendente = () => alterados().length > 0;
  desenhar();
  atualizarBarra();
  return () => { saida.pendente = null; };
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
