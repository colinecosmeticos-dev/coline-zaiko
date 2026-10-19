// =========================================================
// Carrinho da venda: itens, descontos e contas.
// Fica guardado na memória enquanto o app está aberto, então
// sair da tela de venda e voltar não perde o carrinho.
// Todos os valores em centavos; percentuais em centésimos (10% = 1000).
// =========================================================

export const carrinho = {
  itens: [],              // { chave, variacaoId, produtoId, nome, variacaoNome, categoriaNome, tipoNome, linhaNome, codigo, quantidade, precoUnit, custoUnit, desconto, brinde }
  descontoVenda: null,    // { tipo: 'R$' | '%', valor } ou null
  troca: null             // troca em andamento: { origemId, origemNumero, devolvidos, credito, modoValor, motivo }
};

export function limparCarrinho() {
  carrinho.itens = [];
  carrinho.descontoVenda = null;
  carrinho.troca = null;
}

// Adiciona 1 unidade (ou soma na linha que já existe, se não tiver ajuste próprio)
export function adicionarItem(produto, variacao) {
  const existente = carrinho.itens.find((i) => i.variacaoId === variacao.id && !i.brinde && !i.desconto);
  if (existente) { existente.quantidade += 1; return existente; }
  const item = {
    chave: Math.random().toString(36).slice(2),
    variacaoId: variacao.id,
    produtoId: produto.id,
    nome: produto.nome,
    variacaoNome: variacao.nome || '',
    // Categoria, subcategoria (tipoNome) e linha da hora da venda (para os relatórios)
    categoriaNome: produto.categoria || '',
    tipoNome: produto.tipo || '',
    linhaNome: variacao.linha || produto.linha || '',
    codigo: variacao.codigo,
    quantidade: 1,
    precoUnit: variacao.preco ?? produto.preco,
    precoBase: variacao.precoBase ?? null,   // preço normal, quando o item está com preço do evento
    custoUnit: variacao.custo ?? produto.custo ?? null,
    desconto: null,
    brinde: false
  };
  carrinho.itens.push(item);
  return item;
}

export function removerItem(chave) {
  carrinho.itens = carrinho.itens.filter((i) => i.chave !== chave);
}

// Valor de um desconto aplicado sobre uma base, nunca maior que a base
export function valorDesconto(desconto, base) {
  if (!desconto || !desconto.valor) return 0;
  const v = desconto.tipo === '%' ? Math.round((base * desconto.valor) / 10000) : desconto.valor;
  return Math.min(Math.max(v, 0), base);
}

export function calcularItem(item) {
  const bruto = item.precoUnit * item.quantidade;
  if (item.brinde) return { bruto, desconto: 0, total: 0 };
  const desconto = valorDesconto(item.desconto, bruto);
  return { bruto, desconto, total: bruto - desconto };
}

export function calcularTotais() {
  const subtotal = carrinho.itens.reduce((s, i) => s + calcularItem(i).total, 0);
  const descontoVenda = valorDesconto(carrinho.descontoVenda, subtotal);
  const quantidade = carrinho.itens.reduce((s, i) => s + i.quantidade, 0);
  // Na troca, o valor dos itens devolvidos vira crédito e abate do total (o total pode ficar negativo:
  // é a diferença a devolver ao cliente)
  const credito = carrinho.troca ? carrinho.troca.credito : 0;
  return { subtotal, descontoVenda, credito, total: subtotal - descontoVenda - credito, quantidade };
}
