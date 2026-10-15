// =========================================================
// Detalhe de uma venda: itens, descontos, pagamentos e situação.
// Daqui se cancela a venda (com motivo). Troca e devolução virão
// na próxima parte.
// =========================================================
import { db, cancelarVenda } from '../db.js';
import { esc, dinheiro, icones, aviso, abrirJanela } from '../ui.js';
import { hora } from './vendas.js';

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
        <h2>Cancelar a venda ${esc(venda.numero)}?</h2>
        <p>A venda fica guardada como cancelada e deixa de contar no faturamento e no estoque.</p>
        <div class="campo"><span class="rotulo">Motivo</span>
          <div class="opcoes" role="radiogroup" aria-label="Motivo">
            ${MOTIVOS.map((m) => `<label><input type="radio" name="motivo" value="${esc(m)}"><span>${esc(m)}</span></label>`).join('')}
          </div></div>
        <div class="campo"><label for="obs">Observação <span class="sub" id="obs-opcional">(opcional)</span></label>
          <input class="entrada" id="obs" maxlength="140" autocomplete="off"></div>
        <div class="estorno">
          <span class="rotulo">Depois de cancelar</span>
          <ul>${venda.pagamentos.map((p) => `<li>${instrucaoEstorno(p)}</li>`).join('')}</ul>
        </div>
        <div class="acoes">
          <button type="button" class="btn" id="voltar">Voltar</button>
          <button type="submit" class="btn primario perigo-cheio" id="confirmar" disabled>Cancelar venda</button>
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

export async function render(el, { id }) {
  const venda = await db.vendas.get(id);
  if (!venda) { location.replace('#/vendas'); return; }
  const cancelada = venda.status === 'cancelada';

  const itens = venda.itens.map((i) => `
    <li class="dv-item">
      <span class="qtd num">${i.quantidade}×</span>
      <div class="dv-nome">${esc(i.nome)}${i.variacaoNome ? ` <span class="sub">${esc(i.variacaoNome)}</span>` : ''}
        <div class="sub num">${dinheiro(i.precoUnit)} cada${i.descontoValor ? ` · desconto ${i.desconto?.tipo === '%' ? `${(i.desconto.valor / 100).toLocaleString('pt-BR')}% ` : ''}− ${dinheiro(i.descontoValor)}` : ''}</div></div>
      <span class="num dv-valor">${i.brinde ? '<span class="etiqueta marca">Brinde</span>' : dinheiro(i.total)}</span>
    </li>`).join('');

  const pagamentos = venda.pagamentos.map((p) => `
    <li><span>${esc(p.formaNome)}${p.parcelas > 1 ? ` em ${p.parcelas}x <span class="sub">(juros: ${p.jurosPor === 'cliente' ? 'cliente' : 'vendedor'})</span>` : ''}
      ${p.troco ? `<div class="sub num">Recebido ${dinheiro(p.recebido)} · troco ${dinheiro(p.troco)}</div>` : ''}</span>
      <span class="num">${dinheiro(p.valor)}</span></li>`).join('');

  const c = venda.cancelamento;
  el.innerHTML = `
    <a class="voltar" href="#/vendas">${icones.voltar} Vendas</a>
    <header class="cab">
      <div><h1 class="num">Venda ${esc(venda.numero)}</h1>
        <p class="sub">${esc(dataHora(venda.criadoEm))}${venda.aparelho ? ` · ${esc(venda.aparelho.nome)}` : ''}</p></div>
      ${cancelada ? '<span class="etiqueta erro grande">Cancelada</span>' : ''}
    </header>
    ${cancelada ? `<div class="cartao alerta-cancelada">
        <strong>Cancelada em ${esc(dataHora(c.em))}</strong>
        <p>Motivo: ${c.motivo === 'Outro' ? esc(c.observacao) : `${esc(c.motivo)}${c.observacao ? ` — ${esc(c.observacao)}` : ''}`}${c.aparelho ? ` · ${esc(c.aparelho.nome)}` : ''}</p>
        ${c.aposFechamento ? '<p class="sub">Feito depois do fechamento do caixa: entra como ajuste daquele dia.</p>' : ''}
      </div>` : ''}
    <div class="detalhe-venda${cancelada ? ' cancelada' : ''}">
      <section class="cartao">
        <h2>Itens</h2>
        <ul class="dv-itens">${itens}</ul>
        <div class="dv-totais">
          ${venda.subtotal !== venda.total ? `<div><span>Subtotal</span><span class="num">${dinheiro(venda.subtotal)}</span></div>` : ''}
          ${venda.descontoVendaValor ? `<div><span>Desconto na venda${venda.descontoVenda?.tipo === '%' ? ` (${(venda.descontoVenda.valor / 100).toLocaleString('pt-BR')}%)` : ''}</span><span class="num">− ${dinheiro(venda.descontoVendaValor)}</span></div>` : ''}
          <div class="dv-total"><span>Total</span><strong class="num">${dinheiro(venda.total)}</strong></div>
        </div>
      </section>
      <section class="cartao">
        <h2>Pagamento</h2>
        <ul class="lista-pagamentos dv-pagamentos">${pagamentos}</ul>
      </section>
    </div>
    ${cancelada ? '' : `<div class="acoes-venda"><button type="button" class="btn perigo" id="cancelar">Cancelar venda</button></div>`}`;

  el.querySelector('#cancelar')?.addEventListener('click', async () => {
    const r = await pedirCancelamento(venda);
    if (!r) return;
    await cancelarVenda(venda.id, r);
    aviso(`Venda ${venda.numero} cancelada.`);
    render(el, { id });
  });
}
