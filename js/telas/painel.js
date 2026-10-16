// =========================================================
// Painel de vendas (Mais → Painel de vendas), protegido pelo PIN.
// Mostra só as vendas DESTE aparelho no evento em uso: hoje, um dia
// específico ou o evento inteiro. O PIN vale só enquanto a tela está
// aberta; ao sair (ou em "Ocultar"), volta a ficar trancado.
// =========================================================
import { db, lerAparelho, lerEventoAtivo } from '../db.js';
import { esc, dinheiro, icones, hojeISO } from '../ui.js';
import { pedirPin, temPin } from '../pin.js';
import { calcularPainel } from '../painel/calculo.js';
import { diaLocal } from './vendas.js';

const rotuloDia = (d) => d === hojeISO() ? 'Hoje' : new Date(d + 'T12:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' }).replace('.', '');
const qtd = (n, um, varios) => `${n.toLocaleString('pt-BR')} ${n === 1 ? um : varios}`;

export async function render(el, { mostrar = false, periodo = null } = {}) {
  const aparelho = await lerAparelho();
  const evento = await lerEventoAtivo();
  const cabecalho = `<a class="voltar" href="#/mais">${icones.voltar} Mais</a>`;
  if (!evento) {
    el.innerHTML = `${cabecalho}<header class="cab"><h1>Painel de vendas</h1></header>
      <div class="cartao vazio"><div class="simbolo" aria-hidden="true">在庫</div><h2>Escolha o evento</h2><p>O painel mostra as vendas do evento em uso.</p><a class="btn primario" href="#/eventos">Ir para Eventos</a></div>`;
    return;
  }

  const comPin = await temPin();
  if (comPin && !mostrar) {
    el.innerHTML = `${cabecalho}<header class="cab"><div><h1>Painel de vendas</h1><p class="sub">${esc(evento.nome)}</p></div></header>
      <div class="cartao vazio"><div class="simbolo" aria-hidden="true">${icones.cadeado}</div><h2>Protegido pelo PIN</h2>
      <p>Vendas e totais deste aparelho. Ao sair da tela, o painel volta a ficar trancado.</p>
      <button type="button" class="btn primario" id="abrir">Ver painel</button></div>`;
    el.querySelector('#abrir').addEventListener('click', async () => {
      if (await pedirPin({ titulo: 'Painel de vendas', texto: 'Digite o PIN.' })) render(el, { mostrar: true });
    });
    return;
  }

  // Só as vendas deste aparelho
  const todos = (await db.vendas.where('eventoId').equals(evento.id).toArray())
    .filter((v) => !aparelho || !v.aparelho || v.aparelho.id === aparelho.id);
  const dias = [...new Set(todos.map((v) => diaLocal(v.criadoEm)))].sort().reverse();
  const hoje = hojeISO();
  if (!periodo) periodo = dias.includes(hoje) || !dias.length ? hoje : dias[0];
  const registros = periodo === 'evento' ? todos : todos.filter((v) => diaLocal(v.criadoEm) === periodo);
  const p = calcularPainel(registros);
  const opcoes = [...new Set([hoje, ...dias])];

  const barraForma = (f) => {
    const max = Math.max(...p.porForma.map((x) => x.valor), 1);
    return `<li title="${esc(f.nome)}: ${dinheiro(f.valor)} em ${qtd(f.quantidade, 'pagamento', 'pagamentos')}">
      <span class="pb-nome">${esc(f.nome)} <span class="sub">(${f.quantidade})</span></span>
      <span class="pb-trilho"><span class="pb-barra" style="width:${Math.max(2, Math.round((f.valor / max) * 100))}%"></span></span>
      <span class="num pb-valor">${dinheiro(f.valor)}</span></li>`;
  };
  const maxHora = Math.max(...p.porHora.map((h) => h.valor), 1);
  const horaMaior = p.porHora.reduce((a, b) => (b.valor > (a ? a.valor : -1) ? b : a), null);

  el.innerHTML = `
    ${cabecalho}
    <header class="cab">
      <div><h1>Painel de vendas</h1><p class="sub">${esc(evento.nome)}${aparelho ? ` · só deste aparelho (${esc(aparelho.nome)})` : ''}</p></div>
      ${comPin ? `<button type="button" class="btn" id="ocultar">${icones.cadeado} Ocultar</button>` : ''}
    </header>
    <div class="chips painel-periodo" role="group" aria-label="Período">
      ${opcoes.map((d) => `<button type="button" class="chip" data-periodo="${d}" aria-pressed="${periodo === d}">${esc(rotuloDia(d))}</button>`).join('')}
      ${dias.length > 1 ? `<button type="button" class="chip" data-periodo="evento" aria-pressed="${periodo === 'evento'}">Evento inteiro</button>` : ''}
    </div>

    <div class="kpis">
      <div class="kpi destaque"><span>Faturamento</span><strong class="num">${dinheiro(p.faturamento)}</strong></div>
      <div class="kpi"><span>Vendas</span><strong class="num">${p.quantidadeVendas.toLocaleString('pt-BR')}</strong></div>
      <div class="kpi"><span>Ticket médio</span><strong class="num">${dinheiro(p.ticketMedio)}</strong></div>
      <div class="kpi"><span>Itens vendidos</span><strong class="num">${p.itensVendidos.toLocaleString('pt-BR')}</strong></div>
    </div>

    ${registros.length ? `
    <div class="painel-grade">
      <section class="cartao">
        <h2>Resultado</h2>
        <div class="contas">
          <div><span>Faturamento</span><span class="num">${dinheiro(p.faturamento)}</span></div>
          <div><span>Custo dos produtos</span><span class="num">− ${dinheiro(p.custo)}</span></div>
          <div class="total"><span>Lucro bruto</span><strong class="num">${dinheiro(p.lucroBruto)}</strong></div>
          <div><span>Taxas da maquininha (estimadas)</span><span class="num">− ${dinheiro(p.taxas)}</span></div>
          <div class="total"><span>Lucro depois das taxas</span><strong class="num">${dinheiro(p.lucroDepoisTaxas)}</strong></div>
        </div>
        ${p.itensSemCusto ? `<p class="aviso-inline">${qtd(p.itensSemCusto, 'item vendido não tem', 'itens vendidos não têm')} custo cadastrado: o lucro real é menor que o mostrado.</p>` : ''}
        ${p.pagamentosSemTaxa ? `<p class="aviso-inline">${qtd(p.pagamentosSemTaxa, 'pagamento sem', 'pagamentos sem')} taxa informada na forma de pagamento.</p>` : ''}
        <p class="sub nota-mov">Despesas do caixa (retiradas) entram no fechamento do evento.</p>
      </section>

      <section class="cartao">
        <h2>Por forma de pagamento</h2>
        <ul class="painel-barras">${p.porForma.map(barraForma).join('') || '<li class="sub">Nada recebido.</li>'}</ul>
        <div class="contas painel-extra">
          ${p.devolvido ? `<div><span>Devolvido ao cliente</span><span class="num">− ${dinheiro(p.devolvido)}</span></div>` : ''}
          <div><span>Descontos concedidos</span><span class="num">${dinheiro(p.descontos)}</span></div>
          <div><span>Brindes</span><span class="num">${qtd(p.brindesQtd, 'unidade', 'unidades')}${p.brindesCusto ? ` · custo ${dinheiro(p.brindesCusto)}` : ''}</span></div>
          ${p.trocas || p.devolucoes || p.canceladas ? `<div><span>Trocas · devoluções · canceladas</span><span class="num">${p.trocas} · ${p.devolucoes} · ${p.canceladas}</span></div>` : ''}
        </div>
      </section>

      <section class="cartao">
        <h2>Mais vendidos</h2>
        ${p.maisVendidos.length ? `<table class="tabela-painel">
          <thead><tr><th>Produto</th><th class="num">Qtd.</th><th class="num">Valor</th></tr></thead>
          <tbody>${p.maisVendidos.slice(0, 10).map((x) => `<tr><td>${esc(x.nome)}${x.variacao ? ` <span class="sub">${esc(x.variacao)}</span>` : ''}</td><td class="num">${x.quantidade}</td><td class="num">${dinheiro(x.valor)}</td></tr>`).join('')}</tbody>
        </table>${p.maisVendidos.length > 10 ? `<p class="sub nota-mov">E mais ${p.maisVendidos.length - 10}.</p>` : ''}` : '<p class="sub">Nenhum produto vendido.</p>'}
      </section>

      ${periodo !== 'evento' && p.porHora.length ? `<section class="cartao">
        <h2>Vendas por hora</h2>
        <div class="painel-horas" role="img" aria-label="Valor vendido por hora">
          ${p.porHora.map((h) => `<div class="ph-col" title="${h.hora}h: ${dinheiro(h.valor)} em ${qtd(h.vendas, 'venda', 'vendas')}">
            <span class="ph-valor num">${h === horaMaior ? dinheiro(h.valor) : ''}</span>
            <span class="ph-area"><span class="ph-barra" style="height:${Math.max(3, Math.round((h.valor / maxHora) * 100))}%"></span></span>
            <span class="ph-hora num">${h.hora}h</span></div>`).join('')}
        </div>
        <table class="oculto"><caption>Vendas por hora</caption><tbody>${p.porHora.map((h) => `<tr><th>${h.hora}h</th><td>${h.vendas}</td><td>${dinheiro(h.valor)}</td></tr>`).join('')}</tbody></table>
      </section>` : ''}
    </div>` : '<div class="cartao vazio"><p>Nenhuma venda neste período.</p></div>'}`;

  el.querySelector('#ocultar')?.addEventListener('click', () => render(el));
  el.querySelectorAll('[data-periodo]').forEach((b) => b.addEventListener('click', () => render(el, { mostrar: true, periodo: b.dataset.periodo })));
}
