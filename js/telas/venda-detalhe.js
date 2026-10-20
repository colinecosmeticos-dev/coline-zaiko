// =========================================================
// Detalhe de uma venda, troca ou devolução: itens, descontos,
// pagamentos e situação. Daqui se devolve, troca ou cancela.
// =========================================================
import { db, cancelarVenda, caixaAbertoDoEvento, lerAparelho } from '../db.js';
import { esc, dinheiro, icones, aviso, abrirJanela } from '../ui.js';
import { hora } from './vendas.js';
import { gravarRegistro, registrosLigados, quantidadesDevolvidas } from '../venda/registro.js';
import { escolherItensDevolvidos } from '../venda/devolucao.js';
import { textoPagamento } from '../venda/cobrar.js';
import { carrinho, limparCarrinho } from '../venda/carrinho.js';
import { ehCaixa } from '../modo.js';

export const NOME_TIPO = { venda: 'Venda', troca: 'Troca', devolucao: 'Devolução' };

const MOTIVOS = ['Erro no registro', 'Cliente desistiu', 'Pagamento não aprovado', 'Outro'];

function dataHora(iso) {
  const d = new Date(iso);
  return `${d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' })} às ${hora(iso)}`;
}

// O que fazer com o dinheiro de cada pagamento quando a venda é cancelada
function instrucaoEstorno(p) {
  const v = dinheiro(p.valor);
  switch (p.tipo) {
    case 'dinheiro': return `Devolva <strong>${v}</strong> em dinheiro ao cliente (sai do caixa).`;
    case 'pixQr': case 'debito': case 'credito':
      return `Estorne <strong>${v}</strong> (${esc(p.formaNome)}${p.parcelas > 1 ? ` ${p.parcelas}x` : ''}) na maquininha.`;
    case 'pixChave': return `Devolva <strong>${v}</strong> por Pix, pela conta da empresa.`;
    default: return `Resolva <strong>${v}</strong> recebidos em ${esc(p.formaNome)}.`;
  }
}

function pedirCancelamento(venda) {
  return new Promise((resolver) => {
    let feito = false;
    const d = abrirJanela(`
      <form method="dialog" class="form-cancelar">
        <h2>Cancelar ${venda.tipo === 'troca' ? 'a troca' : venda.tipo === 'devolucao' ? 'a devolução' : 'a venda'} ${esc(venda.numero)}?</h2>
        <p>${venda.tipo && venda.tipo !== 'venda' ? 'O registro fica guardado como cancelado e deixa de contar; os itens voltam a constar como vendidos na venda original.' : 'A venda fica guardada como cancelada e deixa de contar no faturamento e no estoque.'}</p>
        <div class="campo"><span class="rotulo">Motivo</span>
          <div class="opcoes" role="radiogroup" aria-label="Motivo">
            ${MOTIVOS.map((m) => `<label><input type="radio" name="motivo" value="${esc(m)}"><span>${esc(m)}</span></label>`).join('')}
          </div></div>
        <div class="campo"><label for="obs">Observação <span class="sub" id="obs-opcional">(opcional)</span></label>
          <input class="entrada" id="obs" maxlength="140" autocomplete="off"></div>
        <div class="estorno">
          <span class="rotulo">Depois de cancelar</span>
          <ul>${venda.pagamentos.map((p) => `<li>${instrucaoEstorno(p)}</li>`).join('')}
            ${(venda.reembolsos || []).map((r) => `<li>Receba de volta <strong>${dinheiro(r.valor)}</strong> devolvidos ao cliente (${esc(r.nome)}).</li>`).join('')}
            ${venda.tipo === 'troca' ? '<li>Desfaça a troca com o cliente: ele devolve os produtos novos e recebe de volta os que tinha trocado.</li>' : ''}</ul>
        </div>
        <div class="acoes">
          <button type="button" class="btn" id="voltar">Voltar</button>
          <button type="submit" class="btn primario perigo-cheio" id="confirmar" disabled>${venda.tipo === 'troca' ? 'Cancelar troca' : venda.tipo === 'devolucao' ? 'Cancelar devolução' : 'Cancelar venda'}</button>
        </div>
      </form>`, { classe: 'janela-cancelar', aoFechar: () => { if (!feito) resolver(null); } });
    const $ = (s) => d.querySelector(s);
    const motivo = () => d.querySelector('input[name="motivo"]:checked')?.value;
    const conferir = () => {
      const outro = motivo() === 'Outro';
      $('#obs-opcional').textContent = outro ? '(descreva o motivo)' : '(opcional)';
      $('#confirmar').disabled = !motivo() || (outro && !$('#obs').value.trim());
    };
    d.querySelectorAll('input[name="motivo"]').forEach((r) => r.addEventListener('change', () => { conferir(); if (motivo() === 'Outro') $('#obs').focus(); }));
    $('#obs').addEventListener('input', conferir);
    $('#voltar').addEventListener('click', () => d.close());
    $('form').addEventListener('submit', (e) => {
      e.preventDefault();
      if ($('#confirmar').disabled) return;
      feito = true;
      resolver({ motivo: motivo(), observacao: $('#obs').value.trim() });
      d.close();
    });
  });
}

