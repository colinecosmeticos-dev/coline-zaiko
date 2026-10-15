// =========================================================
// Tela Vendas: vendas do evento em uso, feitas neste aparelho
// (e, no aparelho principal, também as importadas dos outros).
// Separadas por dia, com busca pelo número da venda.
// Sem totais aqui: os totais ficam no Painel de vendas, com PIN.
// =========================================================
import { db, lerEventoAtivo } from '../db.js';
import { esc, dinheiro, hojeISO, icones } from '../ui.js';

const ROTULO_TIPO = { troca: 'Troca', devolucao: 'Devolução' };

// Dia local (AAAA-MM-DD) de uma data/hora gravada em ISO
export function diaLocal(iso) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function hora(iso) {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}
function rotuloDia(dia) {
  if (dia === hojeISO()) return 'Hoje';
  const [a, m, d] = dia.split('-').map(Number);
  return new Date(a, m - 1, d).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' }).replace('.', '');
}

// Guarda o dia escolhido enquanto o app está aberto (voltar do detalhe não perde o filtro)
let diaEscolhido = null;

export async function render(el) {
  const evento = await lerEventoAtivo();
  if (!evento) {
    el.innerHTML = `<header class="cab"><h1>Vendas</h1></header>
      <div class="cartao vazio"><div class="simbolo" aria-hidden="true">在庫</div><h2>Escolha o evento</h2>
      <p>As vendas aparecem aqui separadas por evento.</p><a class="btn primario" href="#/eventos">Ir para Eventos</a></div>`;
    return;
  }

  const vendas = (await db.vendas.where('eventoId').equals(evento.id).toArray())
    .sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));
  const dias = [...new Set(vendas.map((v) => diaLocal(v.criadoEm)))];   // mais recente primeiro
  if (!dias.includes(diaEscolhido)) diaEscolhido = dias[0] || hojeISO();
  let busca = '';

  el.innerHTML = `
    <header class="cab">
      <div><h1>Vendas</h1><p class="sub">${esc(evento.nome)}</p></div>
    </header>
    ${vendas.length ? `
      <div class="filtros">
        <label class="busca"><span class="oculto">Buscar pelo número da venda</span>${icones.busca}
          <input class="entrada" id="busca" type="search" inputmode="numeric" placeholder="Número da venda (ex.: 12)" autocomplete="off"></label>
        ${dias.length > 1 ? `<div class="chips" role="group" aria-label="Dia">${dias.map((d) => `<button type="button" class="chip" data-dia="${d}">${esc(rotuloDia(d))}</button>`).join('')}</div>` : ''}
      </div>
      <p class="sub contagem" id="contagem"></p>
      <ul class="lista" id="lista"></ul>`
    : `<div class="cartao vazio"><div class="simbolo" aria-hidden="true">在庫</div><h2>Nenhuma venda ainda</h2>
        <p>As vendas deste evento vão aparecer aqui, com a opção de cancelar.</p><a class="btn primario" href="#/vender">Ir para Vender</a></div>`}`;
  if (!vendas.length) return;

  const $ = (s) => el.querySelector(s);

  function linha(v) {
    const cancelada = v.status === 'cancelada';
    const tipo = v.tipo || 'venda';
    const lista = (arr) => arr.map((i) => `${i.quantidade > 1 ? `${i.quantidade}× ` : ''}${i.nome}${i.variacaoNome ? ` (${i.variacaoNome})` : ''}`).join(', ');
    const nomes = tipo === 'venda' ? lista(v.itens)
      : `${v.origemNumero}: volta ${lista(v.devolvidos || [])}${v.itens.length ? ` → leva ${lista(v.itens)}` : ''}`;
    const formas = [...new Set([
      ...v.pagamentos.map((p) => p.formaNome + (p.parcelas > 1 ? ` ${p.parcelas}x` : '')),
      ...(v.reembolsos || []).map((r) => `${r.nome} (devolvido)`)
    ])].join(' + ') || 'Sem diferença';
    const valor = tipo === 'devolucao' ? `− ${dinheiro(v.credito)}` : v.total < 0 ? `− ${dinheiro(-v.total)}` : dinheiro(v.total);
    return `<li><a class="item-venda${cancelada ? ' cancelada' : ''}" href="#/vendas/${encodeURIComponent(v.id)}">
      <div class="iv-topo"><strong class="num">${esc(v.numero)}</strong><span class="sub num">${hora(v.criadoEm)}</span>
        ${ROTULO_TIPO[tipo] ? `<span class="etiqueta marca">${ROTULO_TIPO[tipo]}</span>` : ''}
        ${cancelada ? `<span class="etiqueta erro">${tipo === 'venda' ? 'Cancelada' : 'Cancelado'}</span>` : ''}</div>
      <div class="iv-itens">${esc(nomes)}</div>
      <div class="iv-pag sub">${esc(formas)}</div>
      <strong class="iv-total num">${valor}</strong>
    </a></li>`;
  }

  function desenhar() {
    const termo = busca.replace(/\D/g, '');
    // Com busca, procura em todos os dias; sem busca, mostra o dia escolhido
    const lista = termo
      ? vendas.filter((v) => String(v.seq).endsWith(String(Number(termo))))
      : vendas.filter((v) => diaLocal(v.criadoEm) === diaEscolhido);
    el.querySelectorAll('[data-dia]').forEach((b) => b.setAttribute('aria-pressed', String(!termo && b.dataset.dia === diaEscolhido)));
    const conta = (filtro, um, varios) => { const n = lista.filter(filtro).length; return n ? `${n} ${n === 1 ? um : varios}` : ''; };
    $('#contagem').textContent = [
      conta((v) => (v.tipo || 'venda') === 'venda', 'venda', 'vendas') || '0 vendas',
      conta((v) => v.tipo === 'troca', 'troca', 'trocas'),
      conta((v) => v.tipo === 'devolucao', 'devolução', 'devoluções'),
      conta((v) => v.status === 'cancelada', 'cancelada', 'canceladas')
    ].filter(Boolean).join(' · ');
    $('#lista').innerHTML = lista.length ? lista.map(linha).join('') : '<li class="lista-vazia sub">Nenhuma venda com esse número.</li>';
    $('#lista').hidden = false;
  }

  $('#busca').addEventListener('input', (e) => { busca = e.target.value; desenhar(); });
  el.querySelectorAll('[data-dia]').forEach((b) => b.addEventListener('click', () => {
    diaEscolhido = b.dataset.dia; busca = ''; $('#busca').value = ''; desenhar();
  }));
  desenhar();
}
