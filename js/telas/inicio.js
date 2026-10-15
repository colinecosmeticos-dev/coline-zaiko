// Tela Início: situação geral do aparelho
import { db, lerEventoAtivo, lerAparelho } from '../db.js';
import { esc, periodo, hojeISO, diasEntre } from '../ui.js';

export async function render(el) {
  const totalProdutos = await db.produtos.count();
  const totalItens = await db.variacoes.count();
  const evento = await lerEventoAtivo();
  const aparelho = await lerAparelho();
  const totalEventos = await db.eventos.count();

  // Em qual dia do evento estamos (ex.: "Dia 2 de 3")
  let diaDoEvento = '';
  if (evento) {
    const hoje = hojeISO();
    const total = diasEntre(evento.dataInicio, evento.dataFim);
    if (hoje < evento.dataInicio) diaDoEvento = `Começa em ${diasEntre(hoje, evento.dataInicio) - 1} ${diasEntre(hoje, evento.dataInicio) - 1 === 1 ? 'dia' : 'dias'}`;
    else if (hoje > evento.dataFim) diaDoEvento = 'As datas do evento já passaram';
    else diaDoEvento = total > 1 ? `Hoje é o dia ${diasEntre(evento.dataInicio, hoje)} de ${total}` : 'Hoje';
  }

  el.innerHTML = `
    <div class="saudacao">
      <span class="kanji" aria-hidden="true">在庫</span>
      <div>
        <h1>Coline Zaiko</h1>
        ${aparelho ? `<p class="sub">${esc(aparelho.nome)} <span class="etiqueta">${esc(aparelho.sigla)}</span></p>` : ''}
      </div>
    </div>

    ${aparelho ? '' : `
    <section class="cartao destaque" style="margin-bottom:16px">
      <h2>Identifique este aparelho</h2>
      <p class="sub">Dê um nome e uma sigla a este tablet, para saber qual aparelho fez cada venda.</p>
      <div class="acoes"><a class="btn primario" href="#/configuracoes">Configurar aparelho</a></div>
    </section>`}

    <div class="grade-inicio">
      <section class="cartao">
        <h2>Evento</h2>
        ${evento
          ? `<p class="titulo-evento">${esc(evento.nome)}</p>
             <p class="sub">${esc(periodo(evento.dataInicio, evento.dataFim))}${evento.local ? ` em ${esc(evento.local)}` : ''}</p>
             <p class="sub" style="margin-top:4px"><strong>${esc(diaDoEvento)}</strong></p>
             <div class="acoes"><a class="btn" href="#/eventos/${encodeURIComponent(evento.id)}">Ver evento</a><a class="btn texto" href="#/eventos">Trocar</a></div>`
          : `<p class="sub">Nenhum evento em uso neste aparelho. As vendas precisam de um evento.</p>
             <div class="acoes">${totalEventos
               ? '<a class="btn primario" href="#/eventos">Escolher evento</a><a class="btn texto" href="#/eventos/novo">Novo evento</a>'
               : '<a class="btn primario" href="#/eventos/novo">Criar evento</a>'}</div>`}
      </section>

      <section class="cartao">
        <h2>Catálogo</h2>
        ${totalProdutos
          ? `<p class="numero-grande">${totalProdutos}</p>
             <p class="sub">${totalProdutos === 1 ? 'produto cadastrado' : 'produtos cadastrados'}, com ${totalItens} ${totalItens === 1 ? 'item vendável' : 'itens vendáveis'}</p>
             <div class="acoes"><a class="btn" href="#/produtos">Ver produtos</a><a class="btn texto" href="#/produtos/novo">Novo produto</a></div>`
          : `<p class="sub">Nenhum produto cadastrado ainda. Comece pelo catálogo: ele é a base da tela de venda.</p>
             <div class="acoes"><a class="btn primario" href="#/produtos/novo">Cadastrar o primeiro produto</a></div>`}
      </section>
    </div>`;
}
