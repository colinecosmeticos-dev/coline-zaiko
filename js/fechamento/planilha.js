// =========================================================
// Exportação em planilha (CSV) do fechamento do evento.
// Separador ";" e vírgula decimal, com marca BOM: o Excel em português
// e o Google Planilhas abrem direto, com acentos certos.
// =========================================================
import { diaLocal } from '../telas/vendas.js';

const num = (centavos) => centavos == null ? '' : (centavos / 100).toFixed(2).replace('.', ',');
const cel = (v) => {
  const t = String(v ?? '');
  return /[;"\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};
const linhaCSV = (valores) => valores.map(cel).join(';');
const arquivoCSV = (nome, linhas) => new File(['﻿' + linhas.map(linhaCSV).join('\r\n')], nome, { type: 'text/csv' });
const dataBR = (iso) => { const [a, m, d] = iso.split('-'); return `${d}/${m}/${a}`; };
const hora = (iso) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
const TIPO = { venda: 'Venda', troca: 'Troca', devolucao: 'Devolução' };
const slug = (t) => (t || 'evento').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();

// Uma linha por item vendido (e por item que voltou, com quantidade negativa)
export function planilhaItens(evento, registros) {
  const linhas = [['Data', 'Hora', 'Número', 'Tipo', 'Situação', 'Aparelho', 'Produto', 'Variação', 'Quantidade', 'Preço unitário', 'Desconto', 'Total', 'Brinde', 'Custo unitário', 'Estado (devolvido)', 'Pagamento', 'Venda original', 'Pós-evento']];
  const ordenados = [...registros].sort((a, b) => a.criadoEm.localeCompare(b.criadoEm));
  for (const r of ordenados) {
    const base = [dataBR(diaLocal(r.criadoEm)), hora(r.criadoEm), r.numero, TIPO[r.tipo || 'venda'], r.status === 'cancelada' ? 'Cancelada' : 'Concluída', r.aparelho?.sigla || ''];
    const pagamento = [...(r.pagamentos || []).map((p) => `${p.formaNome}${p.parcelas > 1 ? ` ${p.parcelas}x` : ''} ${num(p.valor)}`), ...(r.reembolsos || []).map((d) => `Devolvido (${d.nome}) ${num(d.valor)}`)].join(' + ');
    const fim = [pagamento, r.origemNumero || '', r.posEvento ? 'Sim' : ''];
    for (const i of r.itens || []) {
      linhas.push([...base, i.nome, i.variacaoNome || '', i.quantidade, num(i.precoUnit), num(i.descontoValor || 0), num(i.total), i.brinde ? 'Sim' : '', num(i.custoUnit), '', ...fim]);
    }
    for (const d of r.devolvidos || []) {
      linhas.push([...base, d.nome, d.variacaoNome || '', -d.quantidade, num(d.precoUnit), '', num(-d.valor), '', num(d.custoUnit), d.estado === 'defeito' ? 'Com defeito' : 'Bom estado', ...fim]);
    }
    if (r.descontoVendaValor) linhas.push([...base, 'Desconto na venda', '', '', '', num(r.descontoVendaValor), num(-r.descontoVendaValor), '', '', '', ...fim]);
  }
  return arquivoCSV(`itens-${slug(evento.nome)}.csv`, linhas);
}

// Resumo do fechamento
export function planilhaResumo(evento, f) {
  const g = f.geral;
  const L = [
    ['Fechamento do evento', evento.nome],
    ['Período', `${dataBR(evento.dataInicio)}${evento.dataFim && evento.dataFim !== evento.dataInicio ? ` a ${dataBR(evento.dataFim)}` : ''}`],
    ['Gerado em', new Date().toLocaleString('pt-BR')],
    [],
    ['Resultado', 'Valor (R$)'],
    ['Faturamento', num(g.faturamento)],
    ['Taxas da maquininha (estimadas)', num(-g.taxas)],
    ['Faturamento líquido', num(f.faturamentoLiquido)],
    ['Custo dos produtos', num(-g.custo)],
    ['Lucro bruto', num(g.lucroBruto)],
    ['Despesas do caixa', num(-f.despesas)],
    ['Resultado do evento', num(f.resultado)],
    ['Perdas com brindes (custo)', num(-f.perdaBrindes)],
    ['Perdas com avarias (custo)', num(-f.perdaAvarias)],
    ['Resultado depois das perdas', num(f.resultadoDepoisPerdas)],
    [],
    ['Indicadores', ''],
    ['Vendas', g.quantidadeVendas], ['Ticket médio', num(g.ticketMedio)], ['Itens vendidos', g.itensVendidos],
    ['Descontos concedidos', num(g.descontos)], ['Trocas', g.trocas], ['Devoluções', g.devolucoes], ['Canceladas', g.canceladas],
    ['Diferença dos caixas', num(f.diferencaCaixas)],
    [],
    ['Por forma de pagamento', 'Valor (R$)', 'Pagamentos'],
    ...g.porForma.map((x) => [x.nome, num(x.valor), x.quantidade]),
    [],
    ['Por dia', 'Faturamento (R$)', 'Vendas', 'Ticket médio (R$)', 'Despesas (R$)'],
    ...f.porDia.map((d) => [dataBR(d.chave), num(d.faturamento), d.vendas, num(d.ticketMedio), num(d.despesas)]),
    [],
    ['Por aparelho', 'Faturamento (R$)', 'Vendas', 'Ticket médio (R$)'],
    ...f.porAparelho.map((a) => [`${a.nome} (${a.chave})`, num(a.faturamento), a.vendas, num(a.ticketMedio)]),
    [],
    ['Retiradas por categoria', 'Valor (R$)', 'Lançamentos', 'É despesa?'],
    ...f.categorias.map((c) => [c.nome, num(c.valor), c.quantidade, c.despesa ? 'Sim' : 'Não']),
    [],
    ['Caixas', 'Aparelho', 'Esperado (R$)', 'Contado (R$)', 'Diferença (R$)'],
    ...f.caixas.map((c) => [dataBR(c.data), c.aparelho?.sigla || '', num(c.esperado), num(c.contado), c.aberto ? 'aberto' : num(c.diferenca)]),
    [],
    ['Estoque', 'Levado', 'Vendido', 'Brindes', 'Avarias', 'Voltaram', 'Sobra'],
    ...f.estoque.linhas.map((l) => [`${l.produto}${l.variacao ? ` ${l.variacao}` : ''}`, l.levado, l.vendido, l.brindes, l.avarias, l.voltaram, l.sobra])
  ];
  return arquivoCSV(`fechamento-${slug(evento.nome)}.csv`, L);
}
