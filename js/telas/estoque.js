// =========================================================
// Tela Estoque do evento (Mais → Estoque do evento). Três abas:
//   Levado  — quanto de cada item vai para o evento (no aparelho principal).
//             Botões − / +, digitar, ou ler o código: cada leitura soma 1.
//   Brindes e avarias — saídas sem venda (brinde/doação e produto com defeito),
//             em qualquer aparelho; vão para o principal ao juntar as vendas.
//   Sobra   — levado − vendido − brindes − avarias + itens que voltaram.
//   Contagem final — o que sobrou de verdade, contado no fim; mostra a
//             diferença em relação à sobra calculada.
// =========================================================
import { db, lerEventoAtivo, lerAparelho, listarProdutosCompletos, buscarPorCodigo, lerLevado, gravarLevado, adicionarSaida, cancelarSaida, lerContado, gravarContado } from '../db.js';
import { esc, icones, aviso, abrirJanela, confirmar, dinheiro } from '../ui.js';
import { ouvirLeitor } from '../leitor.js';
import { som } from '../sons.js';
import { calcularEstoque } from '../estoque/calculo.js';

let aba = 'levado';   // lembrada enquanto o app está aberto
const hora = (iso) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const pecas = (n) => `${n.toLocaleString('pt-BR')} ${n === 1 ? 'peça' : 'peças'}`;

export async function render(el) {
  const evento = await lerEventoAtivo();
  const voltar = `<a class="voltar" href="#/mais">${icones.voltar} Mais</a>`;
  if (!evento) {
    el.innerHTML = `${voltar}<header class="cab"><h1>Estoque do evento</h1></header>
      <div class="cartao vazio"><div class="simbolo" aria-hidden="true">在庫</div><h2>Escolha o evento</h2><p>O estoque é registrado por evento.</p><a class="btn primario" href="#/eventos">Ir para Eventos</a></div>`;
    return;
  }
  const produtos = await listarProdutosCompletos();
  el.innerHTML = `
    ${voltar}
    <header class="cab"><div><h1>Estoque do evento</h1><p class="sub">${esc(evento.nome)}</p></div></header>
    <div class="segmentos abas-estoque" role="tablist" aria-label="Estoque">
      <label><input type="radio" name="aba" value="levado" ${aba === 'levado' ? 'checked' : ''}><span>Levado</span></label>
      <label><input type="radio" name="aba" value="saidas" ${aba === 'saidas' ? 'checked' : ''}><span>Brindes e avarias</span></label>
      <label><input type="radio" name="aba" value="sobra" ${aba === 'sobra' ? 'checked' : ''}><span>Sobra</span></label>
      <label><input type="radio" name="aba" value="contagem" ${aba === 'contagem' ? 'checked' : ''}><span>Contagem final</span></label>
    </div>
    <div id="conteudo"></div>`;
  let pararLeitor = null;
  const conteudo = el.querySelector('#conteudo');
  const desenhar = async () => {
    if (pararLeitor) { pararLeitor(); pararLeitor = null; }
    if (aba === 'levado') pararLeitor = await abaLevado(conteudo, evento, produtos);
    else if (aba === 'saidas') await abaSaidas(conteudo, evento, produtos);
    else if (aba === 'contagem') pararLeitor = await abaContagem(conteudo, evento, produtos);
    else await abaSobra(conteudo, evento, produtos);
  };
  el.querySelectorAll('input[name="aba"]').forEach((r) => r.addEventListener('change', () => { aba = r.value; desenhar(); }));
  await desenhar();
  return () => { if (pararLeitor) pararLeitor(); };
}

