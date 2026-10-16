// =========================================================
// Sobra do estoque do evento, por variação:
//   sobra = levado − vendido − brindes − avarias + voltaram
// "voltaram" = itens devolvidos em trocas e devoluções (todos voltam;
// os com defeito saem de novo como avaria).
// Vendas, trocas, devoluções e saídas canceladas não contam.
// Usa todas as vendas do evento que estão neste aparelho (no principal,
// depois de juntar, são as de todos os aparelhos).
// =========================================================

export function calcularEstoque({ produtos, levado, registros, saidas, contado = new Map() }) {
  const linhas = new Map();
  const nomes = new Map();
  const custos = new Map();
  for (const p of produtos) for (const v of p.variacoes) { nomes.set(v.id, { produto: p.nome, variacao: v.nome || '', categoria: p.categoria, ativo: p.ativo }); custos.set(v.id, v.custo ?? p.custo ?? null); }

  const linha = (variacaoId, nome, variacaoNome) => {
    if (!linhas.has(variacaoId)) {
      const n = nomes.get(variacaoId) || { produto: nome || '(produto excluído)', variacao: variacaoNome || '', categoria: '' };
      linhas.set(variacaoId, { variacaoId, ...n, levado: levado.get(variacaoId) || 0, vendido: 0, brindes: 0, avarias: 0, voltaram: 0 });
    }
    return linhas.get(variacaoId);
  };
  for (const [variacaoId] of levado) linha(variacaoId);
  for (const [variacaoId] of contado) linha(variacaoId);

  for (const r of registros) {
    if (r.status === 'cancelada') continue;
    for (const i of r.itens || []) {
      const l = linha(i.variacaoId, i.nome, i.variacaoNome);
      if (i.brinde) l.brindes += i.quantidade; else l.vendido += i.quantidade;
    }
    for (const d of r.devolvidos || []) {
      const l = linha(d.variacaoId, d.nome, d.variacaoNome);
      l.voltaram += d.quantidade;
      if (d.estado === 'defeito') l.avarias += d.quantidade;
    }
  }
  for (const s of saidas) {
    if (s.status === 'cancelado') continue;
    const l = linha(s.variacaoId, s.nome, s.variacaoNome);
    if (s.tipo === 'brinde') l.brindes += s.quantidade; else l.avarias += s.quantidade;
  }

  const lista = [...linhas.values()].map((l) => {
    const sobra = l.levado - l.vendido - l.brindes - l.avarias + l.voltaram;
    const c = contado.has(l.variacaoId) ? contado.get(l.variacaoId) : null;
    // diferença = contado − sobra calculada (negativa = faltam peças)
    return { ...l, sobra, contado: c, diferenca: c == null ? null : c - sobra, custoUnit: custos.get(l.variacaoId) ?? null };
  })
    .sort((a, b) => a.produto.localeCompare(b.produto, 'pt-BR') || a.variacao.localeCompare(b.variacao, 'pt-BR'));
  const soma = (k) => lista.reduce((s, l) => s + l[k], 0);
  return {
    linhas: lista,
    totais: { levado: soma('levado'), vendido: soma('vendido'), brindes: soma('brindes'), avarias: soma('avarias'), voltaram: soma('voltaram'), sobra: soma('sobra') },
    negativas: lista.filter((l) => l.sobra < 0).length,
    contagem: resumoContagem(lista)
  };
}

// Resumo da contagem final (só dos itens já contados)
function resumoContagem(lista) {
  const contados = lista.filter((l) => l.contado != null);
  const faltas = contados.filter((l) => l.diferenca < 0);
  const sobras = contados.filter((l) => l.diferenca > 0);
  return {
    itensContados: contados.length,
    itensTotal: lista.filter((l) => l.levado || l.sobra || l.contado != null).length,
    pecasContadas: contados.reduce((s, l) => s + l.contado, 0),
    pecasFaltando: faltas.reduce((s, l) => s - l.diferenca, 0),
    pecasSobrando: sobras.reduce((s, l) => s + l.diferenca, 0),
    valorFaltando: faltas.reduce((s, l) => s + (l.custoUnit || 0) * -l.diferenca, 0),
    faltasSemCusto: faltas.filter((l) => l.custoUnit == null).length,
    itensComDiferenca: contados.filter((l) => l.diferenca !== 0).length
  };
}
