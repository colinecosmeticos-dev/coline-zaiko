// =========================================================
// Planilha do fechamento do evento (.xlsx), num arquivo só, com abas:
//   Resumo  — resultado, indicadores, formas de pagamento, dias,
//             aparelhos e retiradas por categoria
//   Itens   — uma linha por item vendido (itens que voltaram: negativos)
//   Estoque — levado, vendido, brindes, avarias, voltaram e sobra
//   Caixas  — esperado, contado e diferença de cada caixa
// Valores em reais como números (dá para somar e fazer contas na planilha).
// =========================================================
import { gerarXlsx } from '../xlsx.js';
import { diaLocal } from '../telas/vendas.js';

const R = (centavos, estilo = 'moeda') => centavos == null ? null : { v: Math.round(centavos) / 100, estilo };
const N = (titulo) => ({ v: titulo, estilo: 'negrito' });
const dataBR = (iso) => { if (!iso) return ''; const [a, m, d] = iso.split('-'); return `${d}/${m}/${a}`; };
const hora = (iso) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
const TIPO = { venda: 'Venda', troca: 'Troca', devolucao: 'Devolução' };
const slug = (t) => (t || 'evento').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();

export const nomePlanilha = (evento) => `fechamento-${slug(evento.nome)}`;

// Categoria, subcategoria (campo tipo) e linha de um item: os da hora da venda; vendas
// antigas (sem esses dados) usam os do cadastro atual (a linha pode ser da variação)
function classificador(produtos) {
  const doCadastro = new Map((produtos || []).map((p) => [p.id, p]));
  const variacao = new Map((produtos || []).flatMap((p) => (p.variacoes || []).map((v) => [v.id, v])));
  return (i) => {
    const p = doCadastro.get(i.produtoId) || {};
    const v = variacao.get(i.variacaoId) || {};
    return {
      categoria: i.categoriaNome || p.categoria || 'Sem categoria',
      tipo: i.tipoNome || p.tipo || 'Sem subcategoria',
      linha: i.linhaNome || v.linha || p.linha || 'Sem linha'
    };
  };
}

// Soma itens e valor por categoria, tipo ou linha (vendas concluídas do evento; voltaram = negativos)
function somarPor(registros, classe, campo) {
  const mapa = new Map();
  const somar = (i, qtd, valor) => {
    const k = classe(i)[campo];
    const x = mapa.get(k) || { nome: k, quantidade: 0, valor: 0 };
    x.quantidade += qtd; x.valor += valor; mapa.set(k, x);
  };
  for (const r of registros) {
    if (r.status === 'cancelada' || r.posEvento) continue;
    for (const i of r.itens || []) somar(i, i.quantidade, i.total);
    for (const d of r.devolvidos || []) somar(d, -d.quantidade, -d.valor);
  }
  return [...mapa.values()].filter((x) => x.quantidade || x.valor).sort((a, b) => b.valor - a.valor);
}

