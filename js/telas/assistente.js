// =========================================================
// Assistentes do evento (v0.39.0, Beta parte 3). Só na Gestão.
//   #/eventos/<id>/preparar?passo=N  — Preparar evento:
//     1 Dados · 2 Custos do evento · 3 Preços · 4 Estoque levado ·
//     5 Custo dos produtos · 6 Revisão e envio
//   #/eventos/<id>/fechar?passo=N    — Fechar evento:
//     1 Vendas dos caixas (quadro aparelho × dia) · 2 Contagem final ·
//     3 Custo dos produtos · 4 Resultado e planilha · 5 Encerrar
// Cada passo mostra a situação e um botão para a tela que já existe
// (custos, preços, estoque...). Ao sair por esse botão, uma faixa no topo
// das outras telas leva de volta ao passo (faixaAssistente, em app.js).
// =========================================================
import { db, lerEventoAtivo, definirEventoAtivo, listarProdutosCompletos, lerLevado, lerContado, lerConfig } from '../db.js';
import { esc, aviso, confirmar, icones, periodo, hojeISO } from '../ui.js';
import { custosVazios, diasDoEvento, calcularCustosEvento } from '../fechamento/custos-evento.js';
import { situacaoBase, publicarBase, buscarVendasDosCaixas } from '../sincronizar.js';
import { driveConfigurado, prepararDrive, autorizar } from '../drive.js';
import { aparelhosDoEvento } from '../vendas-arquivo.js';

const CHAVE = 'zaikoAssistente';
export const TITULOS = { preparar: 'Preparar evento', fechar: 'Fechar evento' };

// Lembra em qual assistente/passo a pessoa está (para a faixa "Voltar ao assistente")
export function lembrar(dados) { try { sessionStorage.setItem(CHAVE, JSON.stringify(dados)); } catch { /* ok */ } }
export function lembrado() { try { return JSON.parse(sessionStorage.getItem(CHAVE) || 'null'); } catch { return null; } }
export function esquecer() { try { sessionStorage.removeItem(CHAVE); } catch { /* ok */ } }

const dataCurta = (iso) => new Date(iso + 'T12:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' }).replace('.', '');
const quando = (iso) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const plural = (n, um, varios) => `${n.toLocaleString('pt-BR')} ${n === 1 ? um : varios}`;

// Situação de tudo o que os dois assistentes olham
async function levantar(evento) {
  const drive = driveConfigurado();
  if (drive) prepararDrive().catch(() => {});
  const [produtos, levado, contado, emUso, base, busca, aparelhos, caixas, vendas] = await Promise.all([
    listarProdutosCompletos(), lerLevado(evento.id), lerContado(evento.id), lerEventoAtivo(),
    drive ? situacaoBase().catch(() => null) : null, lerConfig('ultimaBuscaVendas', null), aparelhosDoEvento(evento),
    db.caixas.where('eventoId').equals(evento.id).toArray(), db.vendas.where('eventoId').equals(evento.id).toArray()
  ]);
  const ativos = produtos.filter((p) => p.ativo);
  const semCusto = ativos.filter((p) => p.variacoes.some((v) => (v.custo ?? p.custo) == null)).length;
  const pecas = [...levado.values()].reduce((s, n) => s + n, 0);
  const emUsoAqui = !!(emUso && emUso.id === evento.id);
  const enviado = !!(base && base.publicada && !base.alterada && base.publicada.eventoId === evento.id);
  const fim = evento.dataFim || evento.dataInicio;
  const buscou = !!(busca && busca.eventoId === evento.id && new Date(busca.em).toLocaleDateString('sv-SE') > fim);
  return { drive, produtos, levado, contado, emUso, emUsoAqui, base, busca, buscou, enviado, semCusto, pecas, aparelhos, caixas, vendas };
}

