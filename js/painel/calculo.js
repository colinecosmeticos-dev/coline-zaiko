// =========================================================
// Contas do Painel de vendas (só as vendas DESTE aparelho).
// Faturamento = soma dos totais de vendas, trocas e devoluções
//   (troca entra pela diferença; devolução entra negativa).
// Custo das mercadorias = custo dos itens que saíram − custo dos que voltaram.
// Taxas = estimadas pela taxa gravada em cada pagamento.
// Canceladas não contam.
// =========================================================

export function calcularPainel(registros) {
  const validos = registros.filter((r) => r.status !== 'cancelada');
  const vendas = validos.filter((r) => (r.tipo || 'venda') === 'venda');

  let faturamento = 0, custo = 0, descontos = 0, itensVendidos = 0, itensSemCusto = 0;
  let brindesQtd = 0, brindesCusto = 0, taxas = 0, pagamentosSemTaxa = 0;
  const produtos = new Map();
  const formas = new Map();
  const horas = new Map();

  const somarProduto = (i, qtd, valor) => {
    const chave = i.variacaoId || `${i.nome}|${i.variacaoNome}`;
    const p = produtos.get(chave) || { nome: i.nome, variacao: i.variacaoNome || '', quantidade: 0, valor: 0 };
    p.quantidade += qtd;
    p.valor += valor;
    produtos.set(chave, p);
  };

  for (const r of validos) {
    faturamento += r.total;
    descontos += (r.descontoVendaValor || 0) + (r.itens || []).reduce((s, i) => s + (i.descontoValor || 0), 0);
    // Parte do desconto da venda que cabe a cada item (para o valor por produto)
    const fator = r.subtotal > 0 ? (r.subtotal - (r.descontoVendaValor || 0)) / r.subtotal : 0;
    for (const i of r.itens || []) {
      if (i.brinde) {
        brindesQtd += i.quantidade;
        brindesCusto += (i.custoUnit || 0) * i.quantidade;
        continue;
      }
      itensVendidos += i.quantidade;
      if (i.custoUnit == null) itensSemCusto += i.quantidade; else custo += i.custoUnit * i.quantidade;
      somarProduto(i, i.quantidade, Math.round(i.total * fator));
    }
    for (const d of r.devolvidos || []) {
      itensVendidos -= d.quantidade;
      if (d.custoUnit != null) custo -= d.custoUnit * d.quantidade;
      somarProduto(d, -d.quantidade, -d.valor);
    }
    for (const p of r.pagamentos || []) {
      const chave = p.formaId || p.formaNome;
      const f = formas.get(chave) || { nome: p.formaNome, valor: 0, quantidade: 0 };
      f.valor += p.valor; f.quantidade += 1;
      formas.set(chave, f);
      if (p.tipo === 'dinheiro') continue;
      // Taxa sobre o valor passado na maquininha (com troco em dinheiro, é o recebido)
      if (p.taxa == null) pagamentosSemTaxa += 1; else taxas += Math.round(((p.trocoEmDinheiro || p.aMais ? p.recebido : p.valor) * p.taxa) / 10000);
    }
  }
  for (const v of vendas) {
    const h = new Date(v.criadoEm).getHours();
    const x = horas.get(h) || { hora: h, vendas: 0, valor: 0 };
    x.vendas += 1; x.valor += v.total;
    horas.set(h, x);
  }

  const totalVendas = vendas.reduce((s, v) => s + v.total, 0);
  const devolvido = validos.flatMap((r) => r.reembolsos || []).reduce((s, d) => s + d.valor, 0);
  return {
    faturamento,
    quantidadeVendas: vendas.length,
    trocas: validos.filter((r) => r.tipo === 'troca').length,
    devolucoes: validos.filter((r) => r.tipo === 'devolucao').length,
    canceladas: registros.length - validos.length,
    ticketMedio: vendas.length ? Math.round(totalVendas / vendas.length) : 0,
    itensVendidos, descontos, devolvido,
    brindesQtd, brindesCusto,
    custo, itensSemCusto,
    taxas, pagamentosSemTaxa,
    lucroBruto: faturamento - custo,
    lucroDepoisTaxas: faturamento - custo - taxas,
    porForma: [...formas.values()].sort((a, b) => b.valor - a.valor),
    maisVendidos: [...produtos.values()].filter((p) => p.quantidade > 0).sort((a, b) => b.quantidade - a.quantidade || b.valor - a.valor),
    porHora: [...horas.values()].sort((a, b) => a.hora - b.hora)
  };
}
