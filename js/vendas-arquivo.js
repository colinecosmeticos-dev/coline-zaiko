// =========================================================
// Arquivo de vendas: leva as vendas, trocas, devoluções, caixas e
// movimentos de caixa DESTE aparelho num evento para o aparelho principal.
//
// Juntar é seguro: cada registro tem um identificador único, então
// importar o mesmo arquivo duas vezes não duplica nada. Se o registro
// já existe, fica a versão mais "avançada" (ex.: cancelada vence
// concluída; caixa fechado vence caixa aberto).
// =========================================================
import { db, lerAparelho, gravarConfig, lerConfig } from './db.js';

const TIPO = 'coline-zaiko-vendas';
const VERSAO = 1;

// ---------- Gerar ----------
export async function gerarArquivoVendas(evento) {
  const aparelho = await lerAparelho();
  if (!aparelho) throw new Error('Dê nome e sigla a este aparelho em Configurações antes de enviar.');
  const deste = (r) => !r.aparelho || r.aparelho.id === aparelho.id;
  const [vendas, caixas, movimentos] = await Promise.all([
    db.vendas.where('eventoId').equals(evento.id).toArray(),
    db.caixas.where('eventoId').equals(evento.id).toArray(),
    db.movimentos.where('eventoId').equals(evento.id).toArray()
  ]);
  const dados = {
    tipo: TIPO, versao: VERSAO,
    geradoEm: new Date().toISOString(),
    aparelho: { id: aparelho.id, nome: aparelho.nome, sigla: aparelho.sigla },
    evento,
    vendas: vendas.filter(deste), caixas: caixas.filter(deste), movimentos: movimentos.filter(deste)
  };
  const carimbo = dados.geradoEm.slice(0, 16).replace(/[-:T]/g, '');
  const nome = `vendas-${aparelho.sigla}-${evento.codigo || 'evento'}-${carimbo}.txt`;
  return { arquivo: new File([JSON.stringify(dados)], nome, { type: 'text/plain' }), resumo: resumir(dados) };
}

function resumir(d) {
  const conta = (t) => d.vendas.filter((v) => (v.tipo || 'venda') === t).length;
  return {
    aparelho: d.aparelho, evento: d.evento, geradoEm: d.geradoEm,
    vendas: conta('venda'), trocas: conta('troca'), devolucoes: conta('devolucao'),
    caixas: d.caixas.length
  };
}

// ---------- Ler ----------
export async function lerArquivoVendas(arquivo) {
  let dados;
  try { dados = JSON.parse(await arquivo.text()); } catch (e) { throw new Error('Este arquivo não é um arquivo de vendas do Coline Zaiko.'); }
  if (!dados || dados.tipo !== TIPO) {
    if (dados && dados.tipo === 'coline-zaiko-pacote') throw new Error('Este arquivo é um pacote de catálogo. Use Mais → Preparar outros aparelhos.');
    throw new Error('Este arquivo não é um arquivo de vendas do Coline Zaiko.');
  }
  if (dados.versao > VERSAO) throw new Error('Arquivo gerado por uma versão mais nova do app. Atualize este aparelho primeiro.');
  return { dados, resumo: resumir(dados) };
}

// ---------- Juntar ----------
const pesoVenda = (v) => (v.status === 'cancelada' ? 1 : 0);
const pesoCaixa = (c) => (c.fechamentos || []).length + (c.reaberturas || []).length;
const pesoMov = (m) => (m.status === 'cancelado' ? 1 : 0);

async function juntar(tabela, registros, peso) {
  let novos = 0, atualizados = 0;
  for (const r of registros) {
    const local = await tabela.get(r.id);
    if (!local) { await tabela.add(r); novos += 1; }
    else if (peso(r) > peso(local)) { await tabela.put(r); atualizados += 1; }
  }
  return { novos, atualizados };
}

export async function importarVendas(dados) {
  const aqui = await lerAparelho();
  if (aqui && dados.aparelho.id === aqui.id) throw new Error('Este arquivo é deste mesmo aparelho: as vendas dele já estão aqui.');
  let r;
  await db.transaction('rw', db.vendas, db.caixas, db.movimentos, db.eventos, db.config, async () => {
    // O evento normalmente já existe (veio no pacote); se não, entra agora
    if (!(await db.eventos.get(dados.evento.id))) await db.eventos.add(dados.evento);
    const v = await juntar(db.vendas, dados.vendas, pesoVenda);
    const c = await juntar(db.caixas, dados.caixas, pesoCaixa);
    const m = await juntar(db.movimentos, dados.movimentos, pesoMov);
    r = { vendas: v, caixas: c, movimentos: m };
    // Guarda quando chegou o último arquivo de cada aparelho (para a conferência)
    const registro = (await lerConfig('vendasImportadas')) || {};
    registro[dados.evento.id] = { ...(registro[dados.evento.id] || {}), [dados.aparelho.sigla]: { nome: dados.aparelho.nome, geradoEm: dados.geradoEm, importadoEm: new Date().toISOString() } };
    await gravarConfig('vendasImportadas', registro);
  });
  return r;
}

// ---------- Conferência ----------
// Aparelhos que têm vendas ou caixas neste evento, aqui neste aparelho
export async function aparelhosDoEvento(evento) {
  const aqui = await lerAparelho();
  const [vendas, caixas] = await Promise.all([
    db.vendas.where('eventoId').equals(evento.id).toArray(),
    db.caixas.where('eventoId').equals(evento.id).toArray()
  ]);
  const importados = ((await lerConfig('vendasImportadas')) || {})[evento.id] || {};
  const mapa = new Map();
  const pegar = (a) => {
    const k = a ? a.sigla : '?';
    if (!mapa.has(k)) mapa.set(k, { sigla: k, nome: a ? a.nome : 'Sem identificação', esteAparelho: !!(a && aqui && a.id === aqui.id), vendas: 0, caixas: 0, importado: importados[k] || null });
    return mapa.get(k);
  };
  for (const v of vendas) if ((v.tipo || 'venda') === 'venda' && v.status !== 'cancelada') pegar(v.aparelho).vendas += 1;
  for (const c of caixas) pegar(c.aparelho).caixas += 1;
  return [...mapa.values()].sort((a, b) => (b.esteAparelho - a.esteAparelho) || a.sigla.localeCompare(b.sigla));
}
