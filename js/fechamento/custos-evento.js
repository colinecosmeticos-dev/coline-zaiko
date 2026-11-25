// =========================================================
// Custos do evento (v0.35.0): o que o evento custa além dos produtos.
// Guardado no próprio evento, em evento.custos:
//   modo        'fixo' | 'pct' | 'ambos'  — como o evento cobra
//   valorFixo   centavos (taxa de inscrição, aluguel do espaço)
//   comissaoPct centésimos de % (10% = 1000), sobre o faturamento
//   estrutura   [{ id, qtd, item, dimensoes, valor }] (valor null = incluso)
//   equipe      [{ id, nome, diaria, dias: ['2026-12-12', ...] }]
// Não vai para os caixas (a base leva o evento sem os custos).
// =========================================================

// Dias do evento, do primeiro ao último ('AAAA-MM-DD')
export function diasDoEvento(evento) {
  const dias = [];
  if (!evento?.dataInicio) return dias;
  const fim = evento.dataFim || evento.dataInicio;
  const d = new Date(evento.dataInicio + 'T12:00');
  for (let i = 0; i < 60; i++) {
    const iso = d.toLocaleDateString('sv-SE');
    if (iso > fim) break;
    dias.push(iso);
    d.setDate(d.getDate() + 1);
  }
  return dias;
}

export const custosVazios = () => ({ modo: 'fixo', valorFixo: null, comissaoPct: null, estrutura: [], equipe: [] });

// Totais dos custos; a comissão precisa do faturamento (no fechamento)
export function calcularCustosEvento(custos, faturamento = 0) {
  const c = custos || custosVazios();
  const usaFixo = c.modo !== 'pct', usaPct = c.modo !== 'fixo';
  const valorFixo = usaFixo ? (c.valorFixo || 0) : 0;
  const comissaoPct = usaPct ? (c.comissaoPct || 0) : 0;
  const comissao = Math.round((faturamento * comissaoPct) / 10000);
  const estrutura = (c.estrutura || []).reduce((s, x) => s + (x.valor || 0), 0);
  const pessoas = (c.equipe || []).map((p) => ({ ...p, quantidadeDias: (p.dias || []).length, total: (p.diaria || 0) * (p.dias || []).length }));
  const equipe = pessoas.reduce((s, p) => s + p.total, 0);
  const diarias = pessoas.reduce((s, p) => s + p.quantidadeDias, 0);
  const fixos = valorFixo + estrutura + equipe;
  return {
    valorFixo, comissaoPct, comissao, estrutura, equipe, diarias, pessoas,
    fixos, total: fixos + comissao,
    tem: !!(valorFixo || comissaoPct || estrutura || equipe || (c.estrutura || []).length || pessoas.length)
  };
}

// Quanto vender para cobrir os custos fixos, pela margem (fração do faturamento que sobra
// depois do custo dos produtos e das taxas) de outro evento. null quando não dá para estimar.
export function vendaParaCobrir(fixos, margem, comissaoPct = 0) {
  const sobra = margem - comissaoPct / 10000;
  if (!fixos || !(sobra > 0)) return null;
  return Math.round(fixos / sobra);
}
