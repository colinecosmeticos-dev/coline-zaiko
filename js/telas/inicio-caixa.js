// =========================================================
// Início do modo Caixa (v0.25.0). O app abre aqui, para conferir
// tudo antes de abrir o caixa:
//   - topo: aparelho, evento e dia do evento (ou "fora das datas");
//   - avisos (só quando há): sem catálogo, sem evento, caixa de outro
//     dia aberto, fora das datas, venda em andamento, vendas sem enviar,
//     versão nova do app;
//   - cartões: Caixa (abrir / vender / fechado), Sincronizar e Hoje
//     (só a quantidade de vendas; valores ficam no Painel, com PIN).
// =========================================================
import { db, lerEventoAtivo, lerAparelho, lerConfig, caixaAbertoDoEvento, caixaDoDia } from '../db.js';
import { esc, dinheiro, icones, hojeISO, diasEntre } from '../ui.js';
import { pendencias } from '../sincronizar.js';
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
  const drive = driveConfigurado();
  if (drive) prepararDrive().catch(() => {});
  const hoje = hojeISO();
  const [aparelho, evento, totalProdutos, recebida, ultimaSinc, pend] = await Promise.all([
    lerAparelho(), lerEventoAtivo(), db.produtos.count(), lerConfig('baseRecebida', null), lerConfig('ultimaSincronizacao', null),
    pendencias().catch(() => ({ vendas: 0, outros: 0, ultimo: null }))
  ]);
  const caixaAberto = evento ? await caixaAbertoDoEvento(evento.id) : null;
  const caixaHoje = evento ? await caixaDoDia(evento.id, hoje) : null;
  const caixaEsquecido = caixaAberto && caixaAberto.data !== hoje ? caixaAberto : null;
  const foraDasDatas = evento && !dentroDasDatas(evento, hoje);
  // Vendas de hoje deste aparelho (só a quantidade)
  const vendasHoje = evento ? (await db.vendas.where('eventoId').equals(evento.id).toArray())
    .filter((v) => (v.tipo || 'venda') === 'venda' && v.status !== 'cancelada' && diaLocal(v.criadoEm) === hoje
      && (!aparelho || !v.aparelho || v.aparelho.id === aparelho.id)).length : 0;

  let diaDoEvento = '';
  if (evento && !foraDasDatas) {
    const total = diasEntre(evento.dataInicio, evento.dataFim);
    diaDoEvento = total > 1 ? `Dia ${diasEntre(evento.dataInicio, hoje)} de ${total}` : 'Hoje';
  }

  // ---------- Avisos ----------
  const avisos = [];
  if (!totalProdutos) avisos.push({ nivel: 'atencao', texto: '<strong>Sem catálogo neste aparelho.</strong> Sincronize para receber os produtos da Gestão.', botao: drive ? ['sincronizar', 'Sincronizar agora'] : ['#/pacote', 'Receber catálogo'] });
  if (!evento) avisos.push({ nivel: 'atencao', texto: '<strong>Nenhum evento escolhido.</strong> As vendas precisam de um evento.', botao: ['evento', 'Escolher o evento'] });
  if (caixaEsquecido) avisos.push({ nivel: 'erro', texto: `<strong>O caixa de ${dataCurta(caixaEsquecido.data)} ainda está aberto.</strong> Feche (com a contagem do dinheiro) antes de abrir o de hoje.`, botao: ['#/caixa', 'Ir para o Caixa'] });
  if (foraDasDatas) avisos.push({ nivel: 'atencao', texto: `<strong>Hoje está fora das datas do evento</strong> ${esc(evento.nome)} (${periodoEvento(evento)}). Confira se é o evento certo.`, botao: ['evento', 'Trocar o evento'] });
  if (temVendaEmAndamento()) {
    const { quantidade, total } = calcularTotais();
    const pago = totalPago();
    avisos.push({ nivel: 'atencao', texto: `<strong>${carrinho.troca ? 'Troca' : 'Venda'} em andamento:</strong> <span class="num">${quantidade} ${quantidade === 1 ? 'item' : 'itens'} · ${dinheiro(Math.abs(total))}${pago ? ` · ${dinheiro(pago)} já pagos` : ''}</span>.`, botao: ['#/vender', 'Continuar venda'] });
  }
  const semEnviar = pend.vendas + pend.outros;
  if (drive && (!pend.ultimo || semEnviar)) avisos.push({ nivel: 'atencao', texto: !ultimaSinc ? '<strong>Este aparelho ainda não sincronizou.</strong>' : `<strong>${pend.vendas ? `${pend.vendas} ${pend.vendas === 1 ? 'venda' : 'vendas'}` : `${pend.outros} ${pend.outros === 1 ? 'registro' : 'registros'} de caixa`} sem enviar</strong> para a Gestão.`, botao: ['sincronizar', 'Sincronizar agora'] });
  if (temVersaoNova()) avisos.push({ nivel: 'info', texto: '<strong>Versão nova do app disponível.</strong> Toque em Atualizar agora, no topo da tela (fora do horário de venda).' });

  // ---------- Cartão do caixa ----------
  let cartaoCaixa;
  if (!evento) cartaoCaixa = { estado: 'Sem evento', detalhe: 'Escolha o evento para abrir o caixa.', botoes: '' };
  else if (caixaEsquecido) cartaoCaixa = { estado: 'Caixa anterior aberto', detalhe: `Aberto em ${dataCurta(caixaEsquecido.data)}.`, botoes: '<a class="btn primario" href="#/caixa">Fechar o caixa anterior</a>' };
  else if (caixaAberto) cartaoCaixa = { estado: 'Aberto', ok: true, detalhe: `Desde ${hora(caixaAberto.abertoEm)}${caixaAberto.foraDasDatas ? ' · fora das datas do evento' : ''}.`, botoes: '<a class="btn primario btn-grande" href="#/vender">Vender</a><a class="btn" href="#/caixa">Caixa</a>' };
  else if (caixaHoje) cartaoCaixa = { estado: 'Fechado', detalhe: `Fechado hoje${(caixaHoje.fechamentos || []).at(-1) ? ` às ${hora(caixaHoje.fechamentos.at(-1).em)}` : ''}. Para vender de novo, reabra na tela Caixa.`, botoes: '<a class="btn" href="#/caixa">Ir para o Caixa</a>' };
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
      ${avisos.length ? `<h2>Antes de vender</h2>
      <ul class="lista-avisos">${avisos.map((a) => `
        <li class="${a.nivel}"><span>${a.texto}</span>${a.botao ? (a.botao[0].startsWith('#') ? `<a class="btn" href="${a.botao[0]}">${a.botao[1]}</a>` : `<button type="button" class="btn" data-acao="${a.botao[0]}">${a.botao[1]}</button>`) : ''}</li>`).join('')}
      </ul>` : '<p class="tudo-certo-texto"><span class="marca-ok pequena" aria-hidden="true">✓</span> Tudo certo para vender.</p>'}
    </section>

    <div class="grade-inicio grade-inicio-caixa">
      <section class="cartao cartao-caixa ${cartaoCaixa.ok ? 'aberto' : ''}">
        <h2>Caixa</h2>
        <p class="estado-caixa">${cartaoCaixa.estado}</p>
        <p class="sub">${cartaoCaixa.detalhe}</p>
        <div class="acoes" style="justify-content:flex-start">${cartaoCaixa.botoes}</div>
      </section>

      ${drive ? `<section class="cartao">
        <h2>Sincronizar</h2>
        <ul class="sinc-lista">
          <li><span>Base da Gestão</span><strong>${recebida ? `${recebida.versao ? `nº ${recebida.versao}, ` : ''}${quando(recebida.publicadoEm)}` : 'não recebida'}</strong></li>
          <li><span>Última sincronização</span><strong>${quando(ultimaSinc && ultimaSinc.em)}</strong></li>
        </ul>
        <div class="acoes" style="justify-content:flex-start"><button type="button" class="btn" data-acao="sincronizar">${icones.compartilhar} Sincronizar agora</button></div>
      </section>` : ''}

      <section class="cartao">
        <h2>Hoje</h2>
        <p class="numero-grande">${vendasHoje}</p>
        <p class="sub">${vendasHoje === 1 ? 'venda neste aparelho' : 'vendas neste aparelho'}. Valores no Painel de vendas (Mais), com o PIN.</p>
      </section>
    </div>

    <p class="sub rotina-caixa">Rotina: <strong>Sincronizar</strong> → <strong>Abrir caixa</strong> → <strong>Vender</strong> → <strong>Fechar o caixa e sincronizar</strong></p>`;

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
