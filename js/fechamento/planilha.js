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
const dinheiroTexto = (c) => `R$ ${((c || 0) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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
  const periodo = `${dataBR(evento.dataInicio)}${evento.dataFim && evento.dataFim !== evento.dataInicio ? ` a ${dataBR(evento.dataFim)}` : ''}`;

  // ---------- Aba Resumo em formato de painel (v0.33.0) ----------
  // Colunas: A rótulo · B valor · C % · D barra | E espaço | F rótulo · G valor · H % · I barra
  const fat = g.faturamento || 0;
  const pctDe = (v, base = fat) => (base ? { v: v / base, estilo: 'pct' } : null);
  const barra = (v, max) => (max > 0 && v > 0 ? { v: '█'.repeat(Math.max(1, Math.round((v / max) * 12))), estilo: 'barra' } : null);
  const RS = (c, estilo = 'rs') => (c == null ? null : { v: Math.round(c) / 100, estilo });
  const I = (n, estilo = 'inteiro') => (n == null ? null : { v: n, estilo });
  const diaSemana = (iso) => { const d = new Date(iso + 'T12:00'); return `${dataBR(iso).slice(0, 5)} ${d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')}`; };
  const aparelhosTxt = f.porAparelho.map((a) => a.chave).join(', ');

  // Blocos de tabela: título, cabeçalho de 4 colunas, linhas e total opcional
  const blocoTabela = (titulo, cab, linhas, total) => ({ titulo, cab, linhas: linhas.length ? linhas : [[{ v: 'Nada registrado.', estilo: 'sub' }]], total });
  const top = (lista, n) => lista.slice(0, n);
  const somaQtd = (lista) => lista.reduce((s, x) => s + x.quantidade, 0);
  const blocoClasse = (titulo, campo) => {
    const lista = somarPor(registros, classe, campo);
    const max = Math.max(0, ...lista.map((x) => x.valor));
    const tot = lista.reduce((s, x) => s + x.valor, 0);
    return blocoTabela(titulo, ['', 'Valor', '%', `Itens (${somaQtd(lista)})`],
      lista.map((x) => [`${x.nome} · ${x.quantidade} un.`, RS(x.valor), pctDe(x.valor, tot), barra(x.valor, max)]));
  };

  const cascata = blocoTabela('Resultado do evento', ['', 'R$', '% fat.', ''], [
    ['Faturamento', RS(g.faturamento), pctDe(g.faturamento), null],
    ['(−) Taxas da maquininha', RS(-g.taxas), pctDe(g.taxas), null],
    [{ v: '= Faturamento líquido', estilo: 'negrito' }, RS(f.faturamentoLiquido, 'rsNegrito'), pctDe(f.faturamentoLiquido), null],
    ['(−) Custo dos produtos', RS(-g.custo), pctDe(g.custo), null],
    ['(−) Despesas do caixa', RS(-f.despesas), pctDe(f.despesas), null],
    [{ v: '= Resultado do evento', estilo: 'negrito' }, RS(f.resultado, 'rsNegrito'), pctDe(f.resultado), null],
    ['(−) Brindes (custo)', RS(-f.perdaBrindes), pctDe(f.perdaBrindes), null],
    ['(−) Avarias (custo)', RS(-f.perdaAvarias), pctDe(f.perdaAvarias), null]
  ], [{ v: '= Depois das perdas', estilo: 'total' }, RS(f.resultadoDepoisPerdas, 'totalMoeda'), pctDe(f.resultadoDepoisPerdas), null]);

  const maxForma = Math.max(0, ...g.porForma.map((x) => x.valor));
  const totFormas = g.porForma.reduce((s, x) => s + x.valor, 0);
  const formas = blocoTabela('Formas de pagamento', ['', 'Recebido', '%', 'Pagamentos'], [
    ...g.porForma.map((x) => [`${x.nome} · ${x.quantidade}`, RS(x.valor), pctDe(x.valor, totFormas), barra(x.valor, maxForma)]),
    ...(g.devolvido ? [['Devolvido ao cliente', RS(-g.devolvido), null, null]] : [])
  ], [{ v: 'Total', estilo: 'total' }, RS(totFormas - (g.devolvido || 0), 'totalMoeda'), null, null]);

  const dias = blocoTabela('Por dia', ['', 'Faturamento', 'Vendas', 'Ticket médio'],
    f.porDia.map((d) => [diaSemana(d.chave), RS(d.faturamento), I(d.vendas), RS(d.ticketMedio)]),
    [{ v: 'Total', estilo: 'total' }, RS(g.faturamento, 'totalMoeda'), I(g.quantidadeVendas, 'totalInteiro'), RS(g.ticketMedio, 'totalMoeda')]);

  const maisVendidos = top(g.maisVendidos || [], 10);
  const maxMv = Math.max(0, ...maisVendidos.map((x) => x.quantidade));
  const vendidos = blocoTabela('Mais vendidos', ['', 'Valor', 'Qtd.', ''],
    maisVendidos.map((x) => [`${x.nome}${x.variacao ? ` ${x.variacao}` : ''}`, RS(x.valor), I(x.quantidade), barra(x.quantidade, maxMv)]));

  const aparelhos = blocoTabela('Por aparelho', ['', 'Faturamento', 'Vendas', 'Ticket médio'],
    f.porAparelho.map((a) => [`${a.nome} (${a.chave})`, RS(a.faturamento), I(a.vendas), RS(a.ticketMedio)]));
  const caixasBloco = blocoTabela('Caixas (dinheiro)', ['', 'Esperado', '', 'Diferença'],
    f.caixas.map((c) => [`${diaSemana(c.data)} · ${c.aparelho?.sigla || ''}${c.aberto ? ' (aberto)' : ''}`, RS(c.esperado), null, c.aberto ? null : RS(c.diferenca)]),
    [{ v: 'Diferença total', estilo: 'total' }, null, null, RS(f.diferencaCaixas, 'totalMoeda')]);
  const retiradas = blocoTabela('Retiradas por categoria', ['', 'R$', 'Qtd.', 'É despesa?'],
    f.categorias.map((c) => [c.nome, RS(c.valor), I(c.quantidade), c.despesa ? 'Sim' : 'Não']));
  const outros = blocoTabela('Outros números', ['', '', '', ''], [
    ['Descontos concedidos', RS(g.descontos), null, null],
    ['Trocas · devoluções · canceladas', `${g.trocas} · ${g.devolucoes} · ${g.canceladas}`, null, null],
    ['Brindes (peças)', I(g.brindesQtd), null, null],
    ...(f.estoque.contagem.itensContados ? [['Peças faltando na contagem', I(f.estoque.contagem.pecasFaltando), null, null], ['Valor das faltas (custo)', RS(f.estoque.contagem.valorFaltando), null, null]] : []),
    ...(g.itensSemCusto ? [[{ v: `${g.itensSemCusto} itens vendidos sem custo: o lucro aparece maior`, estilo: 'sub' }, null, null, null]] : [])
  ]);

  // Monta a grade
  const resumo = [], mesclar = [], alturas = {};
  const linha = () => { const l = []; resumo.push(l); return l; };
  const num = () => resumo.length;   // número (1-based) da última linha
  // Faixa do título e subtítulo
  linha()[0] = { v: `Fechamento · ${evento.nome}`, estilo: 'faixa' }; mesclar.push(`A${num()}:I${num()}`); alturas[num()] = 34;
  linha()[0] = { v: `${periodo}${evento.local ? ` · ${evento.local}` : ''}${aparelhosTxt ? ` · aparelhos: ${aparelhosTxt}` : ''} · gerado em ${new Date().toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`, estilo: 'subtitulo' };
  mesclar.push(`A${num()}:I${num()}`); alturas[num()] = 20;
  linha(); alturas[num()] = 8;
  // Cartões (4 por fileira): rótulo / número grande / detalhe
  const COLS = [[0, 'A', 'B'], [2, 'C', 'D'], [5, 'F', 'G'], [7, 'H', 'I']];
  const cartoes = (lista) => {
    const [r1, r2, r3] = [linha(), linha(), linha()];
    const n = num();
    lista.forEach(([rotulo, valor, detalhe], k) => {
      const [c, a, b] = COLS[k];
      r1[c] = { v: rotulo, estilo: 'kpiRotulo' }; r1[c + 1] = { v: '', estilo: 'kpiRotulo' };
      r2[c] = valor; r2[c + 1] = { v: '', estilo: 'kpiMoeda' };
      r3[c] = detalhe ?? { v: '', estilo: 'kpiDetalhe' }; r3[c + 1] = { v: '', estilo: 'kpiDetalhe' };
      mesclar.push(`${a}${n - 2}:${b}${n - 2}`, `${a}${n - 1}:${b}${n - 1}`, `${a}${n}:${b}${n}`);
    });
    alturas[n - 2] = 18; alturas[n - 1] = 28; alturas[n] = 18;
    linha(); alturas[num()] = 8;
  };
  const kM = (c) => ({ v: Math.round(c || 0) / 100, estilo: 'kpiMoeda' });
  const kI = (n) => ({ v: n || 0, estilo: 'kpiInteiro' });
  const kD = (t) => ({ v: t, estilo: 'kpiDetalhe' });
  const kP = (v) => (fat ? { v: v / fat, estilo: 'kpiPct' } : kD(''));
  cartoes([
    ['FATURAMENTO', kM(g.faturamento), kD(`líquido ${dinheiroTexto(f.faturamentoLiquido)}`)],
    ['RESULTADO DO EVENTO', kM(f.resultado), kP(f.resultado)],
    ['VENDAS', kI(g.quantidadeVendas), kD(`${g.itensVendidos} itens vendidos`)],
    ['TICKET MÉDIO', kM(g.ticketMedio), kD(f.porDia.length ? `${f.porDia.length} ${f.porDia.length === 1 ? 'dia' : 'dias'} de venda` : '')]
  ]);
  cartoes([
    ['LUCRO BRUTO', kM(g.lucroBruto), kD('faturamento − custo')],
    ['TAXAS DA MAQUININHA', kM(g.taxas), kD(g.pagamentosSemTaxa ? `${g.pagamentosSemTaxa} pagamentos sem taxa` : 'estimadas')],
    ['CUSTO DOS PRODUTOS', kM(g.custo), kD(g.itensSemCusto ? `${g.itensSemCusto} itens sem custo` : 'todos com custo')],
    ['DESPESAS DO CAIXA', kM(f.despesas), kD(f.naoDespesas ? `sangrias à parte: ${dinheiroTexto(f.naoDespesas)}` : '')]
  ]);
  // Blocos lado a lado
  const lado = (esq, dir) => {
    const montar = (b) => !b ? [] : [
      { secao: b.titulo },
      { cab: b.cab },
      ...b.linhas.map((l) => ({ dados: l })),
      ...(b.total ? [{ dados: b.total }] : [])
    ];
    const E = montar(esq), D = montar(dir);
    for (let k = 0; k < Math.max(E.length, D.length); k++) {
      const l = linha(), n = num();
      [[E[k], 0, 'A', 'D'], [D[k], 5, 'F', 'I']].forEach(([x, c, a, b]) => {
        if (!x) return;
        if (x.secao) { l[c] = { v: x.secao, estilo: 'secao' }; for (let j = 1; j < 4; j++) l[c + j] = { v: '', estilo: 'secao' }; mesclar.push(`${a}${n}:${b}${n}`); alturas[n] = 22; }
        else if (x.cab) x.cab.forEach((t, j) => { l[c + j] = { v: t, estilo: j ? 'cabecalhoDir' : 'cabecalho' }; });
        else x.dados.forEach((v, j) => { l[c + j] = v; });
      });
    }
    linha(); alturas[num()] = 12;
  };
  lado(cascata, formas);
  lado(dias, vendidos);
  lado(blocoClasse('Por categoria', 'categoria'), blocoClasse('Por linha', 'linha'));
  lado(blocoClasse('Por subcategoria', 'tipo'), aparelhos);
  lado(caixasBloco, retiradas);
  lado(outros, null);
  const nota = linha(); nota[0] = { v: 'Valores dos itens: preço com o desconto do item, antes do desconto na venda inteira. Detalhes nas abas Itens, Estoque e Caixas.', estilo: 'sub' };
  mesclar.push(`A${num()}:I${num()}`);

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
    { nome: 'Resumo', larguras: [30, 14, 9, 22, 3, 30, 14, 9, 22], linhas: resumo, mesclar, alturas, semGrade: true, paisagem: true },
    { nome: 'Itens', larguras: [11, 7, 12, 11, 11, 9, 30, 16, 14, 14, 14, 6, 11, 10, 11, 7, 11, 16, 28, 13, 10], linhas: itens, congelarLinha1: true },
    { nome: 'Estoque', larguras: [30, 16, 9, 9, 9, 9, 9, 15, 9, 10, 11, 14], linhas: estoque, congelarLinha1: true },
    { nome: 'Caixas', larguras: [12, 18, 10, 13, 13, 13], linhas: caixas, congelarLinha1: true }
  ]);
  return new File([blob], `${nomePlanilha(evento)}.xlsx`, { type: blob.type });
}
