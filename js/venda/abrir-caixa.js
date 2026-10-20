// =========================================================
// Janela "Abrir caixa": aparece ao entrar em Vender (ou na tela Caixa)
// quando o caixa do dia ainda não foi aberto neste aparelho.
//
// Hoje fora das datas do evento (v0.25.0): antes do troco, avisa e
// oferece "Trocar o evento" ou "Abrir mesmo assim". O caixa aberto
// assim fica marcado (foraDasDatas) e o Fechamento mostra.
// Devolve o caixa aberto, 'outro-evento' (escolheu outro evento:
// quem chamou desenha de novo) ou null.
// =========================================================
import { db, abrirCaixa, definirEventoAtivo } from '../db.js';
import { abrirJanela, campoDinheiro, lerCentavos, esc, hojeISO, diasEntre } from '../ui.js';
import { ehCaixa } from '../modo.js';
import { escolherEvento } from './escolher-evento.js';

const dataBR = (iso) => (iso ? new Date(iso + 'T12:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '');

// Hoje está dentro das datas do evento? (evento sem datas: considera que sim)
export function dentroDasDatas(evento, hoje = hojeISO()) {
  if (!evento || !evento.dataInicio) return true;
  return hoje >= evento.dataInicio && hoje <= (evento.dataFim || evento.dataInicio);
}
export const periodoEvento = (evento) => (evento.dataFim && evento.dataFim !== evento.dataInicio
  ? `${dataBR(evento.dataInicio)} a ${dataBR(evento.dataFim)}` : dataBR(evento.dataInicio));

let escolhaDoDia = null;   // { dia, eventoId }: evento escolhido hoje entre os do dia

export async function pedirAberturaCaixa(evento) {
  const hoje = hojeISO();
  // Dois ou mais eventos acontecendo hoje (v0.27.0): pergunta em qual vender
  // (a escolha vale para o dia: depois de escolher, a abertura segue sem perguntar de novo)
  const deHoje = (await db.eventos.toArray()).filter((e) => e.status !== 'encerrado' && dentroDasDatas(e, hoje) && e.dataInicio);
  const jaEscolheu = escolhaDoDia && escolhaDoDia.dia === hoje && escolhaDoDia.eventoId === evento.id;
  if (deHoje.length > 1 && !jaEscolheu) {
    const escolhido = await escolherEntre(deHoje, evento);
    if (!escolhido) return null;
    escolhaDoDia = { dia: hoje, eventoId: escolhido.id };
    if (escolhido.id !== evento.id) { await definirEventoAtivo(escolhido.id); return 'outro-evento'; }
  }
  let fora = false;
  if (!dentroDasDatas(evento, hoje)) {
    const escolha = await avisarForaDasDatas(evento, hoje);
    if (escolha === 'trocar') {
      if (ehCaixa()) return (await escolherEvento()) ? 'outro-evento' : null;
      location.hash = '#/eventos';
      return null;
    }
    if (escolha !== 'abrir') return null;
    fora = true;
  }
  return new Promise((resolver) => {
    const total = diasEntre(evento.dataInicio, evento.dataFim);
    const dia = !fora && total > 1 ? `Dia ${diasEntre(evento.dataInicio, hoje)} de ${total} do evento.` : '';
    let caixa = null;
    const d = abrirJanela(`
      <form method="dialog" novalidate>
        <h2>Abrir caixa</h2>
        <p>${esc(evento.nome)}. ${dia} Conte o dinheiro de troco e informe o valor.</p>
        <div class="campo" style="margin-top:16px">
          <label for="troco-inicial">Troco inicial</label>
          <input class="entrada entrada-grande" id="troco-inicial">
        </div>
        <div class="acoes">
          <button type="button" class="btn" value="cancelar">Agora não</button>
          <button type="submit" class="btn primario">Abrir caixa</button>
        </div>
      </form>`, { aoFechar: () => resolver(caixa) });
    const campo = d.querySelector('#troco-inicial');
    campoDinheiro(campo, { permitirZero: true });
    campo.focus();
    d.querySelector('[value="cancelar"]').addEventListener('click', () => d.close());
    d.querySelector('form').addEventListener('submit', async (e) => {
      e.preventDefault();
      caixa = await abrirCaixa({ eventoId: evento.id, data: hoje, trocoInicial: lerCentavos(campo) || 0, foraDasDatas: fora });
      d.close();
    });
  });
}

// Hoje há mais de um evento: um toque escolhe (o em uso vem marcado)
function escolherEntre(eventos, atual) {
  return new Promise((resolver) => {
    let escolhido = null;
    const d = abrirJanela(`
      <h2>Em qual evento você vai vender hoje?</h2>
      <p>Hoje há ${eventos.length} eventos acontecendo. As vendas deste caixa entram no evento escolhido.</p>
      <ul class="lista lista-links" style="margin-top:12px">
        ${eventos.map((e) => `<li><button type="button" class="link-evento" data-evento="${esc(e.id)}">
          <span><strong>${esc(e.nome)}</strong>${atual && atual.id === e.id ? ' <span class="etiqueta marca">em uso</span>' : ''}<br>
          <span class="sub">${esc(e.local || '')}${e.local ? ' · ' : ''}${periodoEvento(e)} · ${esc(e.codigo || '')}</span></span>
          <span class="seta" aria-hidden="true">›</span></button></li>`).join('')}
      </ul>
      <div class="acoes"><button type="button" class="btn" id="cancelar">Agora não</button></div>`, { aoFechar: () => resolver(escolhido) });
    d.querySelector('#cancelar').addEventListener('click', () => d.close());
    d.querySelectorAll('[data-evento]').forEach((b) => b.addEventListener('click', () => { escolhido = eventos.find((e) => e.id === b.dataset.evento); d.close(); }));
  });
}

// 'trocar', 'abrir' ou null (desistiu)
function avisarForaDasDatas(evento, hoje) {
  return new Promise((resolver) => {
    let escolha = null;
    const d = abrirJanela(`
      <h2>Hoje (${dataBR(hoje)}) não é um dia do evento</h2>
      <p><strong>${esc(evento.nome)}</strong> vai de ${periodoEvento(evento)}. As vendas de hoje vão entrar nesse evento.</p>
      <p class="sub">Se o evento estiver certo (prorrogado, venda na montagem, teste), abra mesmo assim: o Fechamento vai mostrar que este caixa foi aberto fora das datas.</p>
      <div class="acoes acoes-empilhadas">
        <button type="button" class="btn primario" id="trocar">Trocar o evento</button>
        <button type="button" class="btn" id="abrir">Abrir mesmo assim</button>
        <button type="button" class="btn texto" id="cancelar">Agora não</button>
      </div>`, { aoFechar: () => resolver(escolha) });
    d.querySelector('#cancelar').addEventListener('click', () => d.close());
    d.querySelector('#abrir').addEventListener('click', () => { escolha = 'abrir'; d.close(); });
    d.querySelector('#trocar').addEventListener('click', () => { escolha = 'trocar'; d.close(); });
  });
}
