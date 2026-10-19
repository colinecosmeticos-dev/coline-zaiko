// =========================================================
// Como os produtos de uma categoria aparecem na tela de venda.
//
// Cada variação é um item (um botão). A linha do item é a da variação
// (produto que varia por linha: Shampoo → Umeboshi, Ice Melon...) ou,
// em cadastros antigos, a do produto (variacao.linhaEfetiva).
//
// Itens COM linha formam uma tabela linha × subcategoria, mostrada de
// dois jeitos (opção "Ver por" da tela de venda):
//   'linha'        → um grupo por linha; cada subcategoria numa coluna fixa
//                    (shampoo sempre na 1ª, condicionador na 2ª...).
//   'subcategoria' → um grupo por subcategoria; cada linha numa coluna fixa
//                    (Umeboshi sempre na 1ª, Ice Melon na 2ª...).
// Lugar sem item fica vazio, para as colunas não se misturarem.
// Itens SEM linha → um grupo por subcategoria, botões lado a lado.
// (No banco, a subcategoria é a tabela "tipos" e o campo tipoId.)
// =========================================================

export const SEM_CATEGORIA = '__sem';
const SEM_TIPO = '';

const porNome = (a, b) => a.p.nome.localeCompare(b.p.nome, 'pt-BR');
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

// Monta as fileiras de uma tabela: cada coluna com seus itens; uma coluna com
// mais de um item (ex.: produto antigo com tamanhos) ocupa fileiras seguidas.
function fileirasDe(porColuna) {
  const qtd = Math.max(...porColuna.map((c) => c.length));
  const fileiras = [];
  for (let k = 0; k < qtd; k++) fileiras.push(porColuna.map((c) => c[k] || null));
  return fileiras;
}

// produtos: só os da categoria (já com variações); tipos e linhas: listas em ordem
export function montarGrupos(produtos, tipos, linhas, ver = 'linha') {
  const ordemTipo = new Map(tipos.map((t, i) => [t.id, i]));
  const nomeTipo = new Map(tipos.map((t) => [t.id, t.nome]));
  const ordemLinha = new Map(linhas.map((l, i) => [l.id, i]));
  const linhaPorId = new Map(linhas.map((l) => [l.id, l]));
  const tipoDe = (p) => (ordemTipo.has(p.tipoId) ? p.tipoId : SEM_TIPO);
  const posTipo = (id) => (id === SEM_TIPO ? Infinity : ordemTipo.get(id));

  // Todos os itens vendáveis (uma variação = um item)
  const itens = [];
  for (const p of produtos) {
    for (const v of [...p.variacoes].sort(porOrdem)) {
      const linhaId = ordemLinha.has(v.linhaEfetiva) ? v.linhaEfetiva : null;
      // linhaPropria: a variação É a linha (produto que varia por linha)
      itens.push({ p, v, tipoId: tipoDe(p), linhaId, linhaPropria: !!(v.linhaId && linhaId) });
    }
  }
  const comLinha = itens.filter((it) => it.linhaId);
  const semLinha = itens.filter((it) => !it.linhaId);
  const grupos = [];

  if (ver === 'subcategoria') {
    // ----- Um grupo por subcategoria; colunas fixas por linha -----
    const colunas = [...new Set(comLinha.map((it) => it.linhaId))].sort((a, b) => ordemLinha.get(a) - ordemLinha.get(b));
    for (const tipoId of [...new Set(comLinha.map((it) => it.tipoId))]) {
      const doTipo = comLinha.filter((it) => it.tipoId === tipoId).sort(porNome);
      const porColuna = colunas.map((linhaId) => doTipo.filter((it) => it.linhaId === linhaId).map((it) => {
        const l = linhaPorId.get(linhaId);
        // Botão: nome da linha; embaixo, a descrição dela (ou a variação, em cadastro antigo)
        return { ...it, nome: l.nome, sub: it.linhaPropria ? (l.descricao || '') : (it.v.nome || '') };
      }));
      grupos.push({ titulo: tipoId === SEM_TIPO ? 'Outros' : nomeTipo.get(tipoId), colunas: colunas.length, fileiras: fileirasDe(porColuna), chave: [posTipo(tipoId), 0, 0] });
    }
  } else {
    // ----- Um grupo por linha; colunas fixas por subcategoria -----
    const colunas = [...new Set(comLinha.map((it) => it.tipoId))].sort((a, b) => posTipo(a) - posTipo(b));
    for (const linha of linhas) {
      const daLinha = comLinha.filter((it) => it.linhaId === linha.id).sort(porNome);
      if (!daLinha.length) continue;
      const porColuna = colunas.map((tipoId) => daLinha.filter((it) => it.tipoId === tipoId).map((it) => ({
        ...it,
        // Botão: o produto (sem o nome da linha); embaixo, a variação se não for a própria linha
        nome: nomeCurto(it.p, linha.nome),
        sub: it.linhaPropria ? '' : (it.v.nome || '')
      })));
      const primeiro = Math.min(...colunas.filter((_, i) => porColuna[i].length).map(posTipo));
      grupos.push({ titulo: linha.nome, descricao: linha.descricao || '', colunas: colunas.length, fileiras: fileirasDe(porColuna), chave: [primeiro, 0, ordemLinha.get(linha.id)] });
    }
  }

  // ----- Itens sem linha: um grupo por subcategoria -----
  for (const tipoId of [...new Set(semLinha.map((it) => it.tipoId))]) {
    const doTipo = semLinha.filter((it) => it.tipoId === tipoId).sort(porNome);
    const varios = new Set(doTipo.map((it) => it.p.id)).size > 1;
    const lista = doTipo.map((it) => (it.v.nome
      ? { ...it, nome: it.v.nome, sub: varios ? it.p.nome : '' }
      : { ...it, nome: it.p.nome, sub: '' }));
    grupos.push({ titulo: tipoId === SEM_TIPO ? 'Outros' : nomeTipo.get(tipoId), itens: lista, chave: [posTipo(tipoId), 1, 0] });
  }

  grupos.sort((a, b) => a.chave[0] - b.chave[0] || a.chave[1] - b.chave[1] || a.chave[2] - b.chave[2]);
  return grupos;
}

// Há itens com linha? (a opção "Ver por" só faz diferença quando há)
export const temLinhas = (produtos, linhas) => {
  const ids = new Set(linhas.map((l) => l.id));
  return produtos.some((p) => p.variacoes.some((v) => ids.has(v.linhaEfetiva)));
};