function linhaItem(i, extra = '') {
  return `
    <li class="dv-item">
      <span class="qtd num">${i.quantidade}×</span>
      <div class="dv-nome">${esc(i.nome)}${i.variacaoNome ? ` <span class="sub">${esc(i.variacaoNome)}</span>` : ''}
        <div class="sub num">${dinheiro(i.precoUnit)} cada${i.descontoValor ? ` · desconto ${i.desconto?.tipo === '%' ? `${(i.desconto.valor / 100).toLocaleString('pt-BR')}% ` : ''}− ${dinheiro(i.descontoValor)}` : ''}${extra}</div></div>
      <span class="num dv-valor">${i.brinde ? '<span class="etiqueta marca">Brinde</span>' : dinheiro(i.total)}</span>
    </li>`;
}

export async function render(el, { id }) {
  const venda = await db.vendas.get(id);
  if (!venda) { location.replace('#/vendas'); return; }
  const tipo = venda.tipo || 'venda';
  const cancelada = venda.status === 'cancelada';
  const ligados = await registrosLigados(venda);
  const devolvidas = await quantidadesDevolvidas(venda);
  const sobra = venda.itens.some((i, k) => i.quantidade - (devolvidas.get(k) || 0) > 0);
  const origem = venda.origemId ? await db.vendas.get(venda.origemId) : null;
  // Venda que veio de outro aparelho (no principal): só consulta
  const aqui = await lerAparelho();
  const deOutro = !!(venda.aparelho && aqui && venda.aparelho.id !== aqui.id);

  const itens = venda.itens.map((i, k) => linhaItem(i, devolvidas.get(k) ? ` · <span class="voltou">${devolvidas.get(k)} ${devolvidas.get(k) === 1 ? 'voltou' : 'voltaram'}</span>` : '')).join('');
  const devolvidosHtml = (venda.devolvidos || []).map((x) => `
    <li class="dv-item">
      <span class="qtd num">${x.quantidade}×</span>
      <div class="dv-nome">${esc(x.nome)}${x.variacaoNome ? ` <span class="sub">${esc(x.variacaoNome)}</span>` : ''}
        <div><span class="etiqueta ${x.estado === 'defeito' ? 'erro' : ''}">${x.estado === 'defeito' ? 'Com defeito' : 'Bom estado'}</span></div></div>
      <span class="num dv-valor">${dinheiro(x.valor)}</span>
    </li>`).join('');

  const pagamentos = venda.pagamentos.map((p) => `
    <li><span>${esc(p.formaNome)}${p.parcelas > 1 ? ` em ${p.parcelas}x <span class="sub">(juros: ${p.jurosPor === 'cliente' ? 'cliente' : 'vendedor'})</span>` : ''}
      ${p.troco ? `<div class="sub num">Recebido ${dinheiro(p.recebido)} · troco ${dinheiro(p.troco)}</div>` : ''}
      ${p.aMais ? `<div class="sub num">Recebido ${dinheiro(p.recebido)} · ${dinheiro(p.aMais)} a mais, sem troco</div>` : ''}</span>
      <span class="num">${dinheiro(p.valor)}</span></li>`).join('');
  const reembolsos = (venda.reembolsos || []).map((r) => `
    <li><span>Devolvido ao cliente <span class="sub">(${esc(r.nome)})</span></span><span class="num">${dinheiro(r.valor)}</span></li>`).join('');

  const c = venda.cancelamento;
  const nomeTipo = NOME_TIPO[tipo];
  const totalHtml = tipo === 'devolucao' ? ''
    : `<div class="dv-total"><span>${tipo === 'troca' ? (venda.total < 0 ? 'Diferença devolvida' : 'Diferença paga') : 'Total'}</span><strong class="num">${dinheiro(Math.abs(venda.total))}</strong></div>`;

  el.innerHTML = `
    <a class="voltar" href="#/vendas">${icones.voltar} Vendas</a>
    <header class="cab">
      <div><h1 class="num">${nomeTipo} ${esc(venda.numero)}</h1>
        <p class="sub">${esc(dataHora(venda.criadoEm))}${venda.aparelho ? ` · ${esc(venda.aparelho.nome)}` : ''}</p>
        ${origem ? `<p class="sub">Da venda <a href="#/vendas/${encodeURIComponent(origem.id)}">${esc(origem.numero)}</a>${venda.motivo ? ` · ${esc(venda.motivo)}` : ''}</p>` : ''}</div>
      ${venda.posEvento ? '<span class="etiqueta grande">Pós-evento</span>' : ''}
      ${cancelada ? `<span class="etiqueta erro grande">${tipo === 'venda' ? 'Cancelada' : 'Cancelado'}</span>` : ''}
    </header>
    ${cancelada ? `<div class="cartao alerta-cancelada">
        <strong>${tipo === 'venda' ? 'Cancelada' : 'Cancelado'} em ${esc(dataHora(c.em))}</strong>
        <p>Motivo: ${c.motivo === 'Outro' ? esc(c.observacao) : `${esc(c.motivo)}${c.observacao ? ` — ${esc(c.observacao)}` : ''}`}${c.aparelho ? ` · ${esc(c.aparelho.nome)}` : ''}</p>
        ${c.aposFechamento ? '<p class="sub">Feito depois do fechamento do caixa: entra como ajuste daquele dia.</p>' : ''}
      </div>` : ''}
    <div class="detalhe-venda${cancelada ? ' cancelada' : ''}">
      <div class="dv-coluna">
        ${devolvidosHtml ? `<section class="cartao">
          <h2>Itens devolvidos</h2>
          <ul class="dv-itens">${devolvidosHtml}</ul>
          <div class="dv-totais"><div class="dv-total"><span>${tipo === 'troca' ? 'Crédito' : 'Valor devolvido'}${venda.modoValor === 'cheio' ? ' (preço cheio)' : ''}</span><strong class="num">${dinheiro(venda.credito)}</strong></div></div>
        </section>` : ''}
        ${venda.itens.length || tipo !== 'devolucao' ? `<section class="cartao">
          <h2>${tipo === 'troca' ? 'Itens novos' : 'Itens'}</h2>
          <ul class="dv-itens">${itens || '<li class="sub dv-item">Nenhum item novo.</li>'}</ul>
          <div class="dv-totais">
            ${venda.subtotal !== venda.total || tipo === 'troca' ? `<div><span>Subtotal</span><span class="num">${dinheiro(venda.subtotal)}</span></div>` : ''}
            ${venda.descontoVendaValor ? `<div><span>Desconto na venda${venda.descontoVenda?.tipo === '%' ? ` (${(venda.descontoVenda.valor / 100).toLocaleString('pt-BR')}%)` : ''}</span><span class="num">− ${dinheiro(venda.descontoVendaValor)}</span></div>` : ''}
            ${tipo === 'troca' ? `<div><span>Crédito da troca</span><span class="num">− ${dinheiro(venda.credito)}</span></div>` : ''}
            ${totalHtml}
          </div>
        </section>` : ''}
      </div>
      <div class="dv-coluna">
        <section class="cartao">
          <h2>${tipo === 'devolucao' ? 'Devolução do valor' : 'Pagamento'}</h2>
          <ul class="lista-pagamentos dv-pagamentos">${pagamentos}${reembolsos}${!pagamentos && !reembolsos ? '<li><span class="sub">Sem diferença a pagar ou devolver.</span></li>' : ''}</ul>
        </section>
        ${ligados.length ? `<section class="cartao">
          <h2>Trocas e devoluções</h2>
          <ul class="lista-pagamentos dv-pagamentos">${ligados.map((r) => `<li><a href="#/vendas/${encodeURIComponent(r.id)}">${NOME_TIPO[r.tipo]} ${esc(r.numero)}</a><span class="sub num">${hora(r.criadoEm)}</span></li>`).join('')}</ul>
        </section>` : ''}
      </div>
    </div>
    ${cancelada ? '' : deOutro ? `<p class="sub nota-acoes">Feita no ${esc(venda.aparelho.nome)}: cancelar, trocar e devolver só no próprio aparelho, que depois envia as vendas de novo.</p>`
      : !ehCaixa() ? '<p class="sub nota-acoes">Na Gestão é só consulta: cancelar, trocar e devolver nos aparelhos de caixa.</p>' : `<div class="acoes-venda">
      ${venda.itens.length && sobra ? `<button type="button" class="btn" id="devolver">Devolver</button><button type="button" class="btn" id="trocar">Trocar</button>` : ''}
      <button type="button" class="btn perigo" id="cancelar" ${ligados.length ? 'disabled' : ''}>Cancelar ${tipo === 'venda' ? 'venda' : nomeTipo.toLowerCase()}</button>
    </div>
    ${ligados.length ? '<p class="sub nota-acoes">Para cancelar esta venda, cancele antes as trocas e devoluções dela.</p>' : ''}`}`;

  el.querySelector('#cancelar')?.addEventListener('click', async () => {
    const r = await pedirCancelamento(venda);
    if (!r) return;
    await cancelarVenda(venda.id, r);
    aviso(`${nomeTipo} ${venda.numero} ${tipo === 'venda' ? 'cancelada' : 'cancelado'}.`);
    render(el, { id });
  });

  el.querySelector('#devolver')?.addEventListener('click', async () => {
    const r = await escolherItensDevolvidos(venda, 'devolucao');
    if (!r) return;
    const caixa = await caixaAbertoDoEvento(venda.eventoId);
    const registro = await gravarRegistro({
      tipo: 'devolucao', eventoId: venda.eventoId, caixaId: caixa ? caixa.id : null,
      origemId: venda.id, origemNumero: venda.numero,
      devolvidos: r.devolvidos, credito: r.credito, modoValor: r.modoValor, motivo: r.motivo,
      total: -r.credito, reembolsos: [r.reembolso],
      posEvento: (await db.eventos.get(venda.eventoId))?.status === 'encerrado'   // depois de encerrar: só histórico
    });
    const d = abrirJanela(`<div class="cobrar">${telaConcluidaDevolucao(registro)}</div>`, { classe: 'janela-cobrar janela-estreita', aoFechar: () => { location.hash = `#/vendas/${encodeURIComponent(registro.id)}`; } });
    d.querySelector('#nova').addEventListener('click', () => d.close());
  });

  el.querySelector('#trocar')?.addEventListener('click', async () => {
    if (carrinho.itens.length || carrinho.troca) {
      const d = abrirJanela(`<h2>Há uma venda em andamento</h2><p>O carrinho da tela Vender tem itens. Para começar a troca, ele será esvaziado.</p>
        <div class="acoes"><button class="btn" value="nao">Voltar</button><button class="btn primario" value="sim">Esvaziar e trocar</button></div>`);
      const ok = await new Promise((res) => d.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { res(b.value === 'sim'); d.close(); })));
      if (!ok) return;
    }
    const r = await escolherItensDevolvidos(venda, 'troca');
    if (!r) return;
    limparCarrinho();
    carrinho.troca = { origemId: venda.id, origemNumero: venda.numero, pagoCom: textoPagamento(venda), ...r };
    location.hash = '#/vender';
  });
}

function telaConcluidaDevolucao(registro) {
  const r = registro.reembolsos[0];
  return `
    <div class="venda-concluida">
      <div class="marca-ok" aria-hidden="true">✓</div>
      <h2>Devolução ${esc(registro.numero)} registrada</h2>
      <div class="troco-final"><span>Devolver ao cliente (${esc(r.nome)})</span><strong class="num">${dinheiro(r.valor)}</strong></div>
      <button type="button" class="btn primario btn-confirmar" id="nova">Pronto</button>
    </div>`;
}