// ---------- Levado ----------
async function abaLevado(el, evento, produtos) {
  const levado = await lerLevado(evento.id);
  const comVariacoes = produtos.filter((p) => p.variacoes.length);
  let busca = '';
  el.innerHTML = `
    <section class="cartao">
      <div class="cab-cartao"><h2>Quanto vai para o evento</h2><strong class="num" id="total-levado"></strong></div>
      <p class="sub">Use − e +, digite a quantidade, ou leia o código com o leitor: cada leitura soma 1. Salva sozinho.</p>
      <label class="busca" style="margin-top:12px"><span class="oculto">Buscar produto</span>${icones.busca}
        <input class="entrada" id="busca-levado" type="search" placeholder="Buscar produto" autocomplete="off"></label>
    </section>
    <div id="lista-levado"></div>`;
  const total = () => { el.querySelector('#total-levado').textContent = pecas([...levado.values()].reduce((s, n) => s + n, 0)); };

  function desenharLista() {
    const t = busca.toLowerCase();
    const lista = comVariacoes.filter((p) => !t || p.nome.toLowerCase().includes(t) || p.variacoes.some((v) => (v.nome || '').toLowerCase().includes(t) || (v.codigo || '').includes(t)));
    el.querySelector('#lista-levado').innerHTML = lista.length ? lista.map((p) => `
      <section class="cartao grupo-estoque">
        <h3>${esc(p.nome)}${p.ativo ? '' : ' <span class="etiqueta">fora da venda</span>'}</h3>
        <ul class="linhas-estoque">${p.variacoes.map((v) => `
          <li data-variacao="${esc(v.id)}">
            <span class="le-nome">${esc(v.nome || 'Único')}<span class="sub num">${esc(v.codigo || '')}</span></span>
            <span class="quantidade pequena">
              <button type="button" class="btn-icone" data-menos aria-label="Menos">−</button>
              <input class="entrada num le-qtd" type="number" inputmode="numeric" min="0" step="1" value="${levado.get(v.id) || ''}" placeholder="0" aria-label="Quantidade levada de ${esc(p.nome)} ${esc(v.nome || '')}">
              <button type="button" class="btn-icone" data-mais aria-label="Mais">+</button>
            </span>
          </li>`).join('')}</ul>
      </section>`).join('') : '<div class="cartao"><p class="sub">Nenhum produto encontrado.</p></div>';
  }
  async function definir(variacaoId, n) {
    n = Math.max(0, Math.floor(Number(n) || 0));
    if (n) levado.set(variacaoId, n); else levado.delete(variacaoId);
    await gravarLevado(evento.id, variacaoId, n);
    const campo = el.querySelector(`[data-variacao="${CSS.escape(variacaoId)}"] .le-qtd`);
    if (campo && document.activeElement !== campo) campo.value = n || '';
    total();
  }
  el.querySelector('#lista-levado').addEventListener('click', (e) => {
    const li = e.target.closest('[data-variacao]');
    if (!li) return;
    const atual = levado.get(li.dataset.variacao) || 0;
    if (e.target.closest('[data-mais]')) definir(li.dataset.variacao, atual + 1);
    if (e.target.closest('[data-menos]')) definir(li.dataset.variacao, atual - 1);
  });
  el.querySelector('#lista-levado').addEventListener('change', (e) => {
    const li = e.target.closest('[data-variacao]');
    if (li && e.target.classList.contains('le-qtd')) definir(li.dataset.variacao, e.target.value);
  });
  // Leitor com o campo de quantidade selecionado: o código "cai" no campo.
  // Um número longo seguido de Enter é tratado como leitura, não como quantidade.
  el.querySelector('#lista-levado').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || !e.target.classList.contains('le-qtd')) return;
    e.preventDefault();
    const li = e.target.closest('[data-variacao]');
    const valor = e.target.value.trim();
    if (valor.length >= 6) {
      // Se o código veio grudado na quantidade que já estava no campo, separa
      const anterior = String(levado.get(li.dataset.variacao) || '');
      e.target.value = anterior;
      e.target.blur();
      (async () => {
        const candidatos = [valor];
        if (anterior && valor.startsWith(anterior)) candidatos.push(valor.slice(anterior.length));
        if (anterior && valor.endsWith(anterior)) candidatos.push(valor.slice(0, -anterior.length));
        let codigo = valor;
        for (const c of candidatos) if (await buscarPorCodigo(c)) { codigo = c; break; }
        lerCodigo(codigo);
      })();
    } else e.target.blur();
  });
  // Ao tocar no campo, a quantidade fica selecionada: digitar substitui
  el.querySelector('#lista-levado').addEventListener('focusin', (e) => {
    if (e.target.classList.contains('le-qtd')) requestAnimationFrame(() => e.target.select());
  });
  el.querySelector('#busca-levado').addEventListener('input', (e) => { busca = e.target.value.trim(); desenharLista(); });
  // Busca com Enter: se for um código, soma 1 nele
  el.querySelector('#busca-levado').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const valor = e.target.value.trim();
    if (/^\d{6,}$/.test(valor)) lerCodigo(valor);
  });
  desenharLista();
  total();

  // Leitor: cada leitura soma 1 no item
  async function lerCodigo(codigo) {
    if (document.querySelector('dialog[open]')) return;
    const v = await buscarPorCodigo(codigo);
    if (!v) { som.erro(); aviso(`Código ${codigo} não cadastrado.`, { tipo: 'erro' }); return; }
    if (busca) { busca = ''; el.querySelector('#busca-levado').value = ''; desenharLista(); }
    await definir(v.id, (levado.get(v.id) || 0) + 1);
    som.item();
    const li = el.querySelector(`[data-variacao="${CSS.escape(v.id)}"]`);
    if (li) { li.classList.remove('lido'); void li.offsetWidth; li.classList.add('lido'); li.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
  }
  return ouvirLeitor(lerCodigo);
}

