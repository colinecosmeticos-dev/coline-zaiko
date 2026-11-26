// =========================================================
// Início da Gestão em grade (v0.36.0, Beta parte 2).
//   - Avisos (só quando há): sem produtos, sem evento, alterações não
//     enviadas aos caixas, fora das datas, versão nova do app.
//   - Cartão do evento em uso, com a fase e o progresso:
//       antes  (até a véspera): Dados → Custos do evento → Estoque levado →
//              Custo dos produtos → Enviado aos caixas
//       durante (nos dias do evento): vendas já buscadas dos caixas
//       depois (passou o último dia): Vendas buscadas → Contagem final →
//              Custo dos produtos → Fechar e encerrar
//     Encerrado: sai de "em uso" (v0.37.0); o cartão mostra o próximo evento e o último encerrado
//     "Continuar" leva ao primeiro passo que falta.
//   - Grade de ícones: Evento, Catálogo, Caixas, Relatórios, Sistema.
// O modo Caixa continua com o Início de sempre (telas/inicio.js).
// =========================================================
import { db, lerEventoAtivo, definirEventoAtivo, lerAparelho, lerConfig, listarProdutosCompletos, lerLevado, lerContado } from '../db.js';
import { esc, hojeISO, diasEntre, periodo, aviso } from '../ui.js';
import { situacaoBase } from '../sincronizar.js';
import { driveConfigurado, prepararDrive } from '../drive.js';
import { temVersaoNova, procurar } from '../atualizacao.js';
import { VERSAO_TEXTO as VERSAO } from '../versao.js';

// Ícones (traço, 24×24)
const IC = {
  mais: '<path d="M12 5v14M5 12h14"/>',
  calendario: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>',
  caixa: '<path d="M4 8l8-4 8 4v8l-8 4-8-4z"/><path d="M4 8l8 4 8-4M12 12v8"/>',
  etiqueta: '<path d="M20 13 13 20a1.5 1.5 0 0 1-2 0L3 12V4h8l9 9z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
  custos: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 15l2 2 4-4"/>',
  bandeira: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
  sacola: '<path d="M5 8h14l-1.2 12H6.2z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
  moeda: '<circle cx="12" cy="12" r="8"/><path d="M14.5 9.5c-.5-1-1.4-1.5-2.5-1.5-1.5 0-2.5.8-2.5 2s1 1.6 2.5 2 2.5.9 2.5 2-1 2-2.5 2c-1.2 0-2.1-.5-2.6-1.5M12 6.5V8M12 16v1.5"/>',
  ajustes: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
  barras: '<path d="M4 6v12M7 6v12M10 6v12M14 6v12M16 6v12M20 6v12"/>',
  enviar: '<path d="M12 15V4M7 9l5-5 5 5"/><path d="M5 14v6h14v-6"/>',
  receber: '<path d="M12 4v11M7 10l5 5 5-5"/><path d="M5 14v6h14v-6"/>',
  tablet: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M11 18h2"/>',
  recibo: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
  grafico: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  cartao: '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18M7 15h3"/>',
  gaveta: '<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/>',
  cadeado: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  salvar: '<path d="M5 4h11l3 3v13H5z"/><path d="M8 4v5h7V4M8 20v-6h8v6"/>',
  atualizar: '<path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v5h-5"/>',
  lista: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2"/>',
  livro: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 21V5M8 7h7M8 11h7"/>',
  lixo: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'
};
const icone = (n) => `<span class="tg-ic" aria-hidden="true"><svg viewBox="0 0 24 24">${IC[n]}</svg></span>`;
// href começando com "acao:" vira botão (ex.: Atualizar app)
const tile = ([href, ic, rotulo]) => href.startsWith('acao:')
  ? `<button type="button" class="tile-gestao" data-acao="${href.slice(5)}">${icone(ic)}<span>${rotulo}</span></button>`
  : `<a class="tile-gestao" href="${href}">${icone(ic)}<span>${rotulo}</span></a>`;
const hora = (iso) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
const quando = (iso) => {
  const d = new Date(iso);
  return d.toDateString() === new Date().toDateString() ? `hoje às ${hora(iso)}` : `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} às ${hora(iso)}`;
};

