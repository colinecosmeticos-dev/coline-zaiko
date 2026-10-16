// =========================================================
// Contas do Fechamento do evento (todos os aparelhos cujas vendas
// estão neste aparelho — no principal, depois de juntar).
//   Faturamento        = vendas + diferenças de troca − devoluções
//   Lucro bruto        = faturamento − custo dos produtos
//   Resultado          = lucro bruto − taxas da maquininha − despesas do caixa
//   Perdas (separadas) = custo de brindes e avarias
// Registros pós-evento (trocas e devoluções depois de encerrar) ficam fora.
// =========================================================
import { calcularPainel } from '../painel/calculo.js';
import { calcularEstoque } from '../estoque/calculo.js';
import { diaLocal } from '../telas/vendas.js';

export function calcularFechamento({ registros, caixas, movimentos, saidas, produtos, levado }) {
  const doEvento = registros.filter((r) => !r.posEvento);
  const posEvento = registros.filter((r) => r.posEvento && r.status !== 'cancelada');
  const geral = calcularPainel(doEvento);
  const estoque = calcularEstoque({ produtos, levado, registros: doEvento, saidas });

  // Despesas do caixa (retiradas). Sangria e outras "não despesa" ficam à parte.
  const retiradas = movimentos.filter((m) => m.tipo === 'retirada' && m.status !== 'cancelado');
  const porCategoria = new Map();
  for (const m of retiradas) {
    const c = porCategoria.get(m.categoriaNome) || { nome: m.categoriaNome, despesa: m.despesa !== false, valor: 0, quantidade: 0 };
    c.valor += m.valor; c.quantidade += 1;
    porCategoria.set(m.categoriaNome, c);
  }
  const categorias = [...porCategoria.values()].sort((a, b) => b.valor - a.valor);
  const despesas = categorias.filter((c) => c.despesa).reduce((s, c) => s + c.valor, 0);
  const naoDespesas = categorias.filter((c) => !c.despesa).reduce((s, c) => s + c.valor, 0);

  // Perdas: brindes (na venda e avulsos) e avarias (avulsas e devoluções com defeito), pelo custo
  let perdaBrindes = geral.brindesCusto, perdaAvarias = 0, semCustoPerdas = 0;
  for (const s of saidas) {
    if (s.status === 'cancelado') continue;
    if (s.custoUnit == null) { semCustoPerdas += s.quantidade; continue; }
    if (s.tipo === 'brinde') perdaBrindes += s.custoUnit * s.quantidade; else perdaAvarias += s.custoUnit * s.quantidade;
  }
  for (const r of doEvento) {
    if (r.status === 'cancelada') continue;
    for (const d of r.devolvidos || []) if (d.estado === 'defeito' && d.custoUnit != null) perdaAvarias += d.custoUnit * d.quantidade;
  }

  // Por dia e por aparelho
  const agrupar = (chave) => {
    const mapa = new Map();
    for (const r of doEvento) {
      const k = chave(r);
      const g = mapa.get(k) || { chave: k, registros: [] };
      g.registros.push(r);
      mapa.set(k, g);
    }
    return [...mapa.values()].map((g) => {
      const p = calcularPainel(g.registros);
      return { chave: g.chave, faturamento: p.faturamento, vendas: p.quantidadeVendas, ticketMedio: p.ticketMedio, itens: p.itensVendidos, taxas: p.taxas };
    });
  };
  const despesasDoDia = new Map();
  for (const m of retiradas) {
    if (m.despesa === false) continue;
    const d = diaLocal(m.criadoEm);
    despesasDoDia.set(d, (despesasDoDia.get(d) || 0) + m.valor);
  }
  const porDia = agrupar((r) => diaLocal(r.criadoEm)).map((d) => ({ ...d, despesas: despesasDoDia.get(d.chave) || 0 })).sort((a, b) => a.chave.localeCompare(b.chave));
  const nomeAparelho = new Map(registros.filter((r) => r.aparelho).map((r) => [r.aparelho.sigla, r.aparelho.nome]));
  const porAparelho = agrupar((r) => r.aparelho?.sigla || '?').map((a) => ({ ...a, nome: nomeAparelho.get(a.chave) || a.chave })).sort((a, b) => b.faturamento - a.faturamento);

  // Caixas: diferença do último fechamento de cada um
  const listaCaixas = caixas.map((c) => {
    const f = (c.fechamentos || []).at(-1);
    return { id: c.id, data: c.data, aparelho: c.aparelho, aberto: c.status === 'aberto', esperado: f?.esperado ?? null, contado: f?.contado ?? null, diferenca: c.status === 'aberto' ? null : (f?.diferenca ?? null) };
  }).sort((a, b) => a.data.localeCompare(b.data) || (a.aparelho?.sigla || '').localeCompare(b.aparelho?.sigla || ''));
  const diferencaCaixas = listaCaixas.reduce((s, c) => s + (c.diferenca || 0), 0);

  const resultado = geral.lucroBruto - geral.taxas - despesas;
  return {
    geral, estoque, categorias, despesas, naoDespesas,
    perdaBrindes, perdaAvarias, semCustoPerdas,
    resultado, resultadoDepoisPerdas: resultado - perdaBrindes - perdaAvarias,
    faturamentoLiquido: geral.faturamento - geral.taxas,
    porDia, porAparelho, caixas: listaCaixas, diferencaCaixas,
    caixasAbertos: listaCaixas.filter((c) => c.aberto),
    posEvento
  };
}
