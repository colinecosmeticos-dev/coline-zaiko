// =========================================================
// Sobra do estoque do evento, por variação:
//   sobra = levado − vendido − brindes − avarias + voltaram
// "voltaram" = itens devolvidos em trocas e devoluções (todos voltam;
// os com defeito saem de novo como avaria).
// Vendas, trocas, devoluções e saídas canceladas não contam.
// Usa todas as vendas do evento que estão neste aparelho (no principal,
// depois de juntar, são as de todos os aparelhos).
// =========================================================

export function calcularEstoque({ produtos, levado, registros, saidas }) {
  const linhas = new Map();
  const nomes = new Map();
  for (const p of produtos) for (const v of p.variacoes) nomes.set(v.id, { produto: p.nome, variacao: v.nome || '', categoria: p.categoria, ativo: p.ativo });

  const linha = (variacaoId, nome, variacaoNome) => {
    if (!linhas.has(variacaoId)) {
      const n = nomes.get(variacaoId) || { produto: nome || '(produto excluído)', variacao: variacaoNome || '', categoria: '' };
      linhas.set(variacaoId, { variacaoId, ...n, levado: levado.get(variacaoId) || 0, vendido: 0, brindes: 0, avarias: 0, voltaram: 0 });
    }
    return linhas.get(variacaoId);
  };
  for (const [variacaoId] of levado) linha(variacaoId);

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

  const lista = [...linhas.values()].map((l) => ({ ...l, sobra: l.levado - l.vendido - l.brindes - l.avarias + l.voltaram }))
    .sort((a, b) => a.produto.localeCompare(b.produto, 'pt-BR') || a.variacao.localeCompare(b.variacao, 'pt-BR'));
  const soma = (k) => lista.reduce((s, l) => s + l[k], 0);
  return {
    linhas: lista,
    totais: { levado: soma('levado'), vendido: soma('vendido'), brindes: soma('brindes'), avarias: soma('avarias'), voltaram: soma('voltaram'), sobra: soma('sobra') },
    negativas: lista.filter((l) => l.sobra < 0).length
  };
}
