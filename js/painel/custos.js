// =========================================================
// Custo de itens vendidos sem custo (v0.32.0).
// Cada venda guarda o custo da hora da venda. Se o item foi vendido antes
// de o custo ser cadastrado, a venda ficou sem custo e o lucro aparecia
// maior do que é. Nos relatórios (Fechamento e Painel), esses itens passam
// a usar o custo ATUAL do cadastro. Um custo já gravado na venda nunca é
// trocado, e os registros gravados não mudam: só as contas.
// =========================================================

// Custo atual de cada variação (o da variação ou, se não tiver, o do produto)
export function custosDoCadastro(produtos) {
  const m = new Map();
  for (const p of produtos) for (const v of p.variacoes || []) {
    const c = v.custo ?? p.custo;
    if (c != null) m.set(v.id, c);
  }
  return m;
}

// Devolve cópias dos registros com o custo completado e quantas unidades usaram o cadastro
export function completarCustos(registros, custos) {
  let unidades = 0;
  const preencher = (i) => {
    if (i.custoUnit != null || !custos.has(i.variacaoId)) return i;
    if (!i.brinde) unidades += i.quantidade;
    return { ...i, custoUnit: custos.get(i.variacaoId), custoDoCadastro: true };
  };
  const lista = registros.map((r) => ({
    ...r,
    itens: (r.itens || []).map(preencher),
    devolvidos: r.devolvidos ? r.devolvidos.map((d) => (d.custoUnit != null || !custos.has(d.variacaoId) ? d : { ...d, custoUnit: custos.get(d.variacaoId), custoDoCadastro: true })) : r.devolvidos
  }));
  return { registros: lista, unidades };
}

// Saídas sem venda (brindes avulsos e avarias)
export function completarCustosSaidas(saidas, custos) {
  return saidas.map((s) => (s.custoUnit != null || !custos.has(s.variacaoId) ? s : { ...s, custoUnit: custos.get(s.variacaoId), custoDoCadastro: true }));
}
