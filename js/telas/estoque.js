// =========================================================
// Tela Estoque do evento (v0.29.0: dentro do evento → #/eventos/<id>/estoque;
// o antigo #/estoque leva ao estoque do evento em uso). Quatro abas:
//   Levado  — quanto de cada item vai para o evento.
//   Brindes e avarias — saídas sem venda (brinde/doação e produto com defeito),
//             em qualquer aparelho; vão para a Gestão junto com as vendas.
//   Sobra   — levado − vendido − brindes − avarias + itens que voltaram.
//   Contagem final — o que sobrou de verdade, contado no fim; mostra a
//             diferença em relação à sobra calculada.
// Levado e Contagem: botões com foto (como na venda), ±1 caixa fechada e
// rascunho até Revisar e salvar (abaGrade, mais abaixo).
// =========================================================
import { db, lerEventoAtivo, lerAparelho, listarProdutosCompletos, listarCategorias, listarTipos, listarLinhas, buscarPorCodigo, lerLevado, gravarLevado, adicionarSaida, cancelarSaida, lerContado, gravarContado } from '../db.js';
import { esc, icones, aviso, abrirJanela, confirmar, dinheiro, iniciais, saida } from '../ui.js';
import { corValida } from '../cores.js';
import { montarGrupos, SEM_CATEGORIA } from '../venda/grupos.js';
import { ouvirLeitor } from '../leitor.js';
import { som } from '../sons.js';
import { calcularEstoque } from '../estoque/calculo.js';

let aba = 'levado';   // lembrada enquanto o app está aberto
const hora = (iso) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const pecas = (n) => `${n.toLocaleString('pt-BR')} ${n === 1 ? 'peça' : 'peças'}`;

