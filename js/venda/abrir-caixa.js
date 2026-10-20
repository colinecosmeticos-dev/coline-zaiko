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
import { abrirCaixa } from '../db.js';
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

export async function pedirAberturaCaixa(evento) {
  const hoje = hojeISO();
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
