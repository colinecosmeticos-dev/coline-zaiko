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
export async function listarCategorias() {
  const lista = await db.categorias.toArray();
  return lista.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
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
