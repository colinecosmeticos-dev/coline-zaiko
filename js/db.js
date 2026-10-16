// =========================================================
// Banco de dados local (IndexedDB), usando a biblioteca Dexie.
// Cada "tabela" abaixo é uma gaveta onde o app guarda registros.
// Os dados ficam SÓ neste aparelho/navegador.
// =========================================================
import Dexie from './lib/dexie.min.mjs';

export const db = new Dexie('coline-zaiko');

// Versão 1 do banco. A string de cada tabela lista os campos usados para
// buscar (índices). O primeiro é a chave; "&" quer dizer "não pode repetir".
// Se um dia mudarmos esta estrutura, criamos db.version(2) — nunca editamos a 1.
db.version(1).stores({
  categorias: 'id, nome',
  produtos: 'id, nome, categoriaId',
  variacoes: 'id, produtoId, &codigo',
  config: 'chave'
});

// Versão 2: eventos e categorias de retirada do caixa
db.version(2).stores({
  eventos: 'id, status, dataInicio',
  categoriasRetirada: 'id, ordem'
});

// Versão 3: formas de pagamento (com as taxas dentro de cada forma)
db.version(3).stores({
  formasPagamento: 'id, ordem'
});

// Versão 4: caixas do dia e vendas
db.version(4).stores({
  caixas: 'id, eventoId, data, status',
  vendas: 'id, eventoId, caixaId, numero, criadoEm'
});

// Versão 5: movimentos do caixa (reforços e retiradas)
db.version(5).stores({
  movimentos: 'id, caixaId, eventoId, criadoEm'
});

// Gera um identificador único (ex.: "3f2b9c1e-..."). Usamos isso em vez de
// 1, 2, 3... porque os dois aparelhos vão trocar dados entre si e os números
// iguais se misturariam.
export function novoId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

// Configurações simples do aparelho (chave → valor)
export async function lerConfig(chave, padrao = null) {
  const r = await db.config.get(chave);
  return r ? r.valor : padrao;
}
export async function gravarConfig(chave, valor) {
  await db.config.put({ chave, valor });
}

// Pede ao navegador para não apagar os dados sozinho quando faltar espaço.
// O Chrome decide sozinho se aceita (aceita com mais facilidade quando o app
// está instalado). Devolve true se os dados estão protegidos.
export async function pedirArmazenamentoPersistente() {
  if (!navigator.storage || !navigator.storage.persist) return false;
  if (await navigator.storage.persisted()) return true;
  return navigator.storage.persist();
}

// ---------- Consultas usadas pelas telas ----------

// Todas as categorias, em ordem alfabética
// Categorias na ordem escolhida pelo usuário (as sem ordem vão para o fim, em ordem alfabética)
export async function listarCategorias() {
  const lista = await db.categorias.toArray();
  return lista.sort((a, b) => (a.ordem ?? 9999) - (b.ordem ?? 9999) || a.nome.localeCompare(b.nome, 'pt-BR'));
}

// Produtos com suas variações e o nome da categoria, prontos para exibir
export async function listarProdutosCompletos() {
  const [produtos, variacoes, categorias] = await Promise.all([
    db.produtos.toArray(),
    db.variacoes.toArray(),
    db.categorias.toArray()
  ]);
  const nomeCategoria = new Map(categorias.map((c) => [c.id, c.nome]));
  const porProduto = new Map();
  for (const v of variacoes) {
    if (!porProduto.has(v.produtoId)) porProduto.set(v.produtoId, []);
    porProduto.get(v.produtoId).push(v);
  }
  return produtos
    .map((p) => ({
      ...p,
      categoria: nomeCategoria.get(p.categoriaId) || '',
      variacoes: (porProduto.get(p.id) || []).sort((a, b) => a.ordem - b.ordem)
    }))
    .sort((a, b) => (b.ativo - a.ativo) || a.nome.localeCompare(b.nome, 'pt-BR'));
}

// Encontra a variação dona de um código de barras (ou undefined)
export function buscarPorCodigo(codigo) {
  return db.variacoes.where('codigo').equals(codigo).first();
}

// ---------- Este aparelho ----------
// { id, nome: 'Vaio TL10', sigla: 'VAIO' } — a sigla aparece no número das vendas
export async function lerAparelho() {
  return lerConfig('aparelho', null);
}
export async function gravarAparelho({ nome, sigla }) {
  const atual = await lerAparelho();
  await gravarConfig('aparelho', { id: (atual && atual.id) || novoId(), nome, sigla });
}