function passosPreparar(ev, s) {
  const id = encodeURIComponent(ev.id);
  const nPrecos = Object.keys(ev.precos || {}).length;
  const c = ev.custos;
  return [
    { nome: 'Dados', feito: true, resumo: `${esc(ev.nome)} · ${esc(periodo(ev.dataInicio, ev.dataFim))}${ev.local ? ` · ${esc(ev.local)}` : ''}`,
      texto: 'Nome, local e datas. O caixa abre e fecha a cada dia do evento.', acao: [`#/eventos/${id}`, 'Editar dados'] },
    { nome: 'Custos do evento', feito: !!c, opcional: true,
      resumo: c && !calcularCustosEvento(c).tem ? 'Sem custos neste evento' : c ? [c.modo === 'pct' ? 'comissão sobre as vendas' : c.modo === 'ambos' ? 'valor fixo + comissão' : 'valor fixo', (c.estrutura || []).length && plural(c.estrutura.length, 'item de estrutura', 'itens de estrutura'), (c.equipe || []).length && plural(c.equipe.length, 'pessoa na equipe', 'pessoas na equipe')].filter(Boolean).join(' · ') : 'Ainda não informados',
      texto: 'Valor do evento (fixo ou % das vendas), estrutura e equipe. Entram no Resultado final do fechamento. Valores protegidos pelo PIN.',
      acao: [`#/eventos/${id}/custos`, c ? 'Ver custos' : 'Informar custos'], extra: c ? null : ['sem-custos', 'Este evento não tem custos'] },
    { nome: 'Preços', feito: true, opcional: true, resumo: nPrecos ? plural(nPrecos, 'item com preço especial', 'itens com preço especial') : 'Todos no preço normal',
      texto: 'Preço especial só neste evento (ex.: 10% em tudo). Em branco vale o preço normal.', acao: [`#/eventos/${id}/precos`, 'Preços do evento'] },
    { nome: 'Estoque levado', feito: s.levado.size > 0, resumo: s.levado.size ? `${plural(s.pecas, 'peça', 'peças')} em ${plural(s.levado.size, 'item', 'itens')}` : 'Ainda não registrado',
      texto: 'Quantas peças de cada item vão para o evento. Serve para calcular a sobra no fechamento.', acao: [`#/eventos/${id}/estoque?aba=levado`, 'Registrar o estoque levado'] },
    { nome: 'Custo dos produtos', feito: !s.semCusto, resumo: s.semCusto ? `${plural(s.semCusto, 'produto', 'produtos')} sem custo` : 'Todos os produtos com custo',
      texto: 'Sem o custo, o lucro do evento aparece maior do que é.', acao: ['#/produtos/precos?semcusto=1', s.semCusto ? 'Cadastrar custos' : 'Ver preços e custos'] },
    { nome: 'Revisão e envio', feito: s.emUsoAqui && (s.enviado || !s.drive), resumo: !s.emUsoAqui ? 'O evento ainda não está em uso' : s.enviado ? 'Enviado aos caixas' : s.drive ? 'Ainda não enviado aos caixas' : 'Envie o pacote aos caixas', revisao: true }
  ];
}

function passosFechar(ev, s) {
  const id = encodeURIComponent(ev.id);
  const encerrado = ev.status === 'encerrado';
  const abertos = s.caixas.filter((c) => c.status === 'aberto').length;
  return [
    { nome: 'Vendas dos caixas', feito: s.buscou || encerrado, resumo: s.buscou ? `Buscadas em ${quando(s.busca.em)}` : encerrado ? 'Evento encerrado' : 'Busque depois que todos os caixas fecharem e sincronizarem',
      texto: 'Cada caixa fecha o dia e sincroniza; aqui a Gestão traz as vendas. Confira no quadro se cada aparelho e cada dia chegou.', quadro: true, aviso: abertos ? `${plural(abertos, 'caixa ainda aberto', 'caixas ainda abertos')}: feche no aparelho e sincronize de novo.` : '' },
    { nome: 'Contagem final', feito: s.contado.size > 0, resumo: s.contado.size ? plural(s.contado.size, 'item contado', 'itens contados') : 'Ainda não contado',
      texto: 'Conte o que voltou do evento. O app mostra o que falta ou sobra em relação ao calculado.', acao: [`#/eventos/${id}/estoque?aba=contagem`, 'Fazer a contagem final'] },
    { nome: 'Custo dos produtos', feito: !s.semCusto, resumo: s.semCusto ? `${plural(s.semCusto, 'produto', 'produtos')} sem custo` : 'Todos os produtos com custo',
      texto: 'Itens vendidos sem custo usam o custo atual do cadastro no fechamento.', acao: ['#/produtos/precos?semcusto=1', s.semCusto ? 'Cadastrar custos' : 'Ver preços e custos'] },
    { nome: 'Resultado e planilha', feito: encerrado, resumo: 'Resultado final, formas de pagamento, caixas e estoque',
      texto: 'Confira o resultado (protegido pelo PIN), marque se brindes e avarias entram como perda e salve a planilha no Drive ou no aparelho.', acao: [`#/eventos/${id}/fechamento`, 'Abrir o fechamento'] },
    { nome: 'Encerrar', feito: encerrado, resumo: encerrado ? `Encerrado${ev.encerradoEm ? ` em ${quando(ev.encerradoEm)}` : ''}` : 'Ainda aberto', encerrar: true }
  ];
}