// ---------- Brindes e avarias ----------
async function abaSaidas(el, evento, produtos) {
  const aqui = await lerAparelho();
  const saidas = (await db.saidas.where('eventoId').equals(evento.id).toArray()).sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));
  el.innerHTML = `
    <section class="cartao">
      <h2>Saídas sem venda</h2>
      <p class="sub">Brinde ou doação fora de uma venda (ex.: sorteio) e produto com defeito encontrado no estoque. Brinde dentro de uma venda e devolução com defeito já entram sozinhos.</p>
      <div class="acoes"><button type="button" class="btn" id="nova-brinde">${icones.mais} Brinde ou doação</button><button type="button" class="btn" id="nova-avaria">${icones.mais} Avaria</button></div>
    </section>
    <section class="cartao">
      <h2>Lançadas neste evento</h2>
      ${saidas.length ? `<ul class="lista-movimentos">${saidas.map((s) => `
        <li class="mov saida${s.status === 'cancelado' ? ' cancelado' : ''}">
          <span class="etiqueta ${s.tipo === 'avaria' ? 'erro' : 'marca'}">${s.tipo === 'avaria' ? 'Avaria' : 'Brinde'}</span>
          <span class="mov-desc"><strong class="num">${s.quantidade}×</strong> ${esc(s.nome)}${s.variacaoNome ? ` <span class="sub">${esc(s.variacaoNome)}</span>` : ''}
            <br><span class="sub">${esc(s.motivo)} · ${hora(s.criadoEm)}${s.aparelho ? ` · ${esc(s.aparelho.sigla)}` : ''}</span>${s.status === 'cancelado' ? ' <span class="etiqueta erro">Cancelado</span>' : ''}</span>
          <span></span>
          ${s.status !== 'cancelado' && (!s.aparelho || !aqui || s.aparelho.id === aqui.id) ? `<button type="button" class="btn-icone" data-cancelar="${esc(s.id)}" aria-label="Cancelar">${icones.fechar}</button>` : '<span></span>'}
        </li>`).join('')}</ul>` : '<p class="sub">Nenhuma saída lançada.</p>'}
    </section>`;
  const recarregar = () => abaSaidas(el, evento, produtos);
  el.querySelector('#nova-brinde').addEventListener('click', async () => { if (await pedirSaida(evento, produtos, 'brinde')) { aviso('Brinde registrado.'); recarregar(); } });
  el.querySelector('#nova-avaria').addEventListener('click', async () => { if (await pedirSaida(evento, produtos, 'avaria')) { aviso('Avaria registrada.'); recarregar(); } });
  el.querySelectorAll('[data-cancelar]').forEach((b) => b.addEventListener('click', async () => {
    if (!(await confirmar({ titulo: 'Cancelar esta saída?', texto: 'Use quando foi lançada errado. Ela fica na lista, riscada.', botao: 'Cancelar saída', cancelar: 'Voltar', perigo: true }))) return;
    await cancelarSaida(b.dataset.cancelar);
    recarregar();
  }));
}

