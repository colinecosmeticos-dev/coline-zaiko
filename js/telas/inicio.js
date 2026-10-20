// Tela Início: situação geral do aparelho (Gestão).
// No modo Caixa, o Início é outro (js/telas/inicio-caixa.js).
import { db, lerEventoAtivo, lerAparelho } from '../db.js';
import { ehCaixa } from '../modo.js';
import { render as renderCaixa } from './inicio-caixa.js';
import { esc, periodo, hojeISO, diasEntre } from '../ui.js';
import { situacaoBase } from '../sincronizar.js';
import { driveConfigurado } from '../drive.js';

export async function render(el) {
  if (ehCaixa()) return renderCaixa(el);
  const totalProdutos = await db.produtos.count();
  const totalItens = await db.variacoes.count();
  const evento = await lerEventoAtivo();
  const aparelho = await lerAparelho();
  const totalEventos = await db.eventos.count();
  const base = driveConfigurado() ? await situacaoBase().catch(() => null) : null;

  // Em qual dia do evento estamos (ex.: "Dia 2 de 3")
  let diaDoEvento = '';
  if (evento) {
    const hoje = hojeISO();
    const total = diasEntre(evento.dataInicio, evento.dataFim);
    if (hoje < evento.dataInicio) diaDoEvento = `Hoje está fora das datas do evento: começa em ${diasEntre(hoje, evento.dataInicio) - 1} ${diasEntre(hoje, evento.dataInicio) - 1 === 1 ? 'dia' : 'dias'}`;
    else if (hoje > evento.dataFim) diaDoEvento = 'Hoje está fora das datas do evento: elas já passaram';
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

      ${base ? `<section class="cartao">
        <h2>Caixas</h2>
        <p class="sub">${base.publicada ? `Base nº ${base.publicada.versao} publicada em ${new Date(base.publicada.em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}.` : 'Nenhuma base publicada ainda.'}</p>
        <p class="sub" style="margin-top:4px"><strong>${!base.publicada ? 'Publique para os caixas receberem o catálogo e o evento.' : base.alterada ? 'Há alterações não publicadas.' : 'Os caixas estão com a versão mais nova.'}</strong></p>
        <div class="acoes"><a class="btn ${!base.publicada || base.alterada ? 'primario' : ''}" href="#/sincronizar">${!base.publicada || base.alterada ? 'Publicar base' : 'Sincronizar'}</a></div>
      </section>` : ''}

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