export async function render(el, { id, consulta, tipo }) {
  const evento = await db.eventos.get(id);
  if (!evento) { location.replace('#/eventos'); return; }
  const s = await levantar(evento);
  const passos = tipo === 'preparar' ? passosPreparar(evento, s) : passosFechar(evento, s);
  const primeiroFalta = passos.findIndex((p) => !p.feito && !p.opcional);
  let n = parseInt(consulta && consulta.get('passo'), 10);
  if (!(n >= 1 && n <= passos.length)) n = (primeiroFalta >= 0 ? primeiroFalta : passos.length - 1) + 1;
  const p = passos[n - 1];
  const base = `#/eventos/${encodeURIComponent(evento.id)}/${tipo}`;
  lembrar({ tipo, id: evento.id, passo: n, total: passos.length, nome: evento.nome });

  const estado = (x) => x.feito ? 'feito' : x.opcional ? 'opcional' : 'falta';
  const marca = (x, i) => x.feito ? '✓' : String(i + 1);
  const feitos = passos.filter((x) => x.feito).length;

  el.innerHTML = `
    <a class="voltar" href="#/inicio">${icones.voltar} Início</a>
    <header class="cab"><div><h1>${TITULOS[tipo]}</h1>
      <p class="sub">${esc(evento.nome)} · ${esc(periodo(evento.dataInicio, evento.dataFim))}${evento.teste ? ' · <span class="etiqueta teste">Teste</span>' : ''}</p></div>
      <span class="sub">${feitos} de ${passos.length} passos</span></header>
    <ol class="as-passos" aria-label="Passos">
      ${passos.map((x, i) => `<li><a href="${base}?passo=${i + 1}" class="as-passo ${estado(x)}" ${i + 1 === n ? 'aria-current="step"' : ''}>
        <span class="as-num">${marca(x, i)}</span><span class="as-nome">${esc(x.nome)}</span></a></li>`).join('')}
    </ol>
    <section class="cartao as-painel">
      <span class="eg-rotulo">PASSO ${n} DE ${passos.length}${p.opcional ? ' · OPCIONAL' : ''}</span>
      <h2>${esc(p.nome)}</h2>
      <p class="as-resumo ${estado(p)}"><span aria-hidden="true">${p.feito ? '✓' : p.opcional ? '○' : '!'}</span> ${p.resumo}</p>
      ${p.texto ? `<p class="sub">${p.texto}</p>` : ''}
      ${p.aviso ? `<p class="aviso-inline">${esc(p.aviso)}</p>` : ''}
      <div id="as-conteudo"></div>
      ${p.acao || p.extra ? `<div class="acoes" style="justify-content:flex-start">
        ${p.acao ? `<a class="btn ${p.feito ? '' : 'primario'}" href="${p.acao[0]}">${esc(p.acao[1])}</a>` : ''}
        ${p.extra ? `<button type="button" class="btn" id="${p.extra[0]}">${esc(p.extra[1])}</button>` : ''}</div>` : ''}
    </section>
    <div class="as-navegar">
      ${n > 1 ? `<a class="btn" href="${base}?passo=${n - 1}">${icones.voltar} Anterior</a>` : '<span></span>'}
      ${n < passos.length ? `<a class="btn primario" href="${base}?passo=${n + 1}">Próximo passo</a>` : `<a class="btn" href="#/inicio">Concluir</a>`}
    </div>`;

  const conteudo = el.querySelector('#as-conteudo');
  if (p.revisao) revisao(conteudo, evento, s, passos, base);
  if (p.quadro) quadro(conteudo, evento, s);
  if (p.encerrar) encerrar(conteudo, evento, s, passos, base);

  el.querySelector('#sem-custos')?.addEventListener('click', async () => {
    await db.eventos.update(evento.id, { custos: custosVazios() });
    aviso('Anotado: este evento não tem custos.');
    location.hash = `${base}?passo=${n + 1}`;
  });
}

