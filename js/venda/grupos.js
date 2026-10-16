// =========================================================
// Como os produtos de uma categoria aparecem na tela de venda.
//
//   Produtos COM linha → um grupo por linha. Cada tipo tem uma coluna
//   fixa, igual em todas as linhas da categoria (shampoo sempre na 1ª,
//   condicionador na 2ª...). Linha sem algum tipo deixa o lugar vazio.
//   Produtos SEM linha → um grupo por tipo, botões lado a lado.
//
// Cada variação é um item (um botão). Ordem dos grupos: pela ordem do
// primeiro tipo que aparece no grupo; linhas empatadas seguem a ordem
// das linhas.
// =========================================================

export const SEM_CATEGORIA = '__sem';
const SEM_TIPO = '';

const porNome = (a, b) => a.nome.localeCompare(b.nome, 'pt-BR');
const porOrdem = (a, b) => a.ordem - b.ordem;

// "Shampoo Umeboshi" na linha Umeboshi → "Shampoo"
export function nomeCurto(p, nomeLinha) {
  let n = p.nome;
  if (nomeLinha) {
    const escapado = nomeLinha.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    n = n.replace(new RegExp(escapado, 'gi'), ' ');
  }
  n = n.replace(/\s+/g, ' ').replace(/^[\s\-–·|,]+|[\s\-–·|,]+$/g, '').trim();
  return n || p.tipo || p.nome;
}

// produtos: só os da categoria (já com variações); tipos e linhas: listas em ordem
export function montarGrupos(produtos, tipos, linhas) {
  const ordemTipo = new Map(tipos.map((t, i) => [t.id, i]));
  const nomeTipo = new Map(tipos.map((t) => [t.id, t.nome]));
  const ordemLinha = new Map(linhas.map((l, i) => [l.id, i]));
  const tipoDe = (p) => (ordemTipo.has(p.tipoId) ? p.tipoId : SEM_TIPO);
  const posTipo = (id) => (id === SEM_TIPO ? Infinity : ordemTipo.get(id));

  const comLinha = produtos.filter((p) => ordemLinha.has(p.linhaId));
  const semLinha = produtos.filter((p) => !ordemLinha.has(p.linhaId));
  const grupos = [];

  // ----- Grupos por linha, com colunas fixas por tipo -----
  const colunas = [...new Set(comLinha.map(tipoDe))].sort((a, b) => posTipo(a) - posTipo(b));
  for (const linha of linhas) {
    const daLinha = comLinha.filter((p) => p.linhaId === linha.id).sort(porNome);
    if (!daLinha.length) continue;
    // Itens de cada coluna (um produto pode ter várias variações: ocupam fileiras seguidas)
    const porColuna = colunas.map((tipoId) => {
      const itens = [];
      for (const p of daLinha.filter((x) => tipoDe(x) === tipoId)) {
        const base = nomeCurto(p, linha.nome);
        for (const v of [...p.variacoes].sort(porOrdem)) itens.push({ p, v, nome: base, sub: v.nome || '' });
      }
      return itens;
    });
    const qtdFileiras = Math.max(...porColuna.map((c) => c.length));
    const fileiras = [];
    for (let k = 0; k < qtdFileiras; k++) fileiras.push(porColuna.map((c) => c[k] || null));
    const primeiro = Math.min(...colunas.filter((_, i) => porColuna[i].length).map(posTipo));
    grupos.push({ titulo: linha.nome, colunas: colunas.length, fileiras, chave: [primeiro, 0, ordemLinha.get(linha.id)] });
  }

  // ----- Grupos por tipo (produtos sem linha) -----
  const tiposSemLinha = [...new Set(semLinha.map(tipoDe))];
  for (const tipoId of tiposSemLinha) {
    const doTipo = semLinha.filter((p) => tipoDe(p) === tipoId).sort(porNome);
    const varios = doTipo.length > 1;
    const itens = [];
    for (const p of doTipo) {
      for (const v of [...p.variacoes].sort(porOrdem)) {
        itens.push(v.nome ? { p, v, nome: v.nome, sub: varios ? p.nome : '' } : { p, v, nome: p.nome, sub: '' });
      }
    }
    grupos.push({ titulo: tipoId === SEM_TIPO ? 'Outros' : nomeTipo.get(tipoId), itens, chave: [posTipo(tipoId), 1, 0] });
  }

  grupos.sort((a, b) => a.chave[0] - b.chave[0] || a.chave[1] - b.chave[1] || a.chave[2] - b.chave[2]);
  return grupos;
}