export async function render(el, params = {}) {
  // Sem id (#/estoque, links antigos): vai para o estoque do evento em uso
  if (!params.id) {
    const ativo = await lerEventoAtivo();
    location.replace(ativo ? `#/eventos/${encodeURIComponent(ativo.id)}/estoque` : '#/eventos');
    return;
  }
  const evento = await db.eventos.get(params.id);
  if (!evento) {
    el.innerHTML = `<a class="voltar" href="#/eventos">${icones.voltar} Eventos</a><div class="cartao vazio"><h2>Evento não encontrado</h2><a class="btn" href="#/eventos">Voltar para Eventos</a></div>`;
    return;
  }
  const ativo = await lerEventoAtivo();
  const produtos = await listarProdutosCompletos();
  el.innerHTML = `
    <a class="voltar" href="#/eventos/${encodeURIComponent(evento.id)}">${icones.voltar} ${esc(evento.nome)}</a>
    <header class="cab"><div><h1>Estoque do evento</h1><p class="sub"><strong>${esc(evento.nome)}</strong>${ativo && ativo.id === evento.id ? ' · em uso neste aparelho' : ''}</p></div></header>
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
    if (aba === 'levado' || aba === 'contagem') pararLeitor = await abaGrade(conteudo, evento, produtos, aba);
    else if (aba === 'saidas') await abaSaidas(conteudo, evento, produtos);
    else await abaSobra(conteudo, evento, produtos);
  };
  el.querySelectorAll('input[name="aba"]').forEach((r) => r.addEventListener('change', () => { aba = r.value; desenhar(); }));
  // Levado ou contagem com mudanças ainda não salvas: confirma antes de sair da tela
  saida.pendente = () => temRascunho(evento.id);
  await desenhar();
  // Saiu da tela (salvou ou confirmou "Sair sem salvar"): os rascunhos são descartados
  return () => { if (pararLeitor) pararLeitor(); rascunhos.delete(`levado:${evento.id}`); rascunhos.delete(`contagem:${evento.id}`); };
}

// ---------- Levado e Contagem final: grade de botões com rascunho ----------
// (v0.28.0 Levado; v0.29.0 Contagem final e caixa fechada) Mesma cara da tela de
// venda: um botão com foto por item, com a quantidade num selo. Tocar abre uma
// janela (− / número / +, e ±1 caixa fechada); o leitor soma 1. Nada é gravado
// direto: as mudanças ficam num rascunho, com a barra "N itens alterados" →
// Revisar e salvar (antes → depois) → Salvar.
//   Levado:   quantidade levada (0 = nada).
//   Contagem: quantidade contada no fim; sem número = ainda não contado. Mostra a
//             diferença para a sobra calculada (Confere / Falta / Sobra).
const rascunhos = new Map();   // `${modo}:${eventoId}` → Map(variacaoId → valor novo); sobrevive à troca de aba
const CHAVE_CAT_ESTOQUE = 'zaiko-categoria-estoque';
const TODAS = '__todas';
const CAIXA_PADRAO = 12;
const temRascunho = (eventoId) => [...rascunhos.entries()].some(([k, r]) => k.endsWith(`:${eventoId}`) && r.size > 0);

async function abaGrade(el, evento, todos, modo) {
  const contagem = modo === 'contagem';
  const [salvo, categorias, tipos, linhas] = await Promise.all([contagem ? lerContado(evento.id) : lerLevado(evento.id), listarCategorias(), listarTipos(), listarLinhas()]);
  // Contagem: sobra calculada (levado − vendido − brindes − avarias + voltaram)
  let calc = new Map();
  if (contagem) {
    const [levado, registros, saidas] = await Promise.all([lerLevado(evento.id), db.vendas.where('eventoId').equals(evento.id).toArray(), db.saidas.where('eventoId').equals(evento.id).toArray()]);
    calc = new Map(calcularEstoque({ produtos: todos, levado, registros, saidas }).linhas.map((l) => [l.variacaoId, l]));
  }
  const chaveR = `${modo}:${evento.id}`;
  if (!rascunhos.has(chaveR)) rascunhos.set(chaveR, new Map());
  const rascunho = rascunhos.get(chaveR);
  const doEvento = (id) => salvo.has(id) || rascunho.has(id) || (calc.get(id)?.levado || 0) || (calc.get(id)?.sobra || 0);
  // Itens à venda + os fora da venda que têm algo neste evento
  const produtos = todos.filter((p) => p.variacoes.length && (p.ativo || p.variacoes.some((v) => doEvento(v.id))));
  const daVariacao = new Map();
  for (const p of produtos) for (const v of p.variacoes) daVariacao.set(v.id, { p, v });
  const salvoDe = (id) => (salvo.has(id) ? salvo.get(id) : contagem ? null : 0);
  const valorDe = (id) => (rascunho.has(id) ? rascunho.get(id) : salvoDe(id));
  const sobraDe = (id) => calc.get(id)?.sobra || 0;
  const caixaDe = (id) => daVariacao.get(id)?.p.unidadesCaixa || CAIXA_PADRAO;
  const nomeItem = (id) => { const x = daVariacao.get(id); return x ? `${x.p.nome}${x.v.nome ? ` · ${x.v.nome}` : ''}` : 'Item removido'; };
  const mostra = (n) => (n == null ? '–' : String(n));
  const difDe = (id) => { const n = valorDe(id); return n == null ? null : n - sobraDe(id); };
  const difTexto = (d) => (d == null ? '' : d === 0 ? 'Confere' : d < 0 ? `Falta ${-d}` : `Sobra ${d}`);
  const difClasse = (d) => (d == null ? '' : d === 0 ? 'confere' : d < 0 ? 'falta' : 'sobra');

  const urls = [];
  const urlFoto = (blob) => { const u = URL.createObjectURL(blob); urls.push(u); return u; };
  const foto = new Map();
  for (const p of produtos) for (const v of p.variacoes) { const b = v.foto || p.foto; if (b) foto.set(v.id, urlFoto(b)); }

  const idsCat = new Set(categorias.map((c) => c.id));
  const catDe = (p) => (idsCat.has(p.categoriaId) ? p.categoriaId : SEM_CATEGORIA);
  const chips = categorias.filter((c) => produtos.some((p) => p.categoriaId === c.id)).map((c) => ({ id: c.id, nome: c.nome }));
  if (produtos.some((p) => catDe(p) === SEM_CATEGORIA)) chips.push({ id: SEM_CATEGORIA, nome: chips.length ? 'Outros' : 'Todos os produtos' });
  if (chips.length > 1) chips.unshift({ id: TODAS, nome: 'Todos' });
  let categoria = (() => { try { return localStorage.getItem(CHAVE_CAT_ESTOQUE); } catch (e) { return null; } })();
  if (!chips.some((c) => c.id === categoria)) categoria = chips[0]?.id || SEM_CATEGORIA;
  let busca = '';

  el.innerHTML = `
    <section class="cartao">
      <div class="cab-cartao"><h2>${contagem ? 'Contagem final' : 'Quanto vai para o evento'}</h2><strong class="num" id="total-grade"></strong></div>
      <p class="sub">${contagem
        ? 'No fim do evento, conte o que sobrou: toque num produto e informe a quantidade (use ±1 caixa para caixas fechadas), ou leia o código de cada peça (cada leitura soma 1). Sem número = ainda não contado.'
        : 'Toque num produto para informar a quantidade (use ±1 caixa para caixas fechadas), ou leia o código de cada peça (cada leitura soma 1).'} As mudanças só valem depois de <strong>Revisar e salvar</strong>.</p>
      ${contagem ? '<div class="placar placar-contagem" id="placar"></div>' : ''}
      <div class="acoes" style="margin-top:12px">
        <label class="busca" style="flex:1 1 220px"><span class="oculto">Buscar produto</span>${icones.busca}
          <input class="entrada" id="busca-grade" type="search" placeholder="Buscar produto" autocomplete="off"></label>
        ${contagem ? '<button type="button" class="btn texto perigo" id="limpar-contagem">Limpar contagem</button>' : ''}
      </div>
      <div class="chips chips-venda" id="chips-grade" role="group" aria-label="Categorias" style="margin-top:10px"></div>
    </section>
    <div class="grade-levado" id="grade-estoque"></div>
    <div class="barra-rascunho" id="barra-grade" hidden>
      <div class="br-texto"><strong id="br-titulo"></strong><span class="sub num" id="br-detalhe"></span></div>
      <div class="br-botoes"><button type="button" class="btn" id="desfazer-grade">Desfazer</button><button type="button" class="btn primario" id="revisar-grade">Revisar e salvar</button></div>
    </div>`;
  const $ = (s) => el.querySelector(s);
  const grade = $('#grade-estoque');
  const ids = () => [...daVariacao.keys()];
  const soma = (fn) => ids().reduce((s, id) => s + (fn(id) || 0), 0);

  function alteracoes() {
    return [...rascunho.entries()].filter(([id, n]) => n !== salvoDe(id)).map(([id, n]) => ({ id, antes: salvoDe(id), depois: n }));
  }
  function atualizarTopo() {
    const lista = alteracoes();
    if (contagem) {
      const doEv = ids().filter((id) => doEvento(id) || valorDe(id) != null);
      const contados = doEv.filter((id) => valorDe(id) != null);
      let falta = 0, sobra = 0, valor = 0;
      for (const id of contados) {
        const d = difDe(id);
        if (d < 0) { falta -= d; valor += (calc.get(id)?.custoUnit || 0) * -d; } else sobra += d;
      }
      $('#total-grade').textContent = `${contados.length} de ${doEv.length} itens contados`;
      $('#placar').innerHTML = `
        <div><span>Peças contadas</span><strong class="num">${soma((id) => valorDe(id))}</strong></div>
        <div class="${falta ? 'falta' : 'confere'}"><span>Faltando</span><strong class="num">${falta}${valor ? ` · ${dinheiro(valor)}` : ''}</strong></div>
        <div class="${sobra ? 'sobra' : ''}"><span>Sobrando</span><strong class="num">${sobra}</strong></div>`;
    } else {
      const antes = soma(salvoDe), agora = soma(valorDe);
      $('#total-grade').textContent = lista.length ? `${pecas(agora)} (salvo: ${antes.toLocaleString('pt-BR')})` : pecas(antes);
    }
    $('#barra-grade').hidden = !lista.length;
    if (lista.length) {
      $('#br-titulo').textContent = `${lista.length} ${lista.length === 1 ? 'item alterado' : 'itens alterados'}`;
      const dif = soma(valorDe) - soma(salvoDe);
      $('#br-detalhe').textContent = `${dif > 0 ? '+' : dif < 0 ? '−' : ''}${pecas(Math.abs(dif))} · ainda não salvo`;
    }
  }

  function botao(it) {
    const { p, v } = it;
    const f = foto.get(v.id), cor = corValida(v.cor);
    const n = valorDe(v.id), antes = salvoDe(v.id);
    const alterado = rascunho.has(v.id) && n !== antes;
    const d = contagem ? difDe(v.id) : null;
    // (v0.29.1) A quantidade aparece só no selo. A linha de baixo nunca repete o número:
    //   Levado:   mudou → "antes: 10"; senão, em caixas ("2 cx + 3") ou "não levado".
    //   Contagem: a diferença (Confere / Falta 2 / Sobra 1) ou "não contado · calc. 49".
    const cx = caixaDe(v.id);
    let info;
    if (contagem) info = n == null ? `não contado · calc. ${sobraDe(v.id)}` : `<span class="${difClasse(d)}">${difTexto(d)}</span>`;
    else if (alterado) info = `<span class="antes">antes: ${mostra(antes)}</span>`;
    else if (!n) info = 'não levado';
    else if (n >= cx) info = `${Math.floor(n / cx)} cx${n % cx ? ` + ${n % cx}` : ''}`;
    else info = '';
    const classe = contagem && n != null ? (d < 0 ? ' contado-falta' : d === 0 ? ' contado-ok' : '') : '';
    return `
      <button type="button" class="item-venda item-estoque${alterado ? ' alterado' : ''}${classe}" data-v="${esc(v.id)}">
        <span class="iv-foto ${f ? 'tem-foto' : ''}" ${!f && cor ? `style="background:${cor}"` : ''}>${f ? `<img src="${f}" alt="">` : cor ? '' : `<span>${iniciais(it.nome)}</span>`}
          ${n != null && (n || contagem) ? `<span class="selo-qtd num">${n}</span>` : ''}</span>
        <span class="iv-nome">${esc(it.nome)}</span>
        <span class="iv-info"><span class="iv-sub">${esc(it.sub || '')}${p.ativo ? '' : ' · fora da venda'}</span>
          <span class="iv-levado num">${info}</span></span>
      </button>`;
  }
  function grupoHtml(g, porFileira) {
    const colunas = g.fileiras && porFileira > 2 ? Math.max(porFileira, Math.min(g.colunas, 6)) : porFileira;
    let celulas = [];
    if (g.fileiras) {
      g.fileiras.forEach((fileira, k) => {
        celulas.push(...fileira.map((it) => (it ? botao(it) : `<span class="vaga-venda${k ? ' invisivel' : ''}" aria-hidden="true"></span>`)));
        const sobra = (colunas - (fileira.length % colunas)) % colunas;
        for (let i = 0; i < sobra; i++) celulas.push('<span class="vaga-venda invisivel" aria-hidden="true"></span>');
      });
    } else celulas = g.itens.map(botao);
    return `<section class="grupo-venda"><h3 class="grupo-titulo">${esc(g.titulo)}${g.descricao ? ` <span class="grupo-descricao">· ${esc(g.descricao)}</span>` : ''}</h3>
      <div class="grupo-itens" style="grid-template-columns:repeat(${colunas}, minmax(0, 1fr))">${celulas.join('')}</div></section>`;
  }
  function desenhar() {
    const porFileira = grade.clientWidth && grade.clientWidth < 520 ? 2 : 4;
    const t = busca.toLowerCase();
    $('#chips-grade').hidden = !!t || chips.length < 2;
    $('#chips-grade').innerHTML = chips.map((c) => `<button type="button" class="chip" aria-pressed="${c.id === categoria}" data-categoria="${esc(c.id)}">${esc(c.nome)}</button>`).join('');
    if (t) {
      const achados = [];
      for (const p of produtos) for (const v of p.variacoes) {
        if (`${p.nome} ${v.nome || ''} ${v.codigo || ''} ${v.linha || ''}`.toLowerCase().includes(t)) achados.push({ p, v, nome: p.nome, sub: v.nome || '' });
      }
      grade.innerHTML = achados.length ? grupoHtml({ titulo: `${achados.length} ${achados.length === 1 ? 'item' : 'itens'}`, itens: achados }, porFileira) : '<div class="cartao"><p class="sub">Nenhum produto encontrado.</p></div>';
    } else {
      const daCat = (id) => montarGrupos(produtos.filter((p) => catDe(p) === id), tipos, linhas, 'linha');
      grade.innerHTML = categoria === TODAS
        ? chips.filter((c) => c.id !== TODAS).map((c) => { const gs = daCat(c.id); return gs.length ? `<h2 class="categoria-venda">${esc(c.nome)}</h2>${gs.map((g) => grupoHtml(g, porFileira)).join('')}` : ''; }).join('')
        : daCat(categoria).map((g) => grupoHtml(g, porFileira)).join('') || '<div class="cartao"><p class="sub">Nenhum produto nesta categoria.</p></div>';
    }
    atualizarTopo();
  }
  function trocarBotao(id) {
    const velho = grade.querySelector(`[data-v="${CSS.escape(id)}"]`);
    const x = daVariacao.get(id);
    if (!velho || !x) return null;
    const nome = velho.querySelector('.iv-nome').textContent, sub = velho.querySelector('.iv-sub').textContent.replace(' · fora da venda', '');
    const t = document.createElement('template');
    t.innerHTML = botao({ p: x.p, v: x.v, nome, sub }).trim();
    velho.replaceWith(t.content.firstChild);
    return grade.querySelector(`[data-v="${CSS.escape(id)}"]`);
  }
  function definir(id, n) {
    if (n != null) n = Math.max(0, Math.floor(Number(n) || 0));
    if (!contagem && n == null) n = 0;
    if (n === salvoDe(id)) rascunho.delete(id); else rascunho.set(id, n);
    const b = trocarBotao(id);
    atualizarTopo();
    return b;
  }

  // Janela da quantidade: − / número / +, ±1 caixa fechada, e confirma
  function pedirQuantidade(id) {
    const { p, v } = daVariacao.get(id);
    const antes = salvoDe(id), cx = caixaDe(id);
    let n = valorDe(id);   // na contagem pode ser null (não contado)
    const d = abrirJanela(`
      <form method="dialog" novalidate>
        <h2>${esc(p.nome)}</h2>
        ${v.nome ? `<p>${esc(v.nome)}</p>` : ''}
        <p class="sub">${contagem ? `Calculado: <strong class="num">${pecas(sobraDe(id))}</strong> · contado: <strong class="num">${antes == null ? 'ainda não' : pecas(antes)}</strong>` : `Salvo: <strong class="num">${pecas(antes)}</strong>`}</p>
        <div class="quantidade" style="margin-top:12px;gap:12px">
          <button type="button" class="btn-icone grande" id="menos" aria-label="Diminuir">−</button>
          <input class="entrada entrada-grande num qtd-levado" id="qtd" type="text" inputmode="numeric" pattern="[0-9]*" autocomplete="off" aria-label="${contagem ? 'Quantidade contada' : 'Quantidade levada'}" value="${n == null ? '' : n}" placeholder="${contagem ? '–' : '0'}">
          <button type="button" class="btn-icone grande" id="mais" aria-label="Aumentar">+</button>
        </div>
        <div class="botoes-caixa">
          <button type="button" class="btn" id="menos-caixa">−1 caixa</button>
          <button type="button" class="btn" id="mais-caixa">+1 caixa (${cx})</button>
        </div>
        <p class="sub calculado num" id="em-caixas" style="text-align:center"></p>
        <div class="acoes">
          ${contagem && antes != null ? '<button type="button" class="btn texto perigo" id="sem-contar" style="margin-right:auto">Deixar sem contar</button>' : ''}
          <button type="button" class="btn" id="cancelar">Cancelar</button>
          <button type="submit" class="btn primario" id="ok"></button>
        </div>
      </form>`, { classe: 'janela-item' });
    const campo = d.querySelector('#qtd');
    const ler = () => { const t = campo.value.replace(/\D/g, ''); return t === '' ? null : Math.min(99999, parseInt(t, 10)); };
    const escrever = (x) => { n = x; campo.value = x == null ? '' : x; mostrar(); };
    const mostrar = () => {
      const ok = d.querySelector('#ok');
      ok.textContent = n == null ? (contagem ? 'Ainda não contado' : 'Definir 0 peças') : n === antes ? `Manter ${pecas(n)}` : `Definir ${pecas(n)}`;
      ok.disabled = contagem && n == null && antes == null;
      const cxs = n ? Math.floor(n / cx) : 0, resto = n ? n % cx : 0;
      d.querySelector('#em-caixas').textContent = cxs ? `${cxs} ${cxs === 1 ? 'caixa' : 'caixas'} de ${cx}${resto ? ` + ${resto} ${resto === 1 ? 'avulsa' : 'avulsas'}` : ''}` : '';
      d.querySelector('#menos-caixa').disabled = !n;
    };
    campo.addEventListener('input', () => { campo.value = campo.value.replace(/\D/g, '').slice(0, 5); n = ler(); mostrar(); });
    campo.addEventListener('focus', () => requestAnimationFrame(() => campo.select()));
    d.querySelector('#menos').addEventListener('click', () => escrever(Math.max(0, (n || 0) - 1)));
    d.querySelector('#mais').addEventListener('click', () => escrever((n || 0) + 1));
    d.querySelector('#menos-caixa').addEventListener('click', () => escrever(Math.max(0, (n || 0) - cx)));
    d.querySelector('#mais-caixa').addEventListener('click', () => escrever((n || 0) + cx));
    d.querySelector('#cancelar').addEventListener('click', () => d.close());
    d.querySelector('#sem-contar')?.addEventListener('click', () => { d.close(); definir(id, null); });
    d.querySelector('form').addEventListener('submit', (e) => {
      e.preventDefault();
      if (d.querySelector('#ok').disabled) return;
      // Um código lido com a janela aberta cai no campo: número longo não é quantidade
      if (n != null && n > 9999) { aviso('Esse número parece um código. Digite a quantidade.', { tipo: 'erro' }); escrever(valorDe(id)); return; }
      d.close();
      definir(id, n);
    });
    mostrar();
    campo.focus();
  }

  // Revisar: lista antes → depois e grava tudo de uma vez
  function revisar() {
    const lista = alteracoes().sort((a, b) => nomeItem(a.id).localeCompare(nomeItem(b.id), 'pt-BR'));
    if (!lista.length) return;
    const antes = soma(salvoDe), agora = soma(valorDe);
    const d = abrirJanela(`
      <h2>${contagem ? 'Salvar a contagem?' : 'Salvar o estoque levado?'}</h2>
      <p>Confira as mudanças de <strong>${esc(evento.nome)}</strong>:</p>
      <ul class="lista-revisao">${lista.map((a) => `<li><span>${esc(nomeItem(a.id))}</span><span class="num"><s>${mostra(a.antes)}</s> → <strong>${a.depois == null ? 'não contado' : a.depois}</strong></span></li>`).join('')}</ul>
      <p class="num"><strong>${contagem ? 'Peças contadas' : 'Total'}: ${antes.toLocaleString('pt-BR')} → ${pecas(agora)}</strong></p>
      <div class="acoes"><button type="button" class="btn" id="voltar">Voltar</button><button type="button" class="btn primario" id="salvar">Salvar ${lista.length} ${lista.length === 1 ? 'alteração' : 'alterações'}</button></div>`);
    d.querySelector('#voltar').addEventListener('click', () => d.close());
    d.querySelector('#salvar').addEventListener('click', async () => {
      d.querySelector('#salvar').disabled = true;
      for (const a of lista) {
        if (contagem) await gravarContado(evento.id, a.id, a.depois); else await gravarLevado(evento.id, a.id, a.depois);
        if (a.depois == null || (!contagem && !a.depois)) salvo.delete(a.id); else salvo.set(a.id, a.depois);
      }
      rascunho.clear();
      d.close();
      desenhar();
      aviso(contagem ? 'Contagem salva.' : `Estoque levado salvo: ${pecas(agora)}.`);
    });
  }

  $('#chips-grade').addEventListener('click', (e) => {
    const b = e.target.closest('[data-categoria]');
    if (!b) return;
    categoria = b.dataset.categoria;
    try { localStorage.setItem(CHAVE_CAT_ESTOQUE, categoria); } catch (erro) { /* ok */ }
    desenhar();
  });
  grade.addEventListener('click', (e) => { const b = e.target.closest('[data-v]'); if (b) pedirQuantidade(b.dataset.v); });
  $('#busca-grade').addEventListener('input', (e) => { busca = e.target.value.trim(); desenhar(); });
  $('#busca-grade').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const valor = e.target.value.trim();
    if (/^\d{6,}$/.test(valor)) lerCodigo(valor);
  });
  $('#revisar-grade').addEventListener('click', revisar);
  $('#desfazer-grade').addEventListener('click', async () => {
    const n = alteracoes().length;
    if (!(await confirmar({ titulo: 'Desfazer as alterações?', texto: `${n} ${n === 1 ? 'item volta' : 'itens voltam'} ao que estava salvo.`, botao: 'Desfazer', perigo: true }))) return;
    rascunho.clear();
    desenhar();
  });
  $('#limpar-contagem')?.addEventListener('click', async () => {
    const contados = ids().filter((id) => valorDe(id) != null);
    if (!contados.length) return;
    if (!(await confirmar({ titulo: 'Limpar a contagem?', texto: `${contados.length} ${contados.length === 1 ? 'item fica' : 'itens ficam'} sem contar. Confira e toque em Revisar e salvar.`, botao: 'Limpar', perigo: true }))) return;
    for (const id of contados) { if (salvoDe(id) == null) rascunho.delete(id); else rascunho.set(id, null); }
    desenhar();
  });
  const observador = new ResizeObserver(() => { const agora = grade.clientWidth < 520; if (agora !== observador.estreito) { observador.estreito = agora; desenhar(); } });
  observador.estreito = grade.clientWidth < 520;
  observador.observe(grade);
  desenhar();

  // Leitor: cada leitura soma 1 no rascunho
  async function lerCodigo(codigo) {
    if (document.querySelector('dialog[open]')) return;
    const v = await buscarPorCodigo(codigo);
    if (!v) { som.erro(); aviso(`Código ${codigo} não cadastrado.`, { tipo: 'erro' }); return; }
    if (!daVariacao.has(v.id)) {
      const p = todos.find((x) => x.id === v.produtoId);
      if (!p) { som.erro(); return; }
      produtos.push(p);
      for (const x of p.variacoes) daVariacao.set(x.id, { p, v: x });
    }
    const p = daVariacao.get(v.id).p;
    if (busca || (categoria !== TODAS && catDe(p) !== categoria) || !grade.querySelector(`[data-v="${CSS.escape(v.id)}"]`)) {
      busca = ''; $('#busca-grade').value = '';
      if (categoria !== TODAS) categoria = catDe(p);
      desenhar();
    }
    const n = (valorDe(v.id) || 0) + 1;
    const b = definir(v.id, n);
    som.item();
    aviso(`${nomeItem(v.id)}: ${pecas(n)}`);
    if (b) { b.classList.add('lido'); b.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
  }
  const pararLeitor = ouvirLeitor(lerCodigo);
  return () => { pararLeitor(); observador.disconnect(); urls.forEach(URL.revokeObjectURL); };
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
            <br><span class="sub">${s.motivo ? `${esc(s.motivo)} · ` : ''}${hora(s.criadoEm)}${s.aparelho ? ` · ${esc(s.aparelho.sigla)}` : ''}</span>${s.status === 'cancelado' ? ' <span class="etiqueta erro">Cancelado</span>' : ''}</span>
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
          <div class="campo"><label for="motivo">Motivo <span class="sub">(opcional)</span></label><input class="entrada" id="motivo" maxlength="140" autocomplete="off" placeholder="${ehAvaria ? 'Ex.: frasco vazando' : 'Ex.: sorteio no Instagram'}"></div>
        </div>
        <div class="acoes"><button type="button" class="btn" id="voltar">Voltar</button><button type="submit" class="btn primario" id="confirmar" disabled>Escolha o produto</button></div>
      </form>`, { classe: 'janela-movimento', aoFechar: () => resolver(feito) });
    const $ = (s) => d.querySelector(s);
    const conferir = () => {
      $('#qtd').textContent = qtd;
      const falta = !escolhido ? 'Escolha o produto' : '';
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

