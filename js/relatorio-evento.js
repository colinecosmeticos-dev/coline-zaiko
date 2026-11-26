// =========================================================
// Evento dos relatórios (Histórico e Painel de vendas). v0.38.0
// Caixa: sempre o evento em uso (como antes).
// Gestão: o evento escolhido na própria tela, num seletor no topo; sem
// escolha, o evento em uso; sem evento em uso (ex.: o último foi encerrado),
// o evento mais recente com vendas. Escolher aqui NÃO muda o evento em uso.
// A escolha vale enquanto o app está aberto e é a mesma nas duas telas.
// =========================================================
import { db, lerEventoAtivo } from './db.js';
import { esc, periodo } from './ui.js';
import { ehCaixa } from './modo.js';

let escolhidoId = null;

export async function eventoDoRelatorio() {
  const emUso = await lerEventoAtivo();
  if (ehCaixa()) return { evento: emUso, eventos: [], emUso };
  const eventos = (await db.eventos.toArray()).sort((a, b) => (b.dataInicio || '').localeCompare(a.dataInicio || ''));
  let evento = escolhidoId && eventos.find((e) => e.id === escolhidoId);
  if (!evento) evento = emUso;
  if (!evento) {
    for (const e of eventos) if (await db.vendas.where('eventoId').equals(e.id).count()) { evento = e; break; }
  }
  if (!evento) evento = eventos[0] || null;
  return { evento, eventos, emUso };
}

// Seletor do evento (só na Gestão, com mais de um evento). aoTrocar() redesenha a tela.
export function seletorEvento({ evento, eventos, emUso }) {
  if (ehCaixa() || eventos.length < 2) return '';
  return `<label class="seletor-evento"><span>Evento</span>
    <select class="entrada" id="seletor-evento">${eventos.map((e) => `<option value="${esc(e.id)}" ${e.id === evento?.id ? 'selected' : ''}>${esc(e.nome)} · ${esc(periodo(e.dataInicio, e.dataFim))}${emUso && e.id === emUso.id ? ' (em uso)' : e.status === 'encerrado' ? ' (encerrado)' : ''}${e.teste ? ' · teste' : ''}</option>`).join('')}</select></label>`;
}
export function ligarSeletor(el, aoTrocar) {
  el.querySelector('#seletor-evento')?.addEventListener('change', (e) => { escolhidoId = e.target.value; aoTrocar(); });
}