function pedirSaida(evento, produtos, tipo) {
  const ehAvaria = tipo === 'avaria';
  const opcoes = produtos.flatMap((p) => p.variacoes.map((v) => ({ p, v, texto: `${p.nome} ${v.nome || ''} ${v.codigo || ''}`.toLowerCase() })));
  return new Promise((resolver) => {
    let feito = null, escolhido = null, qtd = 1;
    const d = abrirJanela(`
      <form method="dialog" class="form-movimento" novalidate>
        <h2>${ehAvaria ? 'Avaria' : 'Brinde ou doação'}</h2>
        <p>${ehAvaria ? 'Produto com defeito que sai do estoque.' : 'Produto que sai sem venda (sorteio, doação, cortesia).'}</p>
        <div class="campo"><label for="busca-saida">Produto</label>
          <input class="entrada" id="busca-saida" type="search" placeholder="Buscar ou ler o código" autocomplete="off">
          <div class="opcoes-produto" id="opcoes-produto"></div>
          <div class="escolhido" id="escolhido" hidden></div></div>
        <div class="linha-campos">
          <div class="campo"><span class="rotulo">Quantidade</span>
            <span class="quantidade pequena"><button type="button" class="btn-icone" id="menos" aria-label="Menos">−</button><strong class="num" id="qtd">1</strong><button type="button" class="btn-icone" id="mais" aria-label="Mais">+</button></span></div>
          <div class="campo"><label for="motivo">Motivo</label><input class="entrada" id="motivo" maxlength="140" autocomplete="off" placeholder="${ehAvaria ? 'Ex.: frasco vazando' : 'Ex.: sorteio no Instagram'}"></div>
        </div>
        <div class="acoes"><button type="button" class="btn" id="voltar">Voltar</button><button type="submit" class="btn primario" id="confirmar" disabled>Escolha o produto</button></div>
      </form>`, { classe: 'janela-movimento', aoFechar: () => resolver(feito) });
    const $ = (s) => d.querySelector(s);
    const conferir = () => {
      $('#qtd').textContent = qtd;
      const falta = !escolhido ? 'Escolha o produto' : !$('#motivo').value.trim() ? 'Informe o motivo' : '';
      $('#confirmar').disabled = !!falta;
      $('#confirmar').textContent = falta || `Registrar ${qtd} ${qtd === 1 ? 'peça' : 'peças'}`;
    };
    const escolher = (o) => {
      escolhido = o;
      $('#opcoes-produto').innerHTML = '';
      $('#busca-saida').value = '';
      $('#escolhido').hidden = false;
      $('#escolhido').innerHTML = `<strong>${esc(o.p.nome)}</strong>${o.v.nome ? ` <span class="sub">${esc(o.v.nome)}</span>` : ''} <button type="button" class="btn texto" id="trocar-produto">Trocar</button>`;
      $('#trocar-produto').addEventListener('click', () => { escolhido = null; $('#escolhido').hidden = true; $('#busca-saida').focus(); conferir(); });
      conferir();
    };
    $('#busca-saida').addEventListener('input', (e) => {
      const t = e.target.value.trim().toLowerCase();
      const achados = t ? opcoes.filter((o) => o.texto.includes(t)).slice(0, 8) : [];
      $('#opcoes-produto').innerHTML = achados.map((o, i) => `<button type="button" class="btn opcao-produto" data-i="${opcoes.indexOf(o)}">${esc(o.p.nome)}${o.v.nome ? ` <span class="sub">${esc(o.v.nome)}</span>` : ''}</button>`).join('');
    });
    // Leitor dentro do campo: o código chega com Enter
    $('#busca-saida').addEventListener('keydown', async (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const codigo = e.target.value.trim();
      const v = codigo && await buscarPorCodigo(codigo);
      const o = v && opcoes.find((x) => x.v.id === v.id);
      if (o) { som.item(); escolher(o); } else if (codigo) { som.erro(); aviso(`Código ${codigo} não cadastrado.`, { tipo: 'erro' }); }
    });
    $('#opcoes-produto').addEventListener('click', (e) => { const b = e.target.closest('[data-i]'); if (b) escolher(opcoes[Number(b.dataset.i)]); });
    $('#menos').addEventListener('click', () => { if (qtd > 1) { qtd -= 1; conferir(); } });
    $('#mais').addEventListener('click', () => { qtd += 1; conferir(); });
    $('#motivo').addEventListener('input', conferir);
    $('#voltar').addEventListener('click', () => d.close());
    $('form').addEventListener('submit', async (e) => {
      e.preventDefault();
      if ($('#confirmar').disabled) return;
      feito = await adicionarSaida({
        eventoId: evento.id, tipo, quantidade: qtd, motivo: $('#motivo').value.trim(),
        variacaoId: escolhido.v.id, produtoId: escolhido.p.id, nome: escolhido.p.nome, variacaoNome: escolhido.v.nome || '',
        custoUnit: escolhido.v.custo ?? escolhido.p.custo ?? null
      });
      d.close();
    });
    conferir();
  });
}

