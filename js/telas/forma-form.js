// =========================================================
// Editar / criar forma de pagamento.
// As formas que vêm com o app (Dinheiro, Pix, Débito, Crédito) podem ser
// renomeadas e desativadas, mas não excluídas. As criadas por você
// (ex.: Vale, Fiado) podem ser excluídas.
// =========================================================
import { db, novoId, PARCELAS_MAX, listarFormasPagamento } from '../db.js';
import { esc, aviso, confirmar, icones, campoPercentual, lerCentavos, escreverCentavos } from '../ui.js';

export async function render(el, { id }) {
  const nova = id === 'nova';
  const f = nova ? { nome: '', tipo: 'outra', taxa: null, ativo: true } : await db.formasPagamento.get(id);
  if (!f) { el.innerHTML = '<div class="cartao vazio"><h2>Forma de pagamento não encontrada</h2><a class="btn" href="#/configuracoes/formas">Voltar</a></div>'; return; }

  const camposTaxa = f.tipo === 'dinheiro' ? '<p class="sub">Dinheiro não tem taxa. Na venda, o app calcula o troco.</p>'
    : f.tipo === 'credito' ? `
      <div class="tabela-taxas">
        ${Array.from({ length: PARCELAS_MAX }, (_, k) => k + 1).map((n) => `
          <label class="linha-taxa" for="t-${n}"><span>${n === 1 ? 'À vista (1x)' : `Em ${n}x`}</span>
            <span class="com-sufixo"><input class="entrada" id="t-${n}" data-parcela="${n}"><span aria-hidden="true">%</span></span></label>`).join('')}
      </div>
      <p class="sub" style="margin-top:12px">Quando os juros do parcelado são pagos pelo cliente, o app usa a taxa à vista (até confirmarmos no extrato).</p>`
    : `
      <label class="linha-taxa" for="t-unica"><span>Taxa</span>
        <span class="com-sufixo"><input class="entrada" id="t-unica"><span aria-hidden="true">%</span></span></label>
      <p class="sub" style="margin-top:8px">Taxa zero: digite 0. Campo vazio: taxa ainda não informada.</p>`;

  el.innerHTML = `
    <a class="voltar" href="#/configuracoes/formas">${icones.voltar} Formas de pagamento</a>
    <header class="cab"><h1>${nova ? 'Nova forma de pagamento' : esc(f.nome)}</h1></header>
    <form class="form-produto" novalidate>
      <section class="cartao">
        <div class="grade-campos">
          <div class="campo"><label for="f-nome">Nome</label>
            <input class="entrada" id="f-nome" maxlength="30" autocomplete="off" placeholder="Ex.: Vale, Fiado" value="${esc(f.nome)}"></div>
          <label class="interruptor">
            <span><strong>Ativa</strong><br><span class="dica" style="font-size:.8125rem;color:var(--texto-2)">Desativada, some dos botões de cobrar mas continua nos relatórios antigos.</span></span>
            <input type="checkbox" id="f-ativo" ${f.ativo ? 'checked' : ''}>
          </label>
        </div>
      </section>
      <section class="cartao"><h2 style="margin-bottom:12px">Taxa da maquininha</h2>${camposTaxa}</section>
      <div class="rodape-form">
        ${!nova && !f.sistema ? '<button type="button" class="btn texto perigo btn-excluir" id="excluir">Excluir</button>' : ''}
        <a class="btn" href="#/configuracoes/formas">Cancelar</a>
        <button type="submit" class="btn primario">Salvar</button>
      </div>
    </form>`;

  const $ = (s) => el.querySelector(s);
  if (f.tipo === 'credito') {
    el.querySelectorAll('[data-parcela]').forEach((i) => { campoPercentual(i); escreverCentavos(i, (f.taxasCredito || {})[i.dataset.parcela] ?? null); });
  } else if (f.tipo !== 'dinheiro') {
    campoPercentual($('#t-unica')); escreverCentavos($('#t-unica'), f.taxa ?? null);
  }

  el.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const nome = $('#f-nome').value.trim();
    if (!nome) { aviso('Informe o nome da forma de pagamento.', { tipo: 'erro' }); $('#f-nome').focus(); return; }
    const todas = await listarFormasPagamento();
    if (todas.some((o) => o.id !== f.id && o.nome.toLowerCase() === nome.toLowerCase())) { aviso('Já existe uma forma com esse nome.', { tipo: 'erro' }); return; }
    const registro = { ...f, id: nova ? novoId() : f.id, nome, ativo: $('#f-ativo').checked };
    if (nova) { registro.ordem = todas.length; registro.sistema = false; }
    if (f.tipo === 'credito') {
      registro.taxasCredito = {};
      el.querySelectorAll('[data-parcela]').forEach((i) => { registro.taxasCredito[i.dataset.parcela] = lerCentavos(i); });
    } else if (f.tipo !== 'dinheiro') {
      registro.taxa = lerCentavos($('#t-unica'));
    }
    const altas = [...el.querySelectorAll('.com-sufixo input')].filter((i) => (lerCentavos(i) ?? 0) >= 10000);
    if (altas.length) { aviso('Uma taxa precisa ser menor que 100%.', { tipo: 'erro' }); altas[0].focus(); return; }
    await db.formasPagamento.put(registro);
    aviso('Forma de pagamento salva.');
    location.hash = '#/configuracoes/formas';
  });

  if ($('#excluir')) $('#excluir').addEventListener('click', async () => {
    // Quando existirem vendas, formas já usadas só poderão ser desativadas
    if (!(await confirmar({ titulo: `Excluir ${f.nome}?`, botao: 'Excluir', perigo: true }))) return;
    await db.formasPagamento.delete(f.id);
    aviso('Forma de pagamento excluída.');
    location.hash = '#/configuracoes/formas';
  });
}