export async function renderGestao(el) {
  const drive = driveConfigurado();
  if (drive) prepararDrive().catch(() => {});
  const hoje = hojeISO();
  // Evento encerrado sai de "em uso" na Gestão (v0.37.0; vale também para os encerrados antes)
  const emUso = await lerEventoAtivo();
  if (emUso && emUso.status === 'encerrado') await definirEventoAtivo(null);
  const [aparelho, evento, produtos, eventos, base, busca] = await Promise.all([
    lerAparelho(), lerEventoAtivo(), listarProdutosCompletos(), db.eventos.toArray(),
    drive ? situacaoBase().catch(() => null) : null, lerConfig('ultimaBuscaVendas', null)
  ]);
  const ativos = produtos.filter((p) => p.ativo);
  const semCusto = ativos.filter((p) => p.variacoes.some((v) => (v.custo ?? p.custo) == null)).length;
  const id = evento ? encodeURIComponent(evento.id) : '';

  // ---------- Avisos ----------
  const avisos = [];
  if (!produtos.length) avisos.push({ nivel: 'atencao', texto: '<strong>Nenhum produto cadastrado.</strong> O catálogo é a base da tela de venda.', botao: ['#/produtos/novo', 'Cadastrar produto'] });
  if (base && evento && evento.status !== 'encerrado' && (!base.publicada || base.alterada)) avisos.push({ nivel: 'atencao', texto: base.publicada ? '<strong>Há alterações não enviadas aos caixas</strong> (evento, preços, produtos ou formas de pagamento).' : '<strong>Os caixas ainda não receberam nada.</strong>', botao: ['#/sincronizar', 'Enviar aos caixas'] });
  if (temVersaoNova()) avisos.push({ nivel: 'info', texto: '<strong>Versão nova do app disponível.</strong> Toque em Atualizar agora, no topo da tela.' });

  // ---------- Cartão do evento ----------
  let cartao, usarProximo = null;
  if (!evento) {
    // Sem evento em uso: sugere o próximo evento aberto (já criado) e mostra o último encerrado
    const abertos = eventos.filter((e) => e.status !== 'encerrado' && (e.dataFim || e.dataInicio) >= hoje).sort((a, b) => a.dataInicio.localeCompare(b.dataInicio));
    const proximo = abertos.find((e) => !e.teste) || abertos[0];
    const ultimo = eventos.filter((e) => e.status === 'encerrado').sort((a, b) => (b.encerradoEm || b.dataFim || '').localeCompare(a.encerradoEm || a.dataFim || ''))[0];
    cartao = `<section class="cartao evento-gestao">
      <div class="eg-info"><span class="eg-rotulo">EVENTO EM USO</span><strong class="eg-nome">Nenhum</strong>
        <span class="sub">${proximo ? `Próximo evento: <strong>${esc(proximo.nome)}</strong> (${esc(periodo(proximo.dataInicio, proximo.dataFim))}).` : 'Crie o próximo evento: nome, datas, custos, estoque e envio aos caixas.'}</span>
        ${ultimo ? `<span class="sub">Último encerrado: ${esc(ultimo.nome)} · <a href="#/eventos/${encodeURIComponent(ultimo.id)}/fechamento">ver fechamento</a></span>` : ''}</div>
      <div class="eg-botoes">${proximo
        ? `<a class="btn" href="#/eventos/novo">Novo evento</a><button type="button" class="btn primario btn-grande" id="usar-proximo">Usar ${esc(proximo.nome)}</button>`
        : `<a class="btn primario btn-grande" href="#/eventos/novo">Novo evento</a>`}</div></section>`;
    usarProximo = proximo;
  } else {
    const fase = hoje < evento.dataInicio ? 'antes' : hoje > (evento.dataFim || evento.dataInicio) ? 'depois' : 'durante';
    const vendas = (await db.vendas.where('eventoId').equals(evento.id).toArray()).filter((v) => (v.tipo || 'venda') === 'venda' && v.status !== 'cancelada');
    const siglas = [...new Set(vendas.map((v) => v.aparelho?.sigla).filter(Boolean))];
    let passos = [], titulo = '', detalhe = '';
    if (fase === 'antes') {
      const levado = await lerLevado(evento.id);
      const enviado = !!(base && base.publicada && !base.alterada && base.publicada.eventoId === evento.id);
      titulo = 'Antes do evento';
      const faltam = diasEntre(hoje, evento.dataInicio) - 1;
      detalhe = faltam === 1 ? 'começa amanhã' : `faltam ${faltam} dias`;
      passos = [
        { nome: 'Dados', feito: true, href: `#/eventos/${id}/preparar?passo=1` },
        { nome: 'Custos do evento', feito: !!evento.custos, href: `#/eventos/${id}/preparar?passo=2` },
        { nome: 'Estoque levado', feito: levado.size > 0, href: `#/eventos/${id}/preparar?passo=4` },
        { nome: semCusto ? `custo de ${semCusto} ${semCusto === 1 ? 'produto' : 'produtos'}` : 'Custo dos produtos', feito: !semCusto, href: `#/eventos/${id}/preparar?passo=5` },
        { nome: 'Enviar aos caixas', feito: enviado || !drive, href: `#/eventos/${id}/preparar?passo=6` }
      ];
    } else if (fase === 'durante') {
      const total = diasEntre(evento.dataInicio, evento.dataFim || evento.dataInicio);
      titulo = 'Evento acontecendo';
      detalhe = total > 1 ? `dia ${diasEntre(evento.dataInicio, hoje)} de ${total}` : 'hoje';
    } else if (fase === 'depois') {
      const contado = await lerContado(evento.id);
      const buscou = !!(busca && busca.eventoId === evento.id && diaLocalIso(busca.em) > (evento.dataFim || evento.dataInicio));
      titulo = 'Depois do evento';
      detalhe = 'hora de fechar';
      passos = [
        { nome: 'Buscar vendas dos caixas', feito: buscou, href: `#/eventos/${id}/fechar?passo=1` },
        { nome: 'Contagem final', feito: contado.size > 0, href: `#/eventos/${id}/fechar?passo=2` },
        { nome: semCusto ? `custo de ${semCusto} ${semCusto === 1 ? 'produto' : 'produtos'}` : 'Custo dos produtos', feito: !semCusto, href: `#/eventos/${id}/fechar?passo=3` },
        { nome: 'Fechar e encerrar', feito: false, href: `#/eventos/${id}/fechar?passo=4` }
      ];
    }
    const feitos = passos.filter((p) => p.feito).length;
    const proximo = passos.find((p) => !p.feito);
    const faltando = passos.filter((p) => !p.feito).map((p) => `<strong>${esc(p.nome.charAt(0).toLowerCase() + p.nome.slice(1))}</strong>`);
    const lado = fase === 'durante'
        ? `<div class="eg-progresso"><strong>${titulo} · ${esc(detalhe)}</strong>
            <span class="sub">${vendas.length ? `${vendas.length} ${vendas.length === 1 ? 'venda buscada' : 'vendas buscadas'} dos caixas${siglas.length ? ` (${esc(siglas.join(', '))})` : ''}` : 'Nenhuma venda buscada ainda'}${busca && busca.eventoId === evento.id ? ` · última busca ${quando(busca.em)}` : ''}</span></div>
           <div class="eg-botoes"><a class="btn" href="#/sincronizar">Buscar vendas dos caixas</a></div>`
        : `<div class="eg-progresso">
            <div class="eg-topo"><strong>${titulo}</strong><span class="sub">${feitos} de ${passos.length} passos</span></div>
            <div class="eg-barra" style="grid-template-columns:repeat(${passos.length}, minmax(0, 1fr))">${passos.map((p) => `<span class="${p.feito ? 'feito' : ''}" title="${esc(p.nome)}"></span>`).join('')}</div>
            <span class="sub">${faltando.length ? `Falta: ${faltando.join(', ').replace(/, ([^,]*)$/, ' e $1')}` : 'Tudo pronto.'}</span></div>
           ${proximo ? `<div class="eg-botoes"><a class="btn primario btn-grande" href="${proximo.href}">Continuar</a></div>` : ''}`;
    cartao = `<section class="cartao evento-gestao">
      <div class="eg-info"><span class="eg-rotulo">EVENTO EM USO</span><strong class="eg-nome">${esc(evento.nome)}${evento.teste ? ' <span class="etiqueta teste">Teste</span>' : ''}</strong>
        <span class="sub">${esc(periodo(evento.dataInicio, evento.dataFim))}${evento.local ? ` · ${esc(evento.local)}` : ''}${fase === 'antes' ? ` · ${esc(detalhe)}` : ''}</span></div>
      ${lado}</section>`;
  }

  // ---------- Grade ----------
  const ev = (rota) => (evento ? `#/eventos/${id}/${rota}` : '#/eventos');
  const grupos = [
    ['Evento', [['#/eventos/novo', 'mais', 'Novo evento'], [ev('preparar'), 'lista', 'Preparar evento'], [ev('fechar'), 'bandeira', 'Fechar evento'], ['#/eventos', 'calendario', 'Eventos'], [ev('estoque'), 'caixa', 'Estoque'], [ev('precos'), 'etiqueta', 'Preços do evento'], [ev('custos'), 'custos', 'Custos do evento'], [ev('fechamento'), 'grafico', 'Fechamento']]],
    ['Catálogo', [['#/produtos', 'sacola', 'Produtos'], ['#/produtos/precos', 'moeda', 'Preços e custos'], ['#/produtos/organizar', 'ajustes', 'Organizar'], ['#/produtos/codigos', 'barras', 'Folha de códigos']]],
    ['Caixas', [['#/sincronizar', 'enviar', 'Enviar aos caixas'], ['#/sincronizar', 'receber', 'Buscar vendas'], ['#/instalar', 'tablet', 'Instalar aparelho'], ['#/guia', 'livro', 'Guia do caixa']]],
    ['Relatórios', [['#/vendas', 'recibo', 'Histórico'], ['#/painel', 'grafico', 'Painel de vendas']]],
    ['Sistema', [['#/configuracoes/formas', 'cartao', 'Formas de pagamento'], ['#/configuracoes/retiradas', 'gaveta', 'Retiradas'], ['#/configuracoes', 'cadeado', 'Configurações'], ['acao:atualizar', 'atualizar', 'Atualizar app'], ['#/backup', 'salvar', 'Backup'], ['#/limpar', 'lixo', 'Apagar testes']]]
  ];

  el.innerHTML = `
    <header class="cab"><div><h1>Início</h1></div><span class="sub">${aparelho ? `${esc(aparelho.nome)} (${esc(aparelho.sigla)}) · ` : ''}Gestão · v${esc(VERSAO)}</span></header>
    ${avisos.length ? `<section class="cartao avisos-caixa"><ul class="lista-avisos">${avisos.map((a) => `
      <li class="${a.nivel}"><span>${a.texto}</span>${a.botao ? `<a class="btn" href="${a.botao[0]}">${a.botao[1]}</a>` : ''}</li>`).join('')}</ul></section>` : ''}
    ${cartao}
    <div class="grade-gestao">
      ${grupos.map(([nome, itens]) => `<section class="cartao grupo-gestao"><h2>${nome}</h2><div class="tiles-gestao">${itens.map(tile).join('')}</div></section>`).join('')}
    </div>`;
  el.querySelector('[data-acao="atualizar"]')?.addEventListener('click', async (e) => {
    const b = e.currentTarget; b.disabled = true;
    try {
      const r = await procurar();
      aviso(r === 'nova' ? 'Versão nova encontrada. Em instantes aparece no topo o botão Atualizar agora.'
        : r === 'sem-internet' ? 'Sem internet. Conecte e tente de novo.' : `O app já está na versão mais recente (${VERSAO}).`);
    } catch { aviso('Não foi possível procurar agora. Tente de novo em instantes.', { tipo: 'erro' }); }
    finally { b.disabled = false; }
  });
  el.querySelector('#usar-proximo')?.addEventListener('click', async () => { await definirEventoAtivo(usarProximo.id); renderGestao(el); });
}

function diaLocalIso(iso) { return new Date(iso).toLocaleDateString('sv-SE'); }
