// =========================================================
// Contas do caixa do dia.
// Dinheiro esperado na gaveta =
//   troco inicial
//   + dinheiro recebido nas vendas e trocas (já sem o troco dado)
//   + reforços
//   − retiradas
//   − dinheiro devolvido ao cliente (devoluções e diferenças de troca)
// Vendas, trocas e devoluções canceladas não contam.
// =========================================================
import { db } from '../db.js';

export async function resumoCaixa(caixa) {
  const registros = (await db.vendas.where('caixaId').equals(caixa.id).toArray()).filter((v) => v.status !== 'cancelada');
  const movimentos = (await db.movimentos.where('caixaId').equals(caixa.id).toArray()).filter((m) => m.status !== 'cancelado');

  // Recebimentos por forma de pagamento (na ordem em que aparecem)
  const formas = new Map();
  for (const r of registros) {
    for (const p of r.pagamentos || []) {
      const chave = p.formaId || p.formaNome;
      const f = formas.get(chave) || { nome: p.formaNome, tipo: p.tipo, valor: 0, quantidade: 0 };
      f.valor += p.valor;
      f.quantidade += 1;
      formas.set(chave, f);
    }
  }
  const porForma = [...formas.values()];
  const dinheiroVendas = porForma.filter((f) => f.tipo === 'dinheiro').reduce((s, f) => s + f.valor, 0);

  // Devolvido ao cliente, por forma
  const devolvido = { dinheiro: 0, pix: 0, estorno: 0 };
  for (const r of registros) for (const d of r.reembolsos || []) devolvido[d.tipo] = (devolvido[d.tipo] || 0) + d.valor;

  const reforcos = movimentos.filter((m) => m.tipo === 'reforco').reduce((s, m) => s + m.valor, 0);
  const retiradasLista = movimentos.filter((m) => m.tipo === 'retirada');
  const retiradas = retiradasLista.reduce((s, m) => s + m.valor, 0);
  const porCategoria = new Map();
  for (const m of retiradasLista) {
    const c = porCategoria.get(m.categoriaNome) || { nome: m.categoriaNome, despesa: m.despesa, valor: 0 };
    c.valor += m.valor;
    porCategoria.set(m.categoriaNome, c);
  }

  const conta = (tipo) => registros.filter((r) => (r.tipo || 'venda') === tipo).length;
  return {
    trocoInicial: caixa.trocoInicial || 0,
    dinheiroVendas, reforcos, retiradas,
    retiradasPorCategoria: [...porCategoria.values()],
    devolvido,
    esperado: (caixa.trocoInicial || 0) + dinheiroVendas + reforcos - retiradas - devolvido.dinheiro,
    porForma,
    totalRecebido: porForma.reduce((s, f) => s + f.valor, 0),
    totalDevolvido: devolvido.dinheiro + devolvido.pix + devolvido.estorno,
    vendas: conta('venda'), trocas: conta('troca'), devolucoes: conta('devolucao')
  };
}