// ---------- Preparar · 6 Revisão e envio ----------
function revisao(el, evento, s, passos, base) {
  const faltam = passos.slice(0, -1).filter((x) => !x.feito && !x.opcional);
  el.innerHTML = `
    <ul class="lista-avisos as-revisao">${passos.slice(0, -1).map((x, i) => `<li class="${x.feito ? 'ok' : x.opcional ? '' : 'atencao'}">
      <span><strong>${i + 1}. ${esc(x.nome)}</strong> · ${x.resumo}</span>${x.feito ? '' : `<a class="btn" href="${base}?passo=${i + 1}">Ver</a>`}</li>`).join('')}</ul>
    ${faltam.length ? `<p class="sub">Dá para enviar mesmo assim e completar depois (envie de novo ao terminar).</p>` : ''}
    <div class="acoes" style="justify-content:flex-start">
      ${!s.emUsoAqui ? `<button type="button" class="btn primario" id="usar">${s.emUso ? `Usar este evento (no lugar de ${esc(s.emUso.nome)})` : 'Usar este evento neste aparelho'}</button>`
        : s.drive ? `<button type="button" class="btn ${s.enviado ? '' : 'primario'}" id="enviar">${s.enviado ? 'Enviar de novo aos caixas' : 'Enviar aos caixas'}</button>`
        : '<a class="btn primario" href="#/sincronizar">Enviar aos caixas por arquivo</a>'}
    </div>
    <p class="sub" id="as-status" hidden></p>
    <p class="sub">Depois de enviar: em cada caixa, toque em <strong>Sincronizar</strong>. Eles recebem o catálogo, os preços e este evento.</p>`;
  el.querySelector('#usar')?.addEventListener('click', async () => {
    if (s.emUso && s.emUso.status !== 'encerrado' && !(await confirmar({ titulo: 'Trocar o evento em uso?', texto: `"${evento.nome}" passa a ser o evento em uso e é o que vai para os caixas, no lugar de "${s.emUso.nome}".`, botao: 'Usar este evento' }))) return;
    await definirEventoAtivo(evento.id);
    aviso('Evento em uso neste aparelho.');
    location.hash = `${base}?passo=${passos.length}&t=${Date.now()}`;
  });
  el.querySelector('#enviar')?.addEventListener('click', async (e) => {
    const botao = e.currentTarget, status = el.querySelector('#as-status');
    const pedido = autorizar();   // chamado direto no toque (o Google exige)
    botao.disabled = true; status.hidden = false; status.textContent = 'Enviando…';
    try {
      await pedido;
      const r = await publicarBase();
      aviso(`Enviado aos caixas (base nº ${r.versao}).`);
      location.hash = `${base}?passo=${passos.length}&t=${Date.now()}`;
    } catch (erro) {
      console.error(erro);
      status.textContent = navigator.onLine ? 'Não foi possível enviar agora. Tente de novo ou use a tela Sincronizar.' : 'Sem internet. Conecte e tente de novo.';
      botao.disabled = false;
    }
  });
}

// ---------- Fechar · 1 Quadro aparelho × dia ----------
async function quadro(el, evento, s) {
  const dias = diasDoEvento(evento);
  const importados = ((await lerConfig('vendasImportadas')) || {})[evento.id] || {};
  const extras = [...new Set(s.caixas.map((c) => c.data))].filter((d) => !dias.includes(d)).sort();
  const colunas = [...dias, ...extras];
  const vendasDe = (sigla, dia) => s.vendas.filter((v) => (v.tipo || 'venda') === 'venda' && v.status !== 'cancelada' && (v.aparelho?.sigla || '?') === sigla && new Date(v.criadoEm).toLocaleDateString('sv-SE') === dia).length;
  const celula = (a, dia) => {
    const cx = s.caixas.find((c) => (c.aparelho?.sigla || '?') === a.sigla && c.data === dia);
    if (!cx) return `<td class="q-nao" title="Não abriu caixa neste dia">—</td>`;
    const nv = vendasDe(a.sigla, dia);
    if (cx.status === 'aberto') return `<td class="q-aberto" title="Caixa ainda aberto">aberto · ${nv}</td>`;
    return `<td class="q-ok" title="Caixa fechado">✓ ${plural(nv, 'venda', 'vendas')}</td>`;
  };
  const linhas = s.aparelhos.filter((a) => !a.esteAparelho || a.caixas);
  el.innerHTML = `
    ${linhas.length ? `<div class="tabela-rolagem"><table class="quadro-caixas">
      <thead><tr><th>Aparelho</th>${colunas.map((d) => `<th>${esc(dataCurta(d))}${extras.includes(d) ? '<br><span class="sub">fora das datas</span>' : ''}</th>`).join('')}<th>Recebido</th></tr></thead>
      <tbody>${linhas.map((a) => `<tr><th>${esc(a.nome)} <span class="sub">(${esc(a.sigla)})</span></th>${colunas.map((d) => celula(a, d)).join('')}
        <td class="sub">${importados[a.sigla] ? quando(importados[a.sigla].importadoEm) : a.esteAparelho ? 'este aparelho' : '—'}</td></tr>`).join('')}</tbody>
    </table></div>
    <p class="sub">✓ caixa fechado, com as vendas do dia · <strong>aberto</strong>: ainda não fechou · — não abriu caixa nesse dia. Um aparelho que vendeu e não aparece aqui ainda não sincronizou.</p>`
    : '<p class="sub">Nenhuma venda dos caixas chegou ainda.</p>'}
    <div class="acoes" style="justify-content:flex-start">
      ${s.drive ? `<button type="button" class="btn ${s.buscou ? '' : 'primario'}" id="buscar">Buscar vendas dos caixas</button>` : ''}
      <a class="btn" href="#/juntar">Receber por arquivo</a></div>
    <p class="sub" id="as-status" hidden></p>`;
  el.querySelector('#buscar')?.addEventListener('click', async (e) => {
    const botao = e.currentTarget, status = el.querySelector('#as-status');
    const pedido = autorizar();
    botao.disabled = true; status.hidden = false; status.textContent = 'Buscando…';
    try {
      await pedido;
      const r = await buscarVendasDosCaixas(evento);
      aviso(r.aparelhos.length ? `${plural(r.novas, 'venda nova', 'vendas novas')} de ${plural(r.aparelhos.length, 'aparelho', 'aparelhos')}.` : 'Nenhum caixa enviou vendas deste evento ainda.');
      location.hash = `#/eventos/${encodeURIComponent(evento.id)}/fechar?passo=1&t=${Date.now()}`;
    } catch (erro) {
      console.error(erro);
      status.textContent = navigator.onLine ? 'Não foi possível buscar agora. Tente de novo ou use a tela Sincronizar.' : 'Sem internet. Conecte e tente de novo.';
      botao.disabled = false;
    }
  });
}