// ---------- Taxas da maquininha ----------
// Guardadas em centésimos de por cento: 3,57% = 357. null = não informada.
export const FORMAS_TAXA = [
  ['debito', 'Débito'],
  ['credito1', 'Crédito à vista'],
  ['credito2', 'Crédito em 2x'],
  ['credito3', 'Crédito em 3x'],
  ['credito4', 'Crédito em 4x'],
  ['credito5', 'Crédito em 5x'],
  ['pixQr', 'Pix QR Code (maquininha)'],
  ['pixChave', 'Pix na chave (CNPJ)']
];
export async function lerTaxas() {
  return lerConfig('taxas', {});
}
export async function gravarTaxas(taxas) {
  await gravarConfig('taxas', { ...taxas, atualizadoEm: new Date().toISOString() });
}

// ---------- Categorias de retirada ----------
// "despesa: false" = não é gasto (ex.: Sangria, dinheiro guardado em local seguro)
const CATEGORIAS_PADRAO = [
  ['Sangria', false], ['Alimentação', true], ['Transporte/Estacionamento', true],
  ['Ajudante', true], ['Material', true], ['Outros', true]
];
export async function garantirCategoriasPadrao() {
  if (await lerConfig('categoriasRetiradaCriadas')) return;
  await db.categoriasRetirada.bulkAdd(CATEGORIAS_PADRAO.map(([nome, despesa], ordem) => ({ id: novoId(), nome, despesa, ativo: true, ordem })));
  await gravarConfig('categoriasRetiradaCriadas', true);
}
export async function listarCategoriasRetirada() {
  return (await db.categoriasRetirada.toArray()).sort((a, b) => a.ordem - b.ordem);
}

// ---------- Eventos ----------
// O evento ativo é escolhido por aparelho: é nele que as vendas deste aparelho entram.
export async function lerEventoAtivo() {
  const id = await lerConfig('eventoAtivoId');
  return id ? (await db.eventos.get(id)) || null : null;
}
export async function definirEventoAtivo(id) {
  await gravarConfig('eventoAtivoId', id || null);
}
// Código curto para conferir que os dois aparelhos usam o mesmo evento (ex.: EV-7K3F9Q)
export function novoCodigoEvento() {
  const letras = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const n = crypto.getRandomValues(new Uint8Array(6));
  return 'EV-' + [...n].map((x) => letras[x % letras.length]).join('');
}

// ---------- Formas de pagamento ----------
// tipo: 'dinheiro' (calcula troco), 'pixQr', 'pixChave', 'debito',
//       'credito' (parcelas 1 a 5, uma taxa por parcela) ou 'outra' (criada pelo usuário).
// Taxas em centésimos de por cento (3,57% = 357); null = não informada.
export const PARCELAS_MAX = 5;

export async function garantirFormasPadrao() {
  if (await lerConfig('formasPagamentoCriadas')) return;
  const t = await lerTaxas(); // aproveita as taxas digitadas na versão anterior
  const padrao = [
    { nome: 'Dinheiro', tipo: 'dinheiro', taxa: 0 },
    { nome: 'Pix QR Code', tipo: 'pixQr', taxa: t.pixQr ?? null },
    { nome: 'Pix na chave (CNPJ)', tipo: 'pixChave', taxa: t.pixChave ?? null },
    { nome: 'Débito', tipo: 'debito', taxa: t.debito ?? null },
    { nome: 'Crédito', tipo: 'credito', taxasCredito: { 1: t.credito1 ?? null, 2: t.credito2 ?? null, 3: t.credito3 ?? null, 4: t.credito4 ?? null, 5: t.credito5 ?? null } }
  ];
  await db.formasPagamento.bulkAdd(padrao.map((f, ordem) => ({ id: novoId(), ativo: true, sistema: true, ordem, ...f })));
  await gravarConfig('formasPagamentoCriadas', true);
}
export async function listarFormasPagamento() {
  return (await db.formasPagamento.toArray()).sort((a, b) => a.ordem - b.ordem);
}

