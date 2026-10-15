// =========================================================
// Tela Eventos: lista dos eventos deste aparelho.
// O evento "em uso neste aparelho" é onde as vendas vão entrar.
// =========================================================
import { db, lerEventoAtivo } from '../db.js';
import { esc, periodo, icones, hojeISO } from '../ui.js';

export async function render(el) {
  const eventos = (await db.eventos.toArray()).sort((a, b) => (b.dataInicio || '').localeCompare(a.dataInicio || ''));
  const ativo = await lerEventoAtivo();
  const hoje = hojeISO();

  const cartao = (ev) => {
    const emUso = ativo && ativo.id === ev.id;
    const situacao = emUso ? '<span class="etiqueta marca">Em uso neste aparelho</span>'
      : ev.status === 'encerrado' ? '<span class="etiqueta">Encerrado</span>'
      : (ev.dataFim || ev.dataInicio) < hoje ? '<span class="etiqueta">Já passou</span>' : '';
    return `
      <li><a class="item-evento" href="#/eventos/${encodeURIComponent(ev.id)}">
        <div style="min-width:0">
          <div class="nome">${esc(ev.nome)}</div>
          <div class="detalhe">${esc(periodo(ev.dataInicio, ev.dataFim))}${ev.local ? ` <span aria-hidden="true">|</span> ${esc(ev.local)}` : ''}</div>
          <div class="detalhe" style="margin-top:6px">
            <span class="etiqueta num">${esc(ev.codigo)}</span>
            ${situacao}
          </div>
        </div>
        <span class="seta" aria-hidden="true">›</span>
      </a></li>`;
  };

  el.innerHTML = `
    <a class="voltar" href="#/mais">${icones.voltar} Mais</a>
    <header class="cab">
      <div><h1>Eventos</h1>
        <p class="sub">${eventos.length ? `${eventos.length} ${eventos.length === 1 ? 'evento' : 'eventos'} neste aparelho` : 'Crie o evento antes de vender: as vendas ficam guardadas dentro dele.'}</p></div>
      <a class="btn primario" href="#/eventos/novo">${icones.mais} Novo evento</a>
    </header>
    ${eventos.length
      ? `<ul class="lista">${eventos.map(cartao).join('')}</ul>`
      : `<div class="cartao vazio">
          <div class="simbolo" aria-hidden="true">在庫</div>
          <h2>Nenhum evento ainda</h2>
          <p>Cadastre a feira ou ação de venda com nome, local e datas.</p>
          <a class="btn primario" href="#/eventos/novo">Criar o primeiro evento</a>
        </div>`}`;
}