// ---------- Fechar · 5 Encerrar ----------
function encerrar(el, evento, s, passos, base) {
  if (evento.status === 'encerrado') {
    el.innerHTML = `<p class="sub">O fechamento e a planilha continuam no evento. Para voltar a vender nele, reabra no fechamento.</p>
      <div class="acoes" style="justify-content:flex-start"><a class="btn" href="#/eventos/${encodeURIComponent(evento.id)}/fechamento">Ver fechamento</a><a class="btn primario" href="#/eventos/novo">Novo evento</a></div>`;
    return;
  }
  const faltam = passos.slice(0, -1).filter((x) => !x.feito && x.nome !== 'Resultado e planilha');
  const abertos = s.caixas.filter((c) => c.status === 'aberto').length;
  const antes = hojeISO() <= (evento.dataFim || evento.dataInicio);
  el.innerHTML = `
    ${faltam.length || abertos || antes ? `<ul class="lista-avisos">
      ${antes ? '<li class="atencao"><span>O evento ainda não terminou.</span></li>' : ''}
      ${abertos ? `<li class="atencao"><span>${plural(abertos, 'caixa ainda aberto', 'caixas ainda abertos')}.</span></li>` : ''}
      ${faltam.map((x) => `<li class="atencao"><span>Falta: ${esc(x.nome.toLowerCase())}.</span><a class="btn" href="${base}?passo=${passos.indexOf(x) + 1}">Ver</a></li>`).join('')}</ul>` : ''}
    <p class="sub">Encerrar bloqueia novas vendas neste evento e tira o evento de "em uso". Trocas e devoluções depois disso viram registro pós-evento. Dá para reabrir no fechamento.</p>
    <div class="acoes" style="justify-content:flex-start"><button type="button" class="btn primario" id="encerrar">Encerrar o evento</button></div>`;
  el.querySelector('#encerrar').addEventListener('click', async () => {
    if (!(await confirmar({ titulo: 'Encerrar o evento?', texto: faltam.length || abertos ? 'Ainda há pendências. Encerrar mesmo assim? Dá para reabrir depois.' : 'Novas vendas ficam bloqueadas. Dá para reabrir depois, se precisar.', botao: 'Encerrar', perigo: true }))) return;
    await db.eventos.update(evento.id, { status: 'encerrado', encerradoEm: new Date().toISOString() });
    const atual = await lerEventoAtivo();
    if (atual && atual.id === evento.id) await definirEventoAtivo(null);
    aviso('Evento encerrado.');
    esquecer();
    location.hash = `${base}?passo=${passos.length}&t=${Date.now()}`;
  });
}
