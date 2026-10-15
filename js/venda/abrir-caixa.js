// =========================================================
// Janela "Abrir caixa": aparece ao entrar em Vender quando o
// caixa do dia ainda não foi aberto neste aparelho.
// =========================================================
import { abrirCaixa } from '../db.js';
import { abrirJanela, campoDinheiro, lerCentavos, esc, hojeISO, diasEntre } from '../ui.js';

export function pedirAberturaCaixa(evento, caixaAntigo) {
  return new Promise((resolver) => {
    const hoje = hojeISO();
    const total = diasEntre(evento.dataInicio, evento.dataFim);
    const dia = hoje >= evento.dataInicio && hoje <= evento.dataFim && total > 1 ? `Dia ${diasEntre(evento.dataInicio, hoje)} de ${total} do evento.` : '';
    const antigo = caixaAntigo
      ? `<p class="aviso-inline">O caixa de ${new Date(caixaAntigo.data + 'T12:00').toLocaleDateString('pt-BR')} ainda está aberto. O fechamento de caixa chega numa próxima etapa; por enquanto, abra o de hoje.</p>`
      : '';
    let caixa = null;
    const d = abrirJanela(`
      <form method="dialog" novalidate>
        <h2>Abrir caixa</h2>
        <p>${esc(evento.nome)}. ${dia} Conte o dinheiro de troco e informe o valor.</p>
        ${antigo}
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
      caixa = await abrirCaixa({ eventoId: evento.id, data: hoje, trocoInicial: lerCentavos(campo) || 0 });
      d.close();
    });
  });
}