export function planilhaFechamento(evento, f, registros, produtos = []) {
  const g = f.geral;
  const classe = classificador(produtos);
  const bloco = (titulo, campo) => [[], [N(titulo), N('Itens'), N('Valor dos itens')], ...somarPor(registros, classe, campo).map((x) => [x.nome, x.quantidade, R(x.valor)])];
  const periodo = `${dataBR(evento.dataInicio)}${evento.dataFim && evento.dataFim !== evento.dataInicio ? ` a ${dataBR(evento.dataFim)}` : ''}`;

  const resumo = [
    [{ v: `Fechamento — ${evento.nome}`, estilo: 'titulo' }],
    ['Período', periodo],
    ['Gerado em', new Date().toLocaleString('pt-BR')],
    [],
    [N('Resultado'), N('R$')],
    ['Faturamento', R(g.faturamento)],
    ['Taxas da maquininha (estimadas)', R(-g.taxas)],
    [N('Faturamento líquido'), R(f.faturamentoLiquido, 'moedaNegrito')],
    ['Custo dos produtos', R(-g.custo)],
    ['Despesas do caixa', R(-f.despesas)],
    [N('Resultado do evento'), R(f.resultado, 'moedaNegrito')],
    ['Brindes (custo)', R(-f.perdaBrindes)],
    ['Avarias (custo)', R(-f.perdaAvarias)],
    [N('Resultado depois das perdas'), R(f.resultadoDepoisPerdas, 'moedaNegrito')],
    ['Lucro bruto (faturamento − custo)', R(g.lucroBruto)],
    [],
    [N('Indicadores'), null],
    ['Vendas', g.quantidadeVendas], ['Ticket médio', R(g.ticketMedio)], ['Itens vendidos', g.itensVendidos],
    ['Descontos concedidos', R(g.descontos)], ['Trocas', g.trocas], ['Devoluções', g.devolucoes], ['Canceladas', g.canceladas],
    ['Diferença dos caixas fechados', R(f.diferencaCaixas)],
    ...(f.estoque.contagem.itensContados ? [['Peças faltando na contagem final', f.estoque.contagem.pecasFaltando], ['Valor das faltas (custo)', R(f.estoque.contagem.valorFaltando)]] : []),
    [],
    [N('Por forma de pagamento'), N('R$'), N('Pagamentos')],
    ...g.porForma.map((x) => [x.nome, R(x.valor), x.quantidade]),
    ...(g.devolvido ? [['Devolvido ao cliente', R(-g.devolvido)]] : []),
    [],
    [N('Por dia'), N('Faturamento'), N('Vendas'), N('Ticket médio'), N('Despesas')],
    ...f.porDia.map((d) => [dataBR(d.chave), R(d.faturamento), d.vendas, R(d.ticketMedio), R(d.despesas)]),
    [],
    [N('Por aparelho'), N('Faturamento'), N('Vendas'), N('Ticket médio')],
    ...f.porAparelho.map((a) => [`${a.nome} (${a.chave})`, R(a.faturamento), a.vendas, R(a.ticketMedio)]),
    [],
    [N('Retiradas por categoria'), N('R$'), N('Lançamentos'), N('É despesa?')],
    ...f.categorias.map((c) => [c.nome, R(c.valor), c.quantidade, c.despesa ? 'Sim' : 'Não']),
    // Valor dos itens = preço com o desconto do item, antes do desconto na venda inteira
    ...bloco('Por categoria de produto', 'categoria'),
    ...bloco('Por subcategoria', 'tipo'),
    ...bloco('Por linha', 'linha')
  ];

  const itens = [[N('Data'), N('Hora'), N('Número'), N('Tipo'), N('Situação'), N('Aparelho'), N('Produto'), N('Variação'), N('Categoria'), N('Subcategoria'), N('Linha'), N('Qtd.'), N('Preço unit.'), N('Desconto'), N('Total'), N('Brinde'), N('Custo unit.'), N('Estado (devolvido)'), N('Pagamento'), N('Venda original'), N('Pós-evento')]];
  for (const r of [...registros].sort((a, b) => a.criadoEm.localeCompare(b.criadoEm))) {
    const base = [dataBR(diaLocal(r.criadoEm)), hora(r.criadoEm), r.numero, TIPO[r.tipo || 'venda'], r.status === 'cancelada' ? 'Cancelada' : 'Concluída', r.aparelho?.sigla || ''];
    const pagamento = [...(r.pagamentos || []).map((p) => `${p.formaNome}${p.parcelas > 1 ? ` ${p.parcelas}x` : ''}`), ...(r.reembolsos || []).map((d) => `Devolvido (${d.nome})`)].join(' + ');
    const fim = [pagamento, r.origemNumero || '', r.posEvento ? 'Sim' : ''];
    const cls = (i) => { const c = classe(i); return [c.categoria, c.tipo, c.linha]; };
    for (const i of r.itens || []) itens.push([...base, i.nome, i.variacaoNome || '', ...cls(i), i.quantidade, R(i.precoUnit), R(i.descontoValor || 0), R(i.total), i.brinde ? 'Sim' : '', R(i.custoUnit), '', ...fim]);
    for (const d of r.devolvidos || []) itens.push([...base, d.nome, d.variacaoNome || '', ...cls(d), -d.quantidade, R(d.precoUnit), null, R(-d.valor), '', R(d.custoUnit), d.estado === 'defeito' ? 'Com defeito' : 'Bom estado', ...fim]);
    if (r.descontoVendaValor) itens.push([...base, 'Desconto na venda', '', '', '', '', null, null, R(r.descontoVendaValor), R(-r.descontoVendaValor), '', null, '', ...fim]);
  }

  const ct = f.estoque.contagem;
  const estoque = [[N('Produto'), N('Variação'), N('Levado'), N('Vendido'), N('Brindes'), N('Avarias'), N('Voltaram'), N('Sobra calculada'), N('Contado'), N('Diferença'), N('Custo unit.'), N('Valor da falta')],
    ...f.estoque.linhas.map((l) => [l.produto, l.variacao, l.levado, l.vendido, l.brindes, l.avarias, l.voltaram, { v: l.sobra, estilo: 'negrito' },
      l.contado, l.diferenca, R(l.custoUnit), l.diferenca < 0 && l.custoUnit != null ? R(-l.diferenca * l.custoUnit) : null]),
    [N('Total'), '', f.estoque.totais.levado, f.estoque.totais.vendido, f.estoque.totais.brindes, f.estoque.totais.avarias, f.estoque.totais.voltaram, { v: f.estoque.totais.sobra, estilo: 'negrito' },
      ct.itensContados ? ct.pecasContadas : null, ct.itensContados ? ct.pecasSobrando - ct.pecasFaltando : null, null, ct.valorFaltando ? R(ct.valorFaltando, 'moedaNegrito') : null]];

  const caixas = [[N('Dia'), N('Aparelho'), N('Situação'), N('Esperado'), N('Contado'), N('Diferença')],
    ...f.caixas.map((c) => [dataBR(c.data), c.aparelho?.nome || c.aparelho?.sigla || '', c.aberto ? 'Aberto' : 'Fechado', R(c.esperado), R(c.contado), R(c.diferenca)])];

  const blob = gerarXlsx([
    { nome: 'Resumo', larguras: [36, 16, 14, 14, 14], linhas: resumo },
    { nome: 'Itens', larguras: [11, 7, 12, 11, 11, 9, 30, 16, 14, 14, 14, 6, 11, 10, 11, 7, 11, 16, 28, 13, 10], linhas: itens, congelarLinha1: true },
    { nome: 'Estoque', larguras: [30, 16, 9, 9, 9, 9, 9, 15, 9, 10, 11, 14], linhas: estoque, congelarLinha1: true },
    { nome: 'Caixas', larguras: [12, 18, 10, 13, 13, 13], linhas: caixas, congelarLinha1: true }
  ]);
  return new File([blob], `${nomePlanilha(evento)}.xlsx`, { type: blob.type });
}
