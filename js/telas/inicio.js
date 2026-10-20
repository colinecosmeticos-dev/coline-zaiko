// =========================================================
// Tela Início, igual nos dois modos (Caixa desde a v0.25.0; Gestão na
// mesma tela desde a v0.26.0). O app abre aqui, para conferir tudo
// antes de abrir o caixa:
//   - topo: aparelho, evento e dia do evento (ou "fora das datas");
//   - avisos "Antes de vender" (só quando há): sem catálogo, sem evento,
//     caixa de outro dia aberto, fora das datas, venda em andamento,
//     versão nova do app; Caixa: vendas sem enviar / nunca sincronizado;
//     Gestão: alterações não publicadas para os caixas;
//   - cartões no Caixa: Caixa (abrir / vender / fechado), Sincronizar e Hoje
//     (só a quantidade de vendas; valores no Painel, com PIN);
//     na Gestão (que não vende desde a v0.28.0): Evento, Base dos caixas,
//     Catálogo e Vendas do evento (as já buscadas dos caixas).
// =========================================================
import { db, lerEventoAtivo, lerAparelho, lerConfig, caixaAbertoDoEvento, caixaDoDia } from '../db.js';
import { ehCaixa } from '../modo.js';
import { situacaoBase } from '../sincronizar.js';
import { esc, dinheiro, icones, hojeISO, diasEntre, periodo } from '../ui.js';
import { precisaSincronizar } from '../sincronizar.js';
import { driveConfigurado, prepararDrive } from '../drive.js';
import { iniciarSincronizacao } from './sincronizar.js';
import { diaLocal } from './vendas.js';
import { temVersaoNova } from '../atualizacao.js';
import { carrinho, temVendaEmAndamento, calcularTotais, totalPago } from '../venda/carrinho.js';
import { pedirAberturaCaixa, dentroDasDatas, periodoEvento } from '../venda/abrir-caixa.js';
import { escolherEvento } from '../venda/escolher-evento.js';