// ---------- Sobra ----------
async function abaSobra(el, evento, produtos) {
  const [levado, registros, saidas, contado] = await Promise.all([
    lerLevado(evento.id),
    db.vendas.where('eventoId').equals(evento.id).toArray(),
    db.saidas.where('eventoId').equals(evento.id).toArray(),
    lerContado(evento.id)
  ]);
  const { linhas, totais, negativas } = calcularEstoque({ produtos, levado, registros, saidas, contado });
  const comContagem = contado.size > 0;
  const siglas = [...new Set(registros.map((r) => r.aparelho?.sigla).filter(Boolean))];
  const kpi = (rotulo, n, classe = '') => `<div class="kpi ${classe}"><span>${rotulo}</span><strong class="num">${n.toLocaleString('pt-BR')}</strong></div>`;
  el.innerHTML = `
    <p class="sub nota-sobra">Conta as vendas ${siglas.length ? `de ${siglas.join(', ')}` : 'deste aparelho'} que estão aqui. Para incluir as dos outros aparelhos, busque as vendas dos caixas antes (Sincronizar → Buscar vendas dos caixas).</p>
    <div class="kpis kpis-6">
      ${kpi('Levado', totais.levado)}${kpi('Vendido', totais.vendido)}${kpi('Brindes', totais.brindes)}${kpi('Avarias', totais.avarias)}${kpi('Voltaram', totais.voltaram)}${kpi('Sobra', totais.sobra, 'destaque')}
    </div>
    ${negativas ? `<p class="aviso-inline">${negativas} ${negativas === 1 ? 'item ficou' : 'itens ficaram'} com sobra negativa: provavelmente a quantidade levada foi registrada a menos.</p>` : ''}
    ${!totais.levado ? '<p class="aviso-inline">Nenhuma quantidade levada registrada: a sobra só faz sentido depois de preencher a aba Levado.</p>' : ''}
    <section class="cartao">
      ${linhas.length ? `<div class="tabela-rolagem"><table class="tabela-painel tabela-estoque">
        <thead><tr><th>Produto</th><th class="num">Levado</th><th class="num">Vendido</th><th class="num">Brindes</th><th class="num">Avarias</th><th class="num">Voltaram</th><th class="num">Sobra</th>${comContagem ? '<th class="num">Contado</th><th class="num">Diferença</th>' : ''}</tr></thead>
        <tbody>${linhas.map((l) => `<tr class="${l.sobra < 0 ? 'negativa' : ''}">
          <td>${esc(l.produto)}${l.variacao ? ` <span class="sub">${esc(l.variacao)}</span>` : ''}</td>
          <td class="num">${l.levado}</td><td class="num">${l.vendido}</td><td class="num">${l.brindes || ''}</td><td class="num">${l.avarias || ''}</td><td class="num">${l.voltaram || ''}</td>
          <td class="num sobra">${l.sobra}</td>${comContagem ? `<td class="num">${l.contado ?? '–'}</td><td class="num ${l.diferenca < 0 ? 'negativo' : ''}">${l.diferenca == null ? '' : l.diferenca > 0 ? `+${l.diferenca}` : l.diferenca}</td>` : ''}</tr>`).join('')}</tbody>
      </table></div>` : '<p class="sub">Nada levado nem vendido neste evento ainda.</p>'}
    </section>`;
}

