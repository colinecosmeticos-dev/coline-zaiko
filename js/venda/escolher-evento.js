// =========================================================
// Escolher o evento em uso sem sair da tela (usado no modo Caixa,
// que não tem a tela Eventos). Lista os eventos abertos que vieram
// no pacote da Gestão; um toque escolhe.
// =========================================================
import { db, lerEventoAtivo, definirEventoAtivo } from '../db.js';
import { esc, abrirJanela, hojeISO } from '../ui.js';

const data = (iso) => (iso ? new Date(iso + 'T12:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '');

export async function escolherEvento() {
  const atual = await lerEventoAtivo();
  // Os de hoje primeiro (destacados); depois, os mais recentes
  const hoje = hojeISO();
  const ehHoje = (e) => !!e.dataInicio && hoje >= e.dataInicio && hoje <= (e.dataFim || e.dataInicio);
  const eventos = (await db.eventos.toArray()).filter((e) => e.status !== 'encerrado')
    .sort((a, b) => ehHoje(b) - ehHoje(a) || (b.dataInicio || '').localeCompare(a.dataInicio || ''));
  return new Promise((resolver) => {
    let escolhido = null;
    const d = abrirJanela(`
      <h2>Escolha o evento</h2>
      ${eventos.length ? `<p>As vendas deste aparelho entram no evento escolhido.</p>
      <ul class="lista lista-links" style="margin-top:12px">
        ${eventos.map((e) => `<li><button type="button" class="link-evento" data-evento="${esc(e.id)}">
          <span><strong>${esc(e.nome)}</strong>${ehHoje(e) ? ' <span class="etiqueta ok">hoje</span>' : ''}${atual && atual.id === e.id ? ' <span class="etiqueta marca">em uso</span>' : ''}<br>
          <span class="sub">${esc(e.local || '')}${e.local ? ' · ' : ''}${data(e.dataInicio)}${e.dataFim && e.dataFim !== e.dataInicio ? ' a ' + data(e.dataFim) : ''} · ${esc(e.codigo || '')}</span></span>
          <span class="seta" aria-hidden="true">›</span></button></li>`).join('')}
      </ul>` : `<p>Nenhum evento aberto neste aparelho. Toque em Sincronizar para receber os eventos da Gestão.</p>`}
      <div class="acoes">
        ${eventos.length ? '' : '<a class="btn primario" href="#/sincronizar" id="ir-pacote">Ir para Sincronizar</a>'}
        <button type="button" class="btn" id="cancelar">Cancelar</button>
      </div>`, { aoFechar: () => resolver(escolhido) });
    d.querySelector('#cancelar').addEventListener('click', () => d.close());
    d.querySelector('#ir-pacote')?.addEventListener('click', () => d.close());
    d.querySelectorAll('[data-evento]').forEach((b) => b.addEventListener('click', async () => {
      await definirEventoAtivo(b.dataset.evento);
      escolhido = eventos.find((e) => e.id === b.dataset.evento);
      d.close();
    }));
  });
}
