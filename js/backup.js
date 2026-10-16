// =========================================================
// Backup completo do aparelho: uma cópia de TODAS as tabelas do banco
// (catálogo com fotos, eventos, vendas, caixas, estoque, formas de
// pagamento e configurações, inclusive o nome/sigla do aparelho).
//
// Restaurar SUBSTITUI tudo o que está no aparelho pelo conteúdo do
// backup — é para recuperar um aparelho (ou passar tudo para um novo).
// O arquivo é texto (JSON) com final .txt, como o pacote.
// =========================================================
import { db, lerAparelho, gravarConfig, lerConfig } from './db.js';

const TIPO = 'coline-zaiko-backup';
const VERSAO = 1;

// Fotos (Blob) viram texto para caber no arquivo, e voltam a ser Blob ao restaurar
const blobParaTexto = (blob) => new Promise((ok, falha) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = falha; r.readAsDataURL(blob); });
async function serializar(registro) {
  const saida = {};
  for (const [k, v] of Object.entries(registro)) saida[k] = v instanceof Blob ? { __blob: await blobParaTexto(v) } : v;
  return saida;
}
async function desserializar(registro) {
  const saida = {};
  for (const [k, v] of Object.entries(registro)) saida[k] = v && typeof v === 'object' && typeof v.__blob === 'string' ? await (await fetch(v.__blob)).blob() : v;
  return saida;
}

// ---------- Gerar ----------
export async function gerarBackup() {
  const aparelho = await lerAparelho();
  const tabelas = {};
  for (const t of db.tables) {
    const registros = await t.toArray();
    tabelas[t.name] = await Promise.all(registros.map(serializar));
  }
  const dados = { tipo: TIPO, versao: VERSAO, versaoBanco: db.verno, geradoEm: new Date().toISOString(), aparelho, tabelas };
  const carimbo = dados.geradoEm.slice(0, 16).replace(/[-:T]/g, '');
  const nome = `backup-${aparelho ? aparelho.sigla : 'aparelho'}-${carimbo}.txt`;
  return { arquivo: new File([JSON.stringify(dados)], nome, { type: 'text/plain' }), resumo: resumir(dados) };
}

function resumir(d) {
  const n = (t) => (d.tabelas[t] || []).length;
  const vendas = (d.tabelas.vendas || []).filter((v) => (v.tipo || 'venda') === 'venda').length;
  return { aparelho: d.aparelho, geradoEm: d.geradoEm, produtos: n('produtos'), eventos: n('eventos'), vendas, caixas: n('caixas') };
}

// ---------- Ler ----------
export async function lerBackup(arquivo) {
  let dados;
  try { dados = JSON.parse(await arquivo.text()); } catch (e) { throw new Error('Este arquivo não é um backup do Coline Zaiko.'); }
  if (!dados || dados.tipo !== TIPO) {
    if (dados && dados.tipo === 'coline-zaiko-pacote') throw new Error('Este arquivo é um pacote de catálogo, não um backup. Use Mais → Preparar outros aparelhos.');
    if (dados && dados.tipo === 'coline-zaiko-vendas') throw new Error('Este arquivo é de vendas, não um backup. Use Mais → Juntar vendas.');
    throw new Error('Este arquivo não é um backup do Coline Zaiko.');
  }
  if (dados.versao > VERSAO || dados.versaoBanco > db.verno) throw new Error('Backup feito numa versão mais nova do app. Atualize este aparelho primeiro.');
  return { dados, resumo: resumir(dados) };
}

// ---------- Restaurar ----------
// Apaga tudo e grava o conteúdo do backup, numa operação só:
// se algo der errado no meio, nada é alterado.
export async function restaurarBackup(dados) {
  const convertidas = {};
  for (const t of db.tables) convertidas[t.name] = await Promise.all((dados.tabelas[t.name] || []).map(desserializar));
  await db.transaction('rw', db.tables, async () => {
    for (const t of db.tables) {
      await t.clear();
      if (convertidas[t.name].length) await t.bulkPut(convertidas[t.name]);
    }
  });
  await gravarConfig('ultimoBackupRestaurado', { geradoEm: dados.geradoEm, aparelho: dados.aparelho, em: new Date().toISOString() });
}

// ---------- Quando foi o último backup ----------
export const registrarBackupFeito = (onde) => gravarConfig('ultimoBackup', { em: new Date().toISOString(), onde });
export const lerUltimoBackup = () => lerConfig('ultimoBackup', null);
// Há vendas, caixas ou cadastros novos desde o último backup?
export async function mudouDesdeUltimoBackup() {
  const ultimo = await lerUltimoBackup();
  if (!ultimo) return (await db.vendas.count()) > 0 || (await db.produtos.count()) > 0;
  const depois = (r) => (r.criadoEm || r.abertoEm || '') > ultimo.em;
  return (await db.vendas.filter(depois).count()) > 0 || (await db.caixas.filter(depois).count()) > 0;
}
