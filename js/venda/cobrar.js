// =========================================================
// Janela de cobrança.
// Botões das formas de pagamento (na ordem cadastrada). Escolhida a
// forma, o valor já vem preenchido com o que falta. No dinheiro, o app
// calcula o troco; no crédito, escolhe parcelas e quem paga os juros.
// Para dividir o pagamento, informe um valor menor e escolha outra forma
// para o restante.
// =========================================================
import { db, listarFormasPagamento, proximoNumeroVenda, lerAparelho, PARCELAS_MAX } from '../db.js';
import { esc, dinheiro, abrirJanela, campoDinheiro, lerCentavos, escreverCentavos, icones } from '../ui.js';
import { som } from '../sons.js';
import { carrinho, calcularItem, calcularTotais, limparCarrinho } from './carrinho.js';

// Notas para os atalhos de valor recebido em dinheiro
const NOTAS = [500, 1000, 2000, 5000, 10000, 20000];

function atalhosDinheiro(falta) {
  const valores = new Set([falta]);
  for (const nota of NOTAS) {
    const v = Math.ceil(falta / nota) * nota;
    if (v > falta) valores.add(v);
    if (valores.size >= 5) break;
  }
  return [...valores].sort((a, b) => a - b);
}

export function abrirCobranca({ evento, caixa }) {
  return new Promise(async (resolver) => {
    const formas = (await listarFormasPagamento()).filter((f) => f.ativo);
    const { total } = calcularTotais();
    const pagamentos = [];
    let forma = null;      // forma escolhida no momento
    let concluida = false;

    const d = abrirJanela(`
      <div class="cobrar">
        <header class="cobrar-topo">
          <div><span class="sub">Total da venda</span><strong class="num cobrar-total">${dinheiro(total)}</strong></div>
          <div class="cobrar-situacao num" id="situacao"></div>
          <button type="button" class="btn-icone" id="fechar" aria-label="Voltar ao carrinho">${icones.fechar}</button>
        </header>
        <div class="cobrar-corpo">
          <div class="grade-formas" id="formas">
            ${formas.map((f) => `<button type="button" class="btn botao-forma" data-forma="${esc(f.id)}">${esc(f.nome)}</button>`).join('')}
          </div>
          <div class="cobrar-detalhe">
            <ul class="lista-pagamentos" id="pagamentos"></ul>
            <p class="dica-forma sub" id="dica-forma">Escolha a forma de pagamento.</p>
            <div class="painel-forma" id="painel" hidden></div>
            <button type="button" class="btn primario btn-finalizar" id="finalizar" hidden>Finalizar venda</button>
          </div>
        </div>
      </div>`, { classe: 'janela-cobrar', aoFechar: () => resolver(concluida) });

    const $ = (s) => d.querySelector(s);
    const pago = () => pagamentos.reduce((s, p) => s + p.valor, 0);
    const falta = () => Math.max(total - pago(), 0);
    const trocoTotal = () => pagamentos.reduce((s, p) => s + (p.troco || 0), 0);

    function desenharSituacao() {
      $('#situacao').innerHTML = pagamentos.length
        ? `<span>Pago ${dinheiro(pago())}</span><strong>${falta() ? `Falta ${dinheiro(falta())}` : trocoTotal() ? `Troco ${dinheiro(trocoTotal())}` : 'Pago'}</strong>`
        : '';
      $('#pagamentos').innerHTML = pagamentos.map((p, i) => `
        <li><span>${esc(p.formaNome)}${p.parcelas > 1 ? ` em ${p.parcelas}x` : ''}${p.troco ? ` <span class="sub">(recebido ${dinheiro(p.recebido)}, troco ${dinheiro(p.troco)})</span>` : ''}</span>
          <span class="num">${dinheiro(p.valor)}</span>
          <button type="button" class="btn-icone" data-remover="${i}" aria-label="Remover pagamento">${icones.fechar}</button></li>`).join('');
      d.querySelectorAll('.botao-forma').forEach((b) => { b.disabled = !falta(); });
      $('#finalizar').hidden = !!falta() || !pagamentos.length;
      $('#dica-forma').hidden = !falta() || !!forma;
      $('#dica-forma').textContent = pagamentos.length ? `Escolha a forma para os ${dinheiro(falta())} que faltam.` : 'Escolha a forma de pagamento.';
      if (!falta()) $('#painel').hidden = true;
    }

    $('#pagamentos').addEventListener('click', (e) => {
      const b = e.target.closest('[data-remover]');
      if (!b) return;
      pagamentos.splice(Number(b.dataset.remover), 1);
      desenharSituacao();
    });

    // ---------- Painel da forma escolhida ----------
    function escolher(f) {
      forma = f;
      d.querySelectorAll('.botao-forma').forEach((b) => b.classList.toggle('ativo', b.dataset.forma === f.id));
      const painel = $('#painel');
      painel.hidden = false;
      $('#dica-forma').hidden = true;
      const restante = falta();
      const ehDinheiro = f.tipo === 'dinheiro';
      const ehCredito = f.tipo === 'credito';
      painel.innerHTML = `
        <div class="campo">
          <label for="valor-pag">${ehDinheiro ? 'Valor recebido' : 'Valor'}</label>
          <input class="entrada entrada-grande" id="valor-pag">
        </div>
        ${ehDinheiro ? `<div class="atalhos">${atalhosDinheiro(restante).map((v, i) => `<button type="button" class="btn" data-valor="${v}">${i === 0 ? 'Exato' : dinheiro(v)}</button>`).join('')}</div>
          <p class="troco num" id="troco"></p>` : ''}
        ${ehCredito ? `
          <div class="campo"><span class="rotulo">Parcelas</span>
            <div class="segmentos" role="radiogroup" aria-label="Parcelas">
              ${Array.from({ length: PARCELAS_MAX }, (_, k) => k + 1).map((n) => `<label><input type="radio" name="parcelas" value="${n}" ${n === 1 ? 'checked' : ''}><span>${n}x</span></label>`).join('')}
            </div></div>
          <div class="campo" id="campo-juros" hidden><span class="rotulo">Juros do parcelado pagos por</span>
            <div class="segmentos" role="radiogroup" aria-label="Quem paga os juros">
              <label><input type="radio" name="juros" value="vendedor" checked><span>Vendedor</span></label>
              <label><input type="radio" name="juros" value="cliente"><span>Cliente</span></label>
            </div></div>` : ''}
        <button type="button" class="btn primario btn-confirmar" id="confirmar"></button>`;

      const campo = $('#valor-pag');
      campoDinheiro(campo);
      escreverCentavos(campo, restante);

      function atualizar() {
        const v = lerCentavos(campo) || 0;
        if (ehDinheiro) {
          const troco = v - restante;
          $('#troco').textContent = troco > 0 ? `Troco: ${dinheiro(troco)}` : '';
        }
        const cobre = (ehDinheiro ? v >= restante : Math.min(v, restante) >= restante);
        $('#confirmar').textContent = cobre && v > 0 ? `Finalizar venda` : `Adicionar ${dinheiro(Math.min(v, restante))}`;
        $('#confirmar').disabled = !v;
      }
      campo.addEventListener('input', atualizar);
      painel.querySelectorAll('[data-valor]').forEach((b) => b.addEventListener('click', () => { escreverCentavos(campo, Number(b.dataset.valor)); atualizar(); }));
      painel.querySelectorAll('input[name="parcelas"]').forEach((r) => r.addEventListener('change', () => {
        $('#campo-juros').hidden = Number(r.value) === 1 || !r.checked;
      }));
      $('#confirmar').addEventListener('click', () => confirmar());
      atualizar();
      // Em tela de toque, não abre o teclado sozinho (ele cobriria os atalhos e o botão)
      if (!ehDinheiro || !matchMedia('(pointer: fine)').matches) $('#confirmar').focus(); else campo.focus();
    }

    function confirmar() {
      const restante = falta();
      const v = lerCentavos($('#valor-pag')) || 0;
      if (!v) return;
      const p = { formaId: forma.id, formaNome: forma.nome, tipo: forma.tipo, parcelas: 1, jurosPor: null, taxa: forma.taxa ?? null };
      if (forma.tipo === 'dinheiro') {
        p.valor = Math.min(v, restante);
        p.recebido = v;
        p.troco = Math.max(v - restante, 0);
        p.taxa = 0;
      } else {
        p.valor = Math.min(v, restante);
      }
      if (forma.tipo === 'credito') {
        p.parcelas = Number(d.querySelector('input[name="parcelas"]:checked').value);
        p.jurosPor = p.parcelas > 1 ? d.querySelector('input[name="juros"]:checked').value : null;
        const taxas = forma.taxasCredito || {};
        // Juros pagos pelo cliente: usa a taxa à vista (decisão registrada na especificação)
        p.taxa = (p.jurosPor === 'cliente' ? taxas[1] : taxas[p.parcelas]) ?? null;
      }
      pagamentos.push(p);
      forma = null;
      d.querySelectorAll('.botao-forma').forEach((b) => b.classList.remove('ativo'));
      $('#painel').hidden = true;
      desenharSituacao();
      if (!falta()) finalizar();
    }

    d.querySelectorAll('[data-forma]').forEach((b) => b.addEventListener('click', () => escolher(formas.find((f) => f.id === b.dataset.forma))));
    $('#fechar').addEventListener('click', () => d.close());
    $('#finalizar').addEventListener('click', finalizar);

    // ---------- Gravar a venda ----------
    let gravando = false;
    async function finalizar() {
      if (gravando || falta()) return;
      gravando = true;
      const totais = calcularTotais();
      const aparelho = await lerAparelho();
      let venda;
      await db.transaction('rw', db.vendas, db.config, async () => {
        const { seq, numero } = await proximoNumeroVenda(true);
        venda = {
          id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
          numero, seq,
          eventoId: evento.id,
          caixaId: caixa.id,
          aparelho: aparelho ? { id: aparelho.id, sigla: aparelho.sigla, nome: aparelho.nome } : null,
          criadoEm: new Date().toISOString(),
          itens: carrinho.itens.map((i) => {
            const c = calcularItem(i);
            return { variacaoId: i.variacaoId, produtoId: i.produtoId, nome: i.nome, variacaoNome: i.variacaoNome, codigo: i.codigo,
              quantidade: i.quantidade, precoUnit: i.precoUnit, custoUnit: i.custoUnit, desconto: i.desconto, descontoValor: c.desconto,
              brinde: i.brinde, total: c.total };
          }),
          subtotal: totais.subtotal,
          descontoVenda: carrinho.descontoVenda,
          descontoVendaValor: totais.descontoVenda,
          total: totais.total,
          pagamentos,
          troco: trocoTotal(),
          status: 'concluida'
        };
        await db.vendas.add(venda);
      });
      limparCarrinho();
      concluida = true;
      som.venda();
      d.querySelector('.cobrar').innerHTML = `
        <div class="venda-concluida">
          <div class="marca-ok" aria-hidden="true">✓</div>
          <h2>Venda ${esc(venda.numero)} concluída</h2>
          <p class="num">${dinheiro(venda.total)}</p>
          ${venda.troco ? `<div class="troco-final"><span>Troco</span><strong class="num">${dinheiro(venda.troco)}</strong></div>` : ''}
          <button type="button" class="btn primario btn-confirmar" id="nova">Nova venda</button>
        </div>`;
      d.querySelector('#nova').addEventListener('click', () => d.close());
      d.querySelector('#nova').focus();
    }

    desenharSituacao();
    // Uma forma só ativa: já abre direto nela
    if (formas.length === 1) escolher(formas[0]);
  });
}
