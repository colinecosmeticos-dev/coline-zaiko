// =========================================================
// Guia do caixa (#/guia; v0.40.0, Beta parte 3): uma página para a equipe,
// com a rotina do dia e o que fazer quando algo foge do normal.
// Aberto no Mais do Caixa e no Início da Gestão; Imprimir gera uma folha A4.
// Texto fixo: ao mudar uma tela da equipe, revisar este guia.
// =========================================================
import { icones } from '../ui.js';
import { voltarDoMenu } from '../modo.js';

const passo = (n, titulo, texto) => `<li><span class="gc-n">${n}</span><div><strong>${titulo}</strong><p>${texto}</p></div></li>`;

export function render(el) {
  el.innerHTML = `
    <div class="nao-imprimir">${voltarDoMenu()}</div>
    <header class="cab nao-imprimir"><div><h1>Guia do caixa</h1><p class="sub">A rotina do dia em uma página. Dá para imprimir e deixar junto do tablet.</p></div>
      <button type="button" class="btn" id="imprimir">${icones.imprimir || ''} Imprimir</button></header>

    <article class="guia-caixa">
      <div class="gc-topo"><span class="logo-app" aria-hidden="true"></span><div><h2>Guia do caixa</h2><p>Menu: <b>Início</b> · <b>Vender</b> · <b>Histórico</b> · <b>Gaveta</b> · <b>Sincronizar</b> · <b>Mais</b></p></div></div>

      <section class="gc-bloco">
        <h3>Ao chegar</h3>
        <ol class="gc-passos">
          ${passo(1, 'Sincronizar', 'Com internet, toque em <b>Sincronizar</b>. O tablet recebe produtos, preços e o evento. No Início, confira o nome do evento e o dia ("Dia 2 de 3").')}
          ${passo(2, 'Abrir o caixa', 'Toque em <b>Abrir caixa</b> (no Início ou em Vender), conte o troco da gaveta e digite o valor.')}
        </ol>
      </section>

      <section class="gc-bloco gc-vender">
        <h3>Vendendo</h3>
        <ol class="gc-passos">
          ${passo(3, 'Adicionar os produtos', 'Leia o código com o leitor ou toque no produto: cada leitura ou toque soma 1. Toque no item do carrinho para mudar a quantidade, dar desconto, marcar brinde ou remover.')}
          ${passo(4, 'Cobrar', 'Toque em <b>Cobrar</b> e escolha a forma. <b>Dinheiro:</b> toque nas notas que o cliente entregou; o troco aparece em verde. <b>Dividir:</b> digite um valor menor e escolha a forma do restante.')}
          ${passo(5, 'Próximo cliente', 'Depois de cada venda aparece <b>Caixa livre</b>, com o troco. Leia o próximo código para começar outra venda. Cliente desistiu: <b>Limpar</b>.')}
        </ol>
        <ul class="gc-dicas">
          <li><b>Pix ou cartão passou a mais:</b> o app pergunta se dá o troco em dinheiro ou conclui sem troco.</li>
          <li><b>Brinde ou produto com defeito, sem venda:</b> Cobrar → <b>Sem cobrar: brinde ou avaria</b>.</li>
          <li><b>Troca, devolução ou cancelamento:</b> <b>Histórico</b> → toque na venda (busque pelo número) → Trocar, Devolver ou Cancelar. Escolha com atenção como o dinheiro volta ao cliente: nada vem marcado.</li>
          <li><b>Dinheiro que entra ou sai da gaveta:</b> <b>Gaveta</b> → Reforço (mais troco) ou Retirada (com categoria e motivo).</li>
        </ul>
      </section>

      <section class="gc-bloco">
        <h3>No fim do dia</h3>
        <ol class="gc-passos">
          ${passo(6, 'Fechar o caixa', '<b>Gaveta</b> → <b>Fechar caixa</b>. Conte todo o dinheiro da gaveta e digite o total. Você não vê o valor esperado: é assim mesmo.')}
          ${passo(7, 'Sincronizar', 'O app pergunta "Sincronizar agora?": toque em Sincronizar. Sem internet, faça assim que tiver sinal. Nada se perde no tablet.')}
        </ol>
      </section>

      <section class="gc-bloco gc-problemas">
        <h3>Se acontecer…</h3>
        <dl>
          <div><dt>O app fechou no meio de uma venda</dt><dd>Abra <b>Vender</b>: a venda volta, com os pagamentos já lançados. Toque em Continuar.</dd></div>
          <div><dt>Pede para fechar o caixa de ontem</dt><dd>Vá em <b>Gaveta</b>, feche o caixa antigo (conte o dinheiro) e depois abra o de hoje.</dd></div>
          <div><dt>Código não encontrado</dt><dd>Procure o produto pelo nome na busca ou toque nele. Avise o responsável.</dd></div>
          <div><dt>Ficou uma venda sem registrar ontem</dt><dd>Chame o responsável: registrar venda de outro dia pede o PIN.</dd></div>
          <div><dt>Sem internet</dt><dd>Venda normalmente. As vendas ficam guardadas no tablet; sincronize depois.</dd></div>
          <div><dt>Dúvida com valores, PIN ou algo diferente</dt><dd>Chame o responsável antes de continuar.</dd></div>
        </dl>
      </section>
    </article>`;
  el.querySelector('#imprimir').addEventListener('click', () => window.print());
}
