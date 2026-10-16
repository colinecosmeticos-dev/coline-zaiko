// =========================================================
// Gravação de vendas, trocas e devoluções.
// Os três tipos ficam na mesma tabela (vendas) e usam a mesma
// sequência de números (POSI-0001, POSI-0002...).
//   tipo 'venda'     → venda normal
//   tipo 'troca'     → itens devolvidos viram crédito para itens novos
//   tipo 'devolucao' → itens devolvidos e valor devolvido ao cliente
// =========================================================
import { db, proximoNumeroVenda, lerAparelho } from '../db.js';
import { carrinho, calcularItem, calcularTotais } from './carrinho.js';

// Formas de devolver dinheiro ao cliente (devolução ou diferença de troca)
export const FORMAS_REEMBOLSO = [
  { tipo: 'dinheiro', nome: 'Dinheiro' },
  { tipo: 'pix', nome: 'Pix' },
  { tipo: 'estorno', nome: 'Estorno na maquininha' }
];

// Grava o registro com número, aparelho e data. Devolve o registro gravado.
export async function gravarRegistro(dados) {
  const aparelho = await lerAparelho();
  let registro;
  await db.transaction('rw', db.vendas, db.config, async () => {
    const { seq, numero } = await proximoNumeroVenda(true);
    registro = {
      id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
      numero, seq,
      tipo: 'venda',
      aparelho: aparelho ? { id: aparelho.id, sigla: aparelho.sigla, nome: aparelho.nome } : null,
      criadoEm: new Date().toISOString(),
      itens: [], subtotal: 0, descontoVenda: null, descontoVendaValor: 0,
      pagamentos: [], reembolsos: [], troco: 0,
      status: 'concluida',
      ...dados
    };
    await db.vendas.add(registro);
  });
  return registro;
}

// Monta o registro a partir do carrinho (venda normal ou troca)
export function registroDoCarrinho({ evento, caixa, pagamentos = [], reembolsos = [], troco = 0 }) {
  const t = calcularTotais();
  const dados = {
    tipo: carrinho.troca ? 'troca' : 'venda',
    eventoId: evento.id,
    caixaId: caixa ? caixa.id : null,
    itens: carrinho.itens.map((i) => {
      const c = calcularItem(i);
      return { variacaoId: i.variacaoId, produtoId: i.produtoId, nome: i.nome, variacaoNome: i.variacaoNome, codigo: i.codigo,
        categoriaNome: i.categoriaNome || '', tipoNome: i.tipoNome || '', linhaNome: i.linhaNome || '',
        quantidade: i.quantidade, precoUnit: i.precoUnit, precoBase: i.precoBase ?? null, custoUnit: i.custoUnit, desconto: i.desconto, descontoValor: c.desconto,
        brinde: i.brinde, total: c.total };
    }),
    subtotal: t.subtotal,
    descontoVenda: carrinho.descontoVenda,
    descontoVendaValor: t.descontoVenda,
    total: t.total,
    pagamentos, reembolsos, troco,
    posEvento: evento.status === 'encerrado'   // troca depois de encerrar: só histórico
  };
  if (carrinho.troca) {
    const { origemId, origemNumero, devolvidos, credito, modoValor, motivo } = carrinho.troca;
    Object.assign(dados, { origemId, origemNumero, devolvidos, credito, modoValor, motivo });
  }
  return dados;
}

// ---------- Valores para devolução ----------
// Valor de um item da venda original:
//   pago  = o que o item custou de fato (com o desconto do item e a parte dele no desconto da venda)
//   cheio = preço de tabela, sem nenhum desconto
export function valoresItem(venda, item) {
  const dv = venda.descontoVendaValor || 0;
  const parteDesconto = venda.subtotal > 0 ? Math.round((item.total * dv) / venda.subtotal) : 0;
  return { pago: item.total - parteDesconto, cheio: item.precoUnit * item.quantidade };
}
// Valor de k unidades de um item (proporcional)
export function valorUnidades(venda, item, k, modo) {
  const v = valoresItem(venda, item)[modo];
  return Math.round((v * k) / item.quantidade);
}

// Trocas e devoluções já feitas de uma venda (sem as canceladas)
export async function registrosLigados(venda) {
  return (await db.vendas.where('eventoId').equals(venda.eventoId).toArray())
    .filter((r) => r.origemId === venda.id && r.status !== 'cancelada')
    .sort((a, b) => a.criadoEm.localeCompare(b.criadoEm));
}
// Quantas unidades de cada item (pelo índice) já voltaram
export async function quantidadesDevolvidas(venda) {
  const mapa = new Map();
  for (const r of await registrosLigados(venda)) {
    for (const d of r.devolvidos || []) mapa.set(d.itemIndice, (mapa.get(d.itemIndice) || 0) + d.quantidade);
  }
  return mapa;
}