// ---------- Caixa do dia ----------
// Um caixa por aparelho e por dia do evento. Abre com o troco inicial.
// Só os caixas DESTE aparelho (no principal, também haverá caixas importados dos outros)
async function caixasDesteAparelho(eventoId) {
  const aparelho = await lerAparelho();
  return (await db.caixas.where('eventoId').equals(eventoId).toArray())
    .filter((c) => !aparelho || !c.aparelho || c.aparelho.id === aparelho.id);
}
export async function caixaAbertoDoEvento(eventoId) {
  const abertos = (await caixasDesteAparelho(eventoId)).filter((c) => c.status === 'aberto');
  return abertos.sort((a, b) => b.abertoEm.localeCompare(a.abertoEm))[0] || null;
}
// Caixa de um dia (aberto ou fechado), deste aparelho
export async function caixaDoDia(eventoId, data) {
  return (await caixasDesteAparelho(eventoId)).find((c) => c.data === data) || null;
}
export async function listarCaixasDoEvento(eventoId) {
  return (await caixasDesteAparelho(eventoId)).sort((a, b) => b.data.localeCompare(a.data));
}
export async function abrirCaixa({ eventoId, data, trocoInicial }) {
  const aparelho = await lerAparelho();
  const caixa = {
    id: novoId(), eventoId, data, trocoInicial,
    aparelho: aparelho ? { id: aparelho.id, sigla: aparelho.sigla, nome: aparelho.nome } : null,
    status: 'aberto', abertoEm: new Date().toISOString(),
    fechamentos: [], reaberturas: []
  };
  await db.caixas.add(caixa);
  return caixa;
}

// Fecha o caixa guardando a "foto" do fechamento (valores daquele momento).
// Se depois houver cancelamentos, o app mostra o original e o ajustado.
export async function fecharCaixa(caixaId, fechamento) {
  const aparelho = await lerAparelho();
  const caixa = await db.caixas.get(caixaId);
  caixa.status = 'fechado';
  caixa.fechamentos = [...(caixa.fechamentos || []), {
    ...fechamento, em: new Date().toISOString(),
    aparelho: aparelho ? { id: aparelho.id, sigla: aparelho.sigla, nome: aparelho.nome } : null
  }];
  await db.caixas.put(caixa);
  return caixa;
}
// Reabre o caixa do dia (fica registrado quando foi reaberto)
export async function reabrirCaixa(caixaId) {
  const caixa = await db.caixas.get(caixaId);
  caixa.status = 'aberto';
  caixa.reaberturas = [...(caixa.reaberturas || []), { em: new Date().toISOString() }];
  await db.caixas.put(caixa);
  return caixa;
}

// ---------- Reforços e retiradas ----------
// tipo: 'reforco' (entra dinheiro) | 'retirada' (sai dinheiro, com categoria)
export async function adicionarMovimento(caixa, dados) {
  const aparelho = await lerAparelho();
  const mov = {
    id: novoId(), caixaId: caixa.id, eventoId: caixa.eventoId,
    criadoEm: new Date().toISOString(), status: 'ativo',
    aparelho: aparelho ? { id: aparelho.id, sigla: aparelho.sigla, nome: aparelho.nome } : null,
    ...dados
  };
  await db.movimentos.add(mov);
  return mov;
}
export async function cancelarMovimento(id) {
  const mov = await db.movimentos.get(id);
  mov.status = 'cancelado';
  mov.canceladoEm = new Date().toISOString();
  await db.movimentos.put(mov);
}

// ---------- Número da venda ----------
// Sequência própria de cada aparelho: VAIO-0001, VAIO-0002...
export async function proximoNumeroVenda(consumir = false) {
  const aparelho = await lerAparelho();
  const seq = (await lerConfig('seqVenda', 0)) + 1;
  if (consumir) await gravarConfig('seqVenda', seq);
  return { seq, numero: `${aparelho ? aparelho.sigla : 'APP'}-${String(seq).padStart(4, '0')}` };
}

// ---------- Cancelamento de venda ----------
// A venda continua guardada, marcada como cancelada, com motivo, data e aparelho.
// Se o caixa da venda já estiver fechado, o cancelamento entra como ajuste daquele dia.
export async function cancelarVenda(vendaId, { motivo, observacao }) {
  const aparelho = await lerAparelho();
  return db.transaction('rw', db.vendas, db.caixas, async () => {
    const venda = await db.vendas.get(vendaId);
    if (!venda || venda.status === 'cancelada') return venda;
    const caixaDaVenda = venda.caixaId ? await db.caixas.get(venda.caixaId) : null;
    const caixaAtual = await caixaAbertoDoEvento(venda.eventoId);
    venda.status = 'cancelada';
    venda.cancelamento = {
      motivo, observacao: observacao || '',
      em: new Date().toISOString(),
      aparelho: aparelho ? { id: aparelho.id, sigla: aparelho.sigla, nome: aparelho.nome } : null,
      caixaId: caixaAtual ? caixaAtual.id : null,
      aposFechamento: !!(caixaDaVenda && caixaDaVenda.status === 'fechado')
    };
    await db.vendas.put(venda);
    return venda;
  });
}