const hora = (iso) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
const dataCurta = (iso) => new Date(iso + 'T12:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
const quando = (iso) => {
  if (!iso) return 'nunca';
  const d = new Date(iso);
  return d.toDateString() === new Date().toDateString() ? `hoje às ${hora(iso)}` : `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} às ${hora(iso)}`;
};

export async function render(el) {
  const gestao = !ehCaixa();
  const drive = driveConfigurado();
  if (drive) prepararDrive().catch(() => {});
  const hoje = hojeISO();
  const [aparelho, evento, totalProdutos, recebida, ultimaSinc, pend] = await Promise.all([
    lerAparelho(), lerEventoAtivo(), db.produtos.count(), lerConfig('baseRecebida', null), lerConfig('ultimaSincronizacao', null),
    precisaSincronizar().catch(() => ({ vendas: 0, outros: 0, ultimo: null, urgente: false }))
  ]);
  const [totalItens, totalEventos, base] = gestao
    ? await Promise.all([db.variacoes.count(), db.eventos.count(), drive ? situacaoBase().catch(() => null) : null])
    : [0, 0, null];
  const caixaAberto = evento ? await caixaAbertoDoEvento(evento.id) : null;
  const caixaHoje = evento ? await caixaDoDia(evento.id, hoje) : null;
  const caixaEsquecido = caixaAberto && caixaAberto.data !== hoje ? caixaAberto : null;
  const foraDasDatas = evento && !dentroDasDatas(evento, hoje);
  // Vendas de hoje deste aparelho (só a quantidade)
  const vendasEvento = evento ? (await db.vendas.where('eventoId').equals(evento.id).toArray())
    .filter((v) => (v.tipo || 'venda') === 'venda' && v.status !== 'cancelada') : [];
  const vendasHoje = vendasEvento.filter((v) => diaLocal(v.criadoEm) === hoje && (!aparelho || !v.aparelho || v.aparelho.id === aparelho.id)).length;
  const siglasEvento = [...new Set(vendasEvento.map((v) => v.aparelho?.sigla).filter(Boolean))];

  let diaDoEvento = '';
  if (evento && !foraDasDatas) {
    const total = diasEntre(evento.dataInicio, evento.dataFim);
    diaDoEvento = total > 1 ? `Dia ${diasEntre(evento.dataInicio, hoje)} de ${total}` : 'Hoje';
  }

  // ---------- Avisos ----------
  const avisos = [];
  if (!totalProdutos) avisos.push(gestao
    ? { nivel: 'atencao', texto: '<strong>Nenhum produto cadastrado.</strong> O catálogo é a base da tela de venda.', botao: ['#/produtos/novo', 'Cadastrar produto'] }
    : { nivel: 'atencao', texto: '<strong>Sem catálogo neste aparelho.</strong> Sincronize para receber os produtos da Gestão.', botao: drive ? ['sincronizar', 'Sincronizar agora'] : ['#/sincronizar', 'Ir para Sincronizar'] });
  if (!evento) avisos.push({ nivel: 'atencao', texto: '<strong>Nenhum evento em uso.</strong> As vendas precisam de um evento.', botao: gestao ? ['#/eventos', totalEventos ? 'Escolher o evento' : 'Criar evento'] : ['evento', 'Escolher o evento'] });
  // Gestão: algo mudou (evento novo, preços, produtos...) e os caixas ainda não receberam
  if (gestao && base && (!base.publicada || base.alterada)) avisos.push({ nivel: 'atencao', texto: base.publicada ? '<strong>Há alterações não enviadas aos caixas</strong> (evento, preços, produtos ou formas de pagamento). Publique a base e sincronize os caixas.' : '<strong>A base para os caixas ainda não foi publicada.</strong>', botao: ['#/sincronizar', 'Publicar base'] });
  if (caixaEsquecido && !gestao) avisos.push({ nivel: 'erro', texto: `<strong>O caixa de ${dataCurta(caixaEsquecido.data)} ainda está aberto.</strong> Feche (com a contagem do dinheiro) antes de abrir o de hoje.`, botao: ['#/caixa', 'Ir para a Gaveta'] });
  if (foraDasDatas) avisos.push({ nivel: 'atencao', texto: `<strong>Hoje está fora das datas do evento</strong> ${esc(evento.nome)} (${periodoEvento(evento)}). Confira se é o evento certo.`, botao: gestao ? ['#/eventos', 'Trocar o evento'] : ['evento', 'Trocar o evento'] });
  if (temVendaEmAndamento() && !gestao) {
    const { quantidade, total } = calcularTotais();
    const pago = totalPago();
    avisos.push({ nivel: 'atencao', texto: `<strong>${carrinho.troca ? 'Troca' : 'Venda'} em andamento:</strong> <span class="num">${quantidade} ${quantidade === 1 ? 'item' : 'itens'} · ${dinheiro(Math.abs(total))}${pago ? ` · ${dinheiro(pago)} já pagos` : ''}</span>.`, botao: ['#/vender', 'Continuar venda'] });
  }
  const semEnviar = pend.vendas + pend.outros;
  // Caixa: só quando é hora de sincronizar (caixa fechado com vendas sem enviar)
  if (!gestao && drive && pend.urgente && semEnviar) avisos.push({ nivel: 'erro', texto: `<strong>${pend.vendas ? `${pend.vendas} ${pend.vendas === 1 ? 'venda' : 'vendas'}` : `${pend.outros} ${pend.outros === 1 ? 'registro' : 'registros'} de caixa`} sem enviar para a Gestão.</strong> O caixa não está aberto: sincronize para não perder nada se acontecer algo com o aparelho.`, botao: ['sincronizar', 'Sincronizar agora'] });
  if (temVersaoNova()) avisos.push({ nivel: 'info', texto: '<strong>Versão nova do app disponível.</strong> Toque em Atualizar agora, no topo da tela (fora do horário de venda).' });

  // ---------- Cartão do caixa ----------
  let cartaoCaixa;
  if (!evento) cartaoCaixa = { estado: 'Sem evento', detalhe: 'Escolha o evento para abrir o caixa.', botoes: '' };
  else if (caixaEsquecido) cartaoCaixa = { estado: 'Caixa anterior aberto', detalhe: `Aberto em ${dataCurta(caixaEsquecido.data)}.`, botoes: '<a class="btn primario" href="#/caixa">Fechar na Gaveta</a>' };
  else if (caixaAberto) cartaoCaixa = { estado: 'Aberto', ok: true, detalhe: `Desde ${hora(caixaAberto.abertoEm)}${caixaAberto.foraDasDatas ? ' · fora das datas do evento' : ''}.`, botoes: '<a class="btn primario btn-grande" href="#/vender">Vender</a><a class="btn" href="#/caixa">Gaveta</a>' };
  else if (caixaHoje) cartaoCaixa = { estado: 'Fechado', detalhe: `Fechado hoje${(caixaHoje.fechamentos || []).at(-1) ? ` às ${hora(caixaHoje.fechamentos.at(-1).em)}` : ''}. Para vender de novo, reabra na Gaveta.`, botoes: '<a class="btn" href="#/caixa">Ir para a Gaveta</a>' };
  else cartaoCaixa = { estado: 'Ainda não aberto', detalhe: 'Confira os avisos e abra o caixa com o troco do dia.', botoes: `<button type="button" class="btn primario btn-grande" id="abrir-caixa" ${totalProdutos ? '' : 'disabled'}>Abrir caixa</button>` };

  el.innerHTML = `
    <div class="saudacao">
      <span class="kanji" aria-hidden="true">在庫</span>
      <div>
        <h1>${aparelho ? esc(aparelho.nome) : 'Caixa'} ${aparelho ? `<span class="etiqueta">${esc(aparelho.sigla)}</span>` : ''}</h1>
        <p class="sub">${evento ? `<strong>${esc(evento.nome)}</strong>${diaDoEvento ? ` · ${diaDoEvento}` : ''}${foraDasDatas ? ' · <span class="texto-atencao">fora das datas</span>' : ''}` : 'Nenhum evento escolhido'}</p>
      </div>
    </div>

    <section class="cartao avisos-caixa ${avisos.length ? '' : 'tudo-certo'}" aria-live="polite">
      ${avisos.length ? `<h2>${gestao ? 'Avisos' : 'Antes de vender'}</h2>
      <ul class="lista-avisos">${avisos.map((a) => `
        <li class="${a.nivel}"><span>${a.texto}</span>${a.botao ? (a.botao[0].startsWith('#') ? `<a class="btn" href="${a.botao[0]}">${a.botao[1]}</a>` : `<button type="button" class="btn" data-acao="${a.botao[0]}">${a.botao[1]}</button>`) : ''}</li>`).join('')}
      </ul>` : `<p class="tudo-certo-texto"><span class="marca-ok pequena" aria-hidden="true">✓</span> ${gestao ? 'Tudo certo.' : 'Tudo certo para vender.'}</p>`}
    </section>

    <div class="grade-inicio grade-inicio-caixa">
      ${gestao ? '' : `<section class="cartao cartao-caixa ${cartaoCaixa.ok ? 'aberto' : ''}">
        <h2>Caixa</h2>
        <p class="estado-caixa">${cartaoCaixa.estado}</p>
        <p class="sub">${cartaoCaixa.detalhe}</p>
        <div class="acoes" style="justify-content:flex-start">${cartaoCaixa.botoes}</div>
      </section>`}

      ${gestao ? `<section class="cartao">
        <h2>Evento</h2>
        ${evento ? `<p class="titulo-evento">${esc(evento.nome)}</p>
          <p class="sub">${esc(periodo(evento.dataInicio, evento.dataFim))}${evento.local ? ` em ${esc(evento.local)}` : ''}</p>
          <div class="acoes" style="justify-content:flex-start"><a class="btn" href="#/eventos/${encodeURIComponent(evento.id)}">Ver evento</a><a class="btn texto" href="#/eventos">Trocar</a></div>`
          : `<p class="sub">Nenhum evento em uso.</p><div class="acoes" style="justify-content:flex-start"><a class="btn primario" href="${totalEventos ? '#/eventos' : '#/eventos/novo'}">${totalEventos ? 'Escolher evento' : 'Criar evento'}</a></div>`}
      </section>
      ${base ? `<section class="cartao">
        <h2>Base dos caixas</h2>
        <p class="estado-caixa ${!base.publicada || base.alterada ? 'pendente' : 'ok'}">${!base.publicada ? 'Não publicada' : base.alterada ? 'Há alterações' : 'Em dia'}</p>
        <p class="sub">${base.publicada ? `Base nº ${base.publicada.versao} publicada ${quando(base.publicada.em)}.` : 'Os caixas recebem o catálogo e o evento pela base.'}</p>
        <div class="acoes" style="justify-content:flex-start"><a class="btn ${!base.publicada || base.alterada ? 'primario' : ''}" href="#/sincronizar">${!base.publicada || base.alterada ? 'Publicar base' : 'Sincronizar'}</a></div>
      </section>` : ''}
      <section class="cartao">
        <h2>Catálogo</h2>
        <p class="numero-grande">${totalProdutos}</p>
        <p class="sub">${totalProdutos === 1 ? 'produto' : 'produtos'}, com ${totalItens} ${totalItens === 1 ? 'item vendável' : 'itens vendáveis'}</p>
        <div class="acoes" style="justify-content:flex-start"><a class="btn" href="#/produtos">Ver produtos</a><a class="btn texto" href="#/produtos/novo">Novo produto</a></div>
      </section>` : ''}

      ${!gestao && drive ? `<section class="cartao">
        <h2>Sincronizar</h2>
        <ul class="sinc-lista">
          <li><span>Base da Gestão</span><strong>${recebida ? `${recebida.versao ? `nº ${recebida.versao}, ` : ''}${quando(recebida.publicadoEm)}` : 'não recebida'}</strong></li>
          <li><span>Última sincronização</span><strong>${quando(ultimaSinc && ultimaSinc.em)}</strong></li>
        </ul>
        <div class="acoes" style="justify-content:flex-start"><button type="button" class="btn" data-acao="sincronizar">${icones.compartilhar} Sincronizar agora</button></div>
      </section>` : ''}

      ${gestao ? (evento ? `<section class="cartao">
        <h2>Vendas do evento</h2>
        <p class="numero-grande">${vendasEvento.length}</p>
        <p class="sub">${vendasEvento.length === 1 ? 'venda' : 'vendas'} já buscadas${siglasEvento.length ? ` (${esc(siglasEvento.join(', '))})` : ''}. Valores no Painel de vendas (Mais), com o PIN.</p>
        <div class="acoes" style="justify-content:flex-start"><a class="btn" href="#/sincronizar">Buscar vendas dos caixas</a><a class="btn texto" href="#/vendas">Histórico</a></div>
      </section>` : '') : `<section class="cartao">
        <h2>Hoje</h2>
        <p class="numero-grande">${vendasHoje}</p>
        <p class="sub">${vendasHoje === 1 ? 'venda neste aparelho' : 'vendas neste aparelho'}. Valores no Painel de vendas (Mais), com o PIN.</p>
      </section>`}
    </div>

    <p class="sub rotina-caixa">${gestao
      ? 'Antes do evento: <strong>Evento e preços</strong> → <strong>Estoque levado</strong> → <strong>Publicar base</strong>. Depois: <strong>Buscar vendas dos caixas</strong> → <strong>Fechamento</strong>'
      : 'Rotina: <strong>Sincronizar</strong> → <strong>Abrir caixa</strong> → <strong>Vender</strong> → <strong>Fechar o caixa e sincronizar</strong>'}</p>`;

  // ---------- Ações ----------
  el.querySelectorAll('[data-acao="sincronizar"]').forEach((b) => b.addEventListener('click', async () => {
    await iniciarSincronizacao();   // direto no toque (o Google exige)
    if (el.isConnected) render(el);
  }));
  el.querySelectorAll('[data-acao="evento"]').forEach((b) => b.addEventListener('click', async () => {
    if (await escolherEvento()) render(el);
  }));
  el.querySelector('#abrir-caixa')?.addEventListener('click', async () => {
    const r = await pedirAberturaCaixa(evento);
    if (r === 'outro-evento') render(el);
    else if (r) location.hash = '#/vender';
  });
}