// ---------- Contagem final ----------
async function abaContagem(el, evento, produtos) {
  const [levado, registros, saidas, contado] = await Promise.all([
    lerLevado(evento.id),
    db.vendas.where('eventoId').equals(evento.id).toArray(),
    db.saidas.where('eventoId').equals(evento.id).toArray(),
    lerContado(evento.id)
  ]);
  const base = calcularEstoque({ produtos, levado, registros, saidas });
  // Itens do evento (levados ou movimentados) + o resto do catálogo, para achar algo inesperado
  const linhas = new Map(base.linhas.map((l) => [l.variacaoId, l]));
  for (const p of produtos) for (const v of p.variacoes) if (!linhas.has(v.id)) linhas.set(v.id, { variacaoId: v.id, produto: p.nome, variacao: v.nome || '', sobra: 0, levado: 0, custoUnit: v.custo ?? p.custo ?? null, foraDoEvento: true });
  const codigo = new Map();
  for (const p of produtos) for (const v of p.variacoes) codigo.set(v.id, v.codigo || '');
  let busca = '';

  el.innerHTML = `
    <section class="cartao">
      <div class="cab-cartao"><h2>Contagem final</h2><strong class="num" id="resumo-contagem"></strong></div>
      <p class="sub">No fim do evento, conte o que sobrou de cada item: use − e +, digite, ou leia o código de cada peça (cada leitura soma 1). Salva sozinho. Item sem número = ainda não contado.</p>
      <div class="placar placar-contagem" id="placar"></div>
      <div class="acoes" style="margin-top:8px">
        <label class="busca" style="flex:1 1 220px"><span class="oculto">Buscar produto</span>${icones.busca}
          <input class="entrada" id="busca-contagem" type="search" placeholder="Buscar produto" autocomplete="off"></label>
        <button type="button" class="btn texto perigo" id="limpar-contagem">Limpar contagem</button>
      </div>
    </section>
    <div id="lista-contagem"></div>`;

  const difTexto = (d) => d == null ? '' : d === 0 ? 'Confere' : d < 0 ? `Falta ${-d}` : `Sobra ${d}`;
  const difClasse = (d) => d == null ? '' : d === 0 ? 'confere' : d < 0 ? 'falta' : 'sobra';

  function resumo() {
    const lista = [...linhas.values()].filter((l) => !l.foraDoEvento || contado.has(l.variacaoId));
    const contados = lista.filter((l) => contado.has(l.variacaoId));
    let falta = 0, sobra = 0, valor = 0;
    for (const l of contados) {
      const d = contado.get(l.variacaoId) - l.sobra;
      if (d < 0) { falta -= d; valor += (l.custoUnit || 0) * -d; } else sobra += d;
    }
    el.querySelector('#resumo-contagem').textContent = `${contados.length} de ${lista.length} itens contados`;
    el.querySelector('#placar').innerHTML = `
      <div><span>Peças contadas</span><strong class="num">${contados.reduce((s, l) => s + contado.get(l.variacaoId), 0)}</strong></div>
      <div class="${falta ? 'falta' : 'confere'}"><span>Faltando</span><strong class="num">${falta}${valor ? ` · ${dinheiro(valor)}` : ''}</strong></div>
      <div class="${sobra ? 'sobra' : ''}"><span>Sobrando</span><strong class="num">${sobra}</strong></div>`;
  }

  function desenharLista() {
    const t = busca.toLowerCase();
    const visiveis = [...linhas.values()].filter((l) => (!l.foraDoEvento || contado.has(l.variacaoId) || t)
      && (!t || `${l.produto} ${l.variacao} ${codigo.get(l.variacaoId) || ''}`.toLowerCase().includes(t)));
    const grupos = new Map();
    for (const l of visiveis) { if (!grupos.has(l.produto)) grupos.set(l.produto, []); grupos.get(l.produto).push(l); }
    el.querySelector('#lista-contagem').innerHTML = grupos.size ? [...grupos.entries()].sort((a, b) => a[0].localeCompare(b[0], 'pt-BR')).map(([produto, ls]) => `
      <section class="cartao grupo-estoque">
        <h3>${esc(produto)}</h3>
        <ul class="linhas-estoque">${ls.map((l) => {
          const c = contado.has(l.variacaoId) ? contado.get(l.variacaoId) : null;
          const d = c == null ? null : c - l.sobra;
          return `<li data-variacao="${esc(l.variacaoId)}">
            <span class="le-nome">${esc(l.variacao || 'Único')}<span class="sub">calculado: ${l.sobra}${l.foraDoEvento ? ' · fora do evento' : ''}</span></span>
            <span class="le-dif ${difClasse(d)}" data-dif>${difTexto(d)}</span>
            <span class="quantidade pequena">
              <button type="button" class="btn-icone" data-menos aria-label="Menos">−</button>
              <input class="entrada num le-qtd" type="number" inputmode="numeric" min="0" step="1" value="${c ?? ''}" placeholder="–" aria-label="Contado de ${esc(produto)} ${esc(l.variacao)}">
              <button type="button" class="btn-icone" data-mais aria-label="Mais">+</button>
            </span>
          </li>`;
        }).join('')}</ul>
      </section>`).join('') : '<div class="cartao"><p class="sub">Nenhum item encontrado.</p></div>';
  }

  async function definir(variacaoId, n) {
    const valor = n === '' || n == null ? null : Math.max(0, Math.floor(Number(n) || 0));
    if (valor == null) contado.delete(variacaoId); else contado.set(variacaoId, valor);
    await gravarContado(evento.id, variacaoId, valor);
    const li = el.querySelector(`[data-variacao="${CSS.escape(variacaoId)}"]`);
    if (li) {
      const campo = li.querySelector('.le-qtd');
      if (document.activeElement !== campo) campo.value = valor ?? '';
      const d = valor == null ? null : valor - linhas.get(variacaoId).sobra;
      const dif = li.querySelector('[data-dif]');
      dif.textContent = difTexto(d); dif.className = `le-dif ${difClasse(d)}`;
    }
    resumo();
  }

  const lista = el.querySelector('#lista-contagem');
  lista.addEventListener('click', (e) => {
    const li = e.target.closest('[data-variacao]');
    if (!li) return;
    const atual = contado.get(li.dataset.variacao);
    if (e.target.closest('[data-mais]')) definir(li.dataset.variacao, (atual ?? 0) + 1);
    if (e.target.closest('[data-menos]')) definir(li.dataset.variacao, atual == null ? 0 : Math.max(0, atual - 1));
  });
  lista.addEventListener('change', (e) => {
    const li = e.target.closest('[data-variacao]');
    if (li && e.target.classList.contains('le-qtd')) definir(li.dataset.variacao, e.target.value.trim());
  });
  lista.addEventListener('focusin', (e) => { if (e.target.classList.contains('le-qtd')) requestAnimationFrame(() => e.target.select()); });
  // Leitura com o campo selecionado (o código "cai" no campo)
  lista.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || !e.target.classList.contains('le-qtd')) return;
    e.preventDefault();
    const li = e.target.closest('[data-variacao]');
    const valor = e.target.value.trim();
    if (valor.length >= 6) {
      const anterior = String(contado.get(li.dataset.variacao) ?? '');
      e.target.value = anterior;
      e.target.blur();
      (async () => {
        const candidatos = [valor];
        if (anterior && valor.startsWith(anterior)) candidatos.push(valor.slice(anterior.length));
        if (anterior && valor.endsWith(anterior)) candidatos.push(valor.slice(0, -anterior.length));
        let cod = valor;
        for (const c of candidatos) if (await buscarPorCodigo(c)) { cod = c; break; }
        lerCodigo(cod);
      })();
    } else e.target.blur();
  });
  el.querySelector('#busca-contagem').addEventListener('input', (e) => { busca = e.target.value.trim(); desenharLista(); });
  el.querySelector('#busca-contagem').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (/^\d{6,}$/.test(e.target.value.trim())) lerCodigo(e.target.value.trim());
  });
  el.querySelector('#limpar-contagem').addEventListener('click', async () => {
    if (!contado.size) return;
    if (!(await confirmar({ titulo: 'Limpar a contagem?', texto: 'Todas as quantidades contadas deste evento serão apagadas.', botao: 'Limpar', perigo: true }))) return;
    for (const id of [...contado.keys()]) await gravarContado(evento.id, id, null);
    contado.clear();
    desenharLista(); resumo();
  });

  async function lerCodigo(cod) {
    if (document.querySelector('dialog[open]')) return;
    const v = await buscarPorCodigo(cod);
    if (!v) { som.erro(); aviso(`Código ${cod} não cadastrado.`, { tipo: 'erro' }); return; }
    if (busca) { busca = ''; el.querySelector('#busca-contagem').value = ''; }
    if (!el.querySelector(`[data-variacao="${CSS.escape(v.id)}"]`)) { contado.set(v.id, contado.get(v.id) ?? 0); desenharLista(); }
    await definir(v.id, (contado.get(v.id) ?? 0) + 1);
    som.item();
    const li = el.querySelector(`[data-variacao="${CSS.escape(v.id)}"]`);
    if (li) { li.classList.remove('lido'); void li.offsetWidth; li.classList.add('lido'); li.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
  }

  desenharLista();
  resumo();
  return ouvirLeitor(lerCodigo);
}
