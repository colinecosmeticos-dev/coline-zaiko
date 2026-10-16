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

export function planilhaFechamento(evento, f, registros) {
  const g = f.geral;
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
    ...f.categorias.map((c) => [c.nome, R(c.valor), c.quantidade, c.despesa ? 'Sim' : 'Não'])
  ];

  const itens = [[N('Data'), N('Hora'), N('Número'), N('Tipo'), N('Situação'), N('Aparelho'), N('Produto'), N('Variação'), N('Qtd.'), N('Preço unit.'), N('Desconto'), N('Total'), N('Brinde'), N('Custo unit.'), N('Estado (devolvido)'), N('Pagamento'), N('Venda original'), N('Pós-evento')]];
  for (const r of [...registros].sort((a, b) => a.criadoEm.localeCompare(b.criadoEm))) {
    const base = [dataBR(diaLocal(r.criadoEm)), hora(r.criadoEm), r.numero, TIPO[r.tipo || 'venda'], r.status === 'cancelada' ? 'Cancelada' : 'Concluída', r.aparelho?.sigla || ''];
    const pagamento = [...(r.pagamentos || []).map((p) => `${p.formaNome}${p.parcelas > 1 ? ` ${p.parcelas}x` : ''}`), ...(r.reembolsos || []).map((d) => `Devolvido (${d.nome})`)].join(' + ');
    const fim = [pagamento, r.origemNumero || '', r.posEvento ? 'Sim' : ''];
    for (const i of r.itens || []) itens.push([...base, i.nome, i.variacaoNome || '', i.quantidade, R(i.precoUnit), R(i.descontoValor || 0), R(i.total), i.brinde ? 'Sim' : '', R(i.custoUnit), '', ...fim]);
    for (const d of r.devolvidos || []) itens.push([...base, d.nome, d.variacaoNome || '', -d.quantidade, R(d.precoUnit), null, R(-d.valor), '', R(d.custoUnit), d.estado === 'defeito' ? 'Com defeito' : 'Bom estado', ...fim]);
    if (r.descontoVendaValor) itens.push([...base, 'Desconto na venda', '', null, null, R(r.descontoVendaValor), R(-r.descontoVendaValor), '', null, '', ...fim]);
  }

  const estoque = [[N('Produto'), N('Variação'), N('Levado'), N('Vendido'), N('Brindes'), N('Avarias'), N('Voltaram'), N('Sobra')],
    ...f.estoque.linhas.map((l) => [l.produto, l.variacao, l.levado, l.vendido, l.brindes, l.avarias, l.voltaram, { v: l.sobra, estilo: 'negrito' }]),
    [N('Total'), '', f.estoque.totais.levado, f.estoque.totais.vendido, f.estoque.totais.brindes, f.estoque.totais.avarias, f.estoque.totais.voltaram, { v: f.estoque.totais.sobra, estilo: 'negrito' }]];

  const caixas = [[N('Dia'), N('Aparelho'), N('Situação'), N('Esperado'), N('Contado'), N('Diferença')],
    ...f.caixas.map((c) => [dataBR(c.data), c.aparelho?.nome || c.aparelho?.sigla || '', c.aberto ? 'Aberto' : 'Fechado', R(c.esperado), R(c.contado), R(c.diferenca)])];

  const blob = gerarXlsx([
    { nome: 'Resumo', larguras: [36, 16, 14, 14, 14], linhas: resumo },
    { nome: 'Itens', larguras: [11, 7, 12, 11, 11, 9, 30, 16, 6, 11, 10, 11, 7, 11, 16, 28, 13, 10], linhas: itens, congelarLinha1: true },
    { nome: 'Estoque', larguras: [30, 16, 9, 9, 9, 9, 9, 9], linhas: estoque, congelarLinha1: true },
    { nome: 'Caixas', larguras: [12, 18, 10, 13, 13, 13], linhas: caixas, congelarLinha1: true }
  ]);
  return new File([blob], `${nomePlanilha(evento)}.xlsx`, { type: blob.type });
}
