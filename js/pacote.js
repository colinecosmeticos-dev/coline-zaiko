// =========================================================
// Pacote para preparar outros aparelhos.
// Um arquivo com tudo que o aparelho principal define:
//   catálogo (produtos, variações, categorias, tipos, linhas e fotos), formas de pagamento com taxas,
//   categorias de retirada, PIN (só a "impressão digital") e eventos.
// NÃO leva: nome/sigla do aparelho, tema, evento em uso, vendas e caixas.
//
// O arquivo é texto (JSON) com final .txt, porque o Android só deixa
// compartilhar alguns tipos de arquivo — e .txt é um deles.
// =========================================================
import { db, lerAparelho, lerConfig, gravarConfig } from './db.js';

const TIPO = 'coline-zaiko-pacote';
// Versão 2 (v0.20.0): leva também tipos, linhas e as fotos das variações.
// Um app antigo recusa o pacote 2 (pede para atualizar), em vez de importar pela metade.
const VERSAO_PACOTE = 2;

// ---------- Gerar ----------
// base: { versao, publicadoEm, eventoId } quando a Gestão publica a base para os caixas (v0.22.0)
export async function gerarPacote({ base = null } = {}) {
  const [produtos, variacoes, categorias, categoriasRetirada, eventos, formasPagamento, tipos, linhas] = await Promise.all([
    db.produtos.toArray(), db.variacoes.toArray(), db.categorias.toArray(),
    db.categoriasRetirada.toArray(), db.eventos.toArray(), db.formasPagamento.toArray(),
    db.tipos.toArray(), db.linhas.toArray()
  ]);
  // Fotos viram texto (base64) para caberem no arquivo
  const produtosComFoto = await Promise.all(produtos.map(async (p) => ({ ...p, foto: p.foto ? await blobParaTexto(p.foto) : null })));
  const categoriasComFoto = await Promise.all(categorias.map(async (c) => ({ ...c, foto: c.foto ? await blobParaTexto(c.foto) : null })));
  const variacoesComFoto = await Promise.all(variacoes.map(async (v) => ({ ...v, foto: v.foto ? await blobParaTexto(v.foto) : null })));
  const aparelho = await lerAparelho();

  const pacote = {
    tipo: TIPO,
    versao: VERSAO_PACOTE,
    geradoEm: new Date().toISOString(),
    geradoPor: aparelho ? { nome: aparelho.nome, sigla: aparelho.sigla } : null,
    catalogo: { produtos: produtosComFoto, variacoes: variacoesComFoto, categorias: categoriasComFoto, tipos, linhas },
    formasPagamento,
    categoriasRetirada,
    pin: { hash: await lerConfig('pinHash'), sal: await lerConfig('pinSal') },
    eventos,
    base
  };
  const texto = JSON.stringify(pacote);
  const data = pacote.geradoEm.slice(0, 10);
  const nome = `pacote-coline-zaiko-${data}.txt`;
  return { arquivo: new File([texto], nome, { type: 'text/plain' }), resumo: resumir(pacote) };
}

// ---------- Ler e conferir um arquivo recebido ----------
export async function lerPacote(arquivo) {
  let pacote;
  try { pacote = JSON.parse(await arquivo.text()); } catch (e) { throw new Error('Este arquivo não é um pacote do Coline Zaiko.'); }
  if (!pacote || pacote.tipo !== TIPO) throw new Error('Este arquivo não é um pacote do Coline Zaiko.');
  if (pacote.versao > VERSAO_PACOTE) throw new Error('Pacote gerado por uma versão mais nova do app. Atualize este aparelho primeiro.');
  return { pacote, resumo: resumir(pacote) };
}

// ---------- Importar ----------
// O catálogo deste aparelho é SUBSTITUÍDO pelo do pacote (o principal manda).
// Eventos e categorias de retirada são somados/atualizados, sem apagar os daqui.
export async function importarPacote(pacote) {
  const produtos = await Promise.all(pacote.catalogo.produtos.map(async (p) => ({ ...p, foto: p.foto ? await textoParaBlob(p.foto) : null })));
  const categorias = await Promise.all(pacote.catalogo.categorias.map(async (c) => ({ ...c, foto: c.foto ? await textoParaBlob(c.foto) : null })));
  const variacoes = await Promise.all(pacote.catalogo.variacoes.map(async (v) => ({ ...v, foto: typeof v.foto === 'string' ? await textoParaBlob(v.foto) : null })));
  const { tipos, linhas } = pacote.catalogo;
  await db.transaction('rw', [db.produtos, db.variacoes, db.categorias, db.tipos, db.linhas, db.categoriasRetirada, db.eventos, db.formasPagamento, db.config], async () => {
    await db.variacoes.clear();
    await db.produtos.clear();
    await db.categorias.clear();
    await db.categorias.bulkPut(categorias);
    await db.produtos.bulkPut(produtos);
    await db.variacoes.bulkPut(variacoes);
    // Tipos e linhas (pacotes antigos não têm: ficam os deste aparelho)
    if (tipos) { await db.tipos.clear(); await db.tipos.bulkPut(tipos); await db.config.put({ chave: 'tiposCriados', valor: true }); }
    if (linhas) { await db.linhas.clear(); await db.linhas.bulkPut(linhas); }
    // Categorias de retirada: as do pacote substituem as deste aparelho
    // (antes eram somadas, e cada aparelho tinha criado as suas: ficavam repetidas)
    await db.categoriasRetirada.clear();
    await db.categoriasRetirada.bulkPut(pacote.categoriasRetirada);
    await db.eventos.bulkPut(pacote.eventos);
    // Formas de pagamento: as do pacote substituem as deste aparelho
    if (pacote.formasPagamento) {
      await db.formasPagamento.clear();
      await db.formasPagamento.bulkPut(pacote.formasPagamento);
      await db.config.put({ chave: 'formasPagamentoCriadas', valor: true });
    }
    await db.config.put({ chave: 'categoriasRetiradaCriadas', valor: true });
    if (pacote.pin && pacote.pin.hash) {
      await db.config.put({ chave: 'pinHash', valor: pacote.pin.hash });
      await db.config.put({ chave: 'pinSal', valor: pacote.pin.sal });
    }
  });
  await gravarConfig('ultimoPacoteImportado', { geradoEm: pacote.geradoEm, geradoPor: pacote.geradoPor, importadoEm: new Date().toISOString() });
}

function resumir(p) {
  return {
    geradoEm: p.geradoEm,
    geradoPor: p.geradoPor,
    produtos: p.catalogo.produtos.length,
    itens: p.catalogo.variacoes.length,
    eventos: p.eventos.length,
    comPin: !!(p.pin && p.pin.hash)
  };
}

// ---------- Fotos <-> texto ----------
function blobParaTexto(blob) {
  return new Promise((ok, falha) => {
    const r = new FileReader();
    r.onload = () => ok(r.result);
    r.onerror = falha;
    r.readAsDataURL(blob);
  });
}
async function textoParaBlob(texto) {
  return (await fetch(texto)).blob();
}
