// =========================================================
// Sincronização pelo Google Drive (v0.22.0).
//
// Gestão: publica a BASE (o pacote com número de versão e o evento
//   que os caixas devem usar) e busca as vendas que os caixas enviaram.
// Caixa: num toque, recebe a base nova (se houver), envia as próprias
//   vendas, trocas, devoluções, saídas e caixas, e faz o backup.
//
// Cada aparelho só escreve os próprios arquivos (a base é só da Gestão),
// então nunca há dois aparelhos escrevendo no mesmo arquivo.
// Quem chama precisa ter pedido autorizar() no toque do botão.
// =========================================================
import { db, lerAparelho, lerConfig, gravarConfig, lerEventoAtivo, definirEventoAtivo, caixaAbertoDoEvento } from './db.js';
import { gerarPacote, lerPacote, importarPacote } from './pacote.js';
import { gerarArquivoVendas, lerArquivoVendas, importarVendas } from './vendas-arquivo.js';
import { gerarBackup, registrarBackupFeito } from './backup.js';
import { enviarPacote, ultimoPacote, baixarArquivo, enviarVendas, listarVendasNoDrive, enviarBackup } from './drive.js';

// ---------- Gestão: base ----------
// "Impressão digital" do que vai na base (sem as fotos, só o tamanho delas),
// para saber se algo mudou desde a última publicação.
async function impressaoDaBase() {
  const tabelas = ['produtos', 'variacoes', 'categorias', 'tipos', 'linhas', 'eventos', 'formasPagamento', 'categoriasRetirada'];
  const dados = {};
  for (const t of tabelas) {
    dados[t] = (await db[t].toArray())
      .map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v instanceof Blob ? `blob:${v.size}` : v])))
      .sort((a, b) => String(a.id).localeCompare(String(b.id)));
  }
  dados.pin = await lerConfig('pinHash');
  dados.evento = await lerConfig('eventoAtivoId');
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(dados)));
  return [...new Uint8Array(bytes)].slice(0, 12).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Situação da base na Gestão: { publicada: {versao, em, eventoNome} | null, alterada }
export async function situacaoBase() {
  const publicada = await lerConfig('basePublicada', null);
  const alterada = !publicada || publicada.impressao !== (await impressaoDaBase());
  return { publicada, alterada };
}

export async function publicarBase() {
  const anterior = await lerConfig('basePublicada', null);
  const evento = await lerEventoAtivo();
  const base = { versao: (anterior ? anterior.versao : 0) + 1, publicadoEm: new Date().toISOString(), eventoId: evento ? evento.id : null };
  const { arquivo, resumo } = await gerarPacote({ base });
  await enviarPacote(arquivo, await lerAparelho(), { base: base.versao });
  const registro = { versao: base.versao, em: base.publicadoEm, eventoId: base.eventoId, eventoNome: evento ? evento.nome : '', impressao: await impressaoDaBase() };
  await gravarConfig('basePublicada', registro);
  return { ...registro, resumo };
}

// Gestão: busca no Drive as vendas que os caixas enviaram para o evento em uso
export async function buscarVendasDosCaixas() {
  const evento = await lerEventoAtivo();
  if (!evento) throw new Error('Escolha o evento em uso antes de buscar as vendas.');
  const aqui = await lerAparelho();
  const arquivos = (await listarVendasNoDrive(evento.id)).filter((a) => !aqui || a.sigla !== aqui.sigla);
  const resultado = { evento, aparelhos: [], novas: 0 };
  for (const a of arquivos) {
    const { dados } = await lerArquivoVendas(await baixarArquivo(a));
    const r = await importarVendas(dados);
    resultado.aparelhos.push({ sigla: a.sigla, nome: a.aparelho, enviadoEm: a.criadoEm, novas: r.vendas.novos, atualizadas: r.vendas.atualizados });
    resultado.novas += r.vendas.novos;
  }
  await gravarConfig('ultimaBuscaVendas', { em: new Date().toISOString(), eventoId: evento.id });
  return resultado;
}

// ---------- Caixa: o que falta enviar ----------
// Registros deste aparelho criados ou mudados depois do último envio
export async function pendencias() {
  const aparelho = await lerAparelho();
  const ultimo = await lerConfig('ultimoEnvioVendas', null);
  const desde = ultimo ? ultimo.em : '';
  const deste = (r) => !r.aparelho || !aparelho || r.aparelho.id === aparelho.id;
  const depois = (...datas) => datas.some((d) => d && d > desde);
  const [vendas, saidas, caixas, movimentos] = await Promise.all([db.vendas.toArray(), db.saidas.toArray(), db.caixas.toArray(), db.movimentos.toArray()]);
  const v = vendas.filter((r) => deste(r) && depois(r.criadoEm, r.cancelamento && r.cancelamento.em));
  const s = saidas.filter((r) => deste(r) && depois(r.criadoEm, r.canceladoEm));
  const c = caixas.filter((r) => deste(r) && depois(r.abertoEm, ...(r.fechamentos || []).map((f) => f.em), ...(r.reaberturas || []).map((x) => x.em)));
  const m = movimentos.filter((r) => deste(r) && depois(r.criadoEm, r.canceladoEm));
  const eventos = new Set([...v, ...s, ...c, ...m].map((r) => r.eventoId).filter(Boolean));
  return { vendas: v.length, outros: s.length + c.length + m.length, eventos: [...eventos], ultimo };
}

// ---------- Caixa: é hora de sincronizar? (v0.27.0) ----------
// Durante as vendas, ter vendas sem enviar é normal e NÃO alerta (o ponto
// aceso o tempo todo virava paisagem). Alerta só quando há algo a fazer:
//   - há vendas ou registros de caixa sem enviar e o caixa de hoje não está
//     aberto (fechou no fim do dia, ou ficou para o dia seguinte); ou
//   - o aparelho ainda não tem catálogo (precisa receber a base).
export async function precisaSincronizar() {
  const p = await pendencias();
  const semEnviar = p.vendas + p.outros;
  const evento = await lerEventoAtivo();
  const aberto = evento ? await caixaAbertoDoEvento(evento.id) : null;
  const caixaAbertoHoje = !!aberto && aberto.data === new Date().toLocaleDateString('sv-SE');
  const semCatalogo = !(await db.produtos.count());
  const urgente = semCatalogo || (semEnviar > 0 && !caixaAbertoHoje);
  return { urgente, semCatalogo, semEnviar, caixaAbertoHoje, ...p };
}

// ---------- Caixa: sincronizar ----------
// passo(texto) mostra o andamento. Devolve um resumo do que aconteceu.
export async function sincronizarCaixa(passo = () => {}) {
  const inicio = new Date().toISOString();
  const resumo = { baseNova: null, eventoTrocado: null, avisoEvento: '', enviados: 0, backup: false };

  // 1. Base: só baixa se o arquivo no Drive for outro (nova publicação)
  passo('Procurando a base no Drive…');
  const info = await ultimoPacote();
  const recebida = await lerConfig('baseRecebida', null);
  if (info && (!recebida || recebida.arquivoId !== info.id)) {
    passo('Recebendo a base nova…');
    const { pacote } = await lerPacote(await baixarArquivo(info));
    await importarPacote(pacote);
    const base = pacote.base || {};
    await gravarConfig('baseRecebida', { arquivoId: info.id, versao: base.versao || null, publicadoEm: base.publicadoEm || pacote.geradoEm, em: inicio });
    resumo.baseNova = base.versao || '—';
    // Evento da base: troca só se não houver caixa aberto em outro evento
    if (base.eventoId) {
      const atual = await lerEventoAtivo();
      const destino = await db.eventos.get(base.eventoId);
      if (destino && (!atual || atual.id !== destino.id)) {
        const aberto = atual ? await caixaAbertoDoEvento(atual.id) : null;
        if (aberto) resumo.avisoEvento = `A base indica o evento ${destino.nome}, mas há um caixa aberto em ${atual.nome}. Feche esse caixa e sincronize de novo para trocar.`;
        else { await definirEventoAtivo(destino.id); resumo.eventoTrocado = destino.nome; }
      }
    }
  }

  // 2. Vendas: um arquivo por evento que tenha algo novo (e sempre o evento em uso)
  const pend = await pendencias();
  const atual = await lerEventoAtivo();
  const ids = new Set(pend.eventos);
  if (atual) ids.add(atual.id);
  const aparelho = await lerAparelho();
  for (const id of ids) {
    const evento = await db.eventos.get(id);
    if (!evento) continue;
    const temAlgo = (await db.vendas.where('eventoId').equals(id).count()) + (await db.caixas.where('eventoId').equals(id).count()) + (await db.saidas.where('eventoId').equals(id).count());
    if (!temAlgo) continue;
    passo(`Enviando as vendas de ${evento.nome}…`);
    const { arquivo } = await gerarArquivoVendas(evento);
    await enviarVendas(arquivo, { aparelho, eventoId: evento.id, nomeEvento: evento.nome });
    resumo.enviados += 1;
  }
  await gravarConfig('ultimoEnvioVendas', { em: inicio });

  // 3. Backup do aparelho
  passo('Fazendo o backup do aparelho…');
  const { arquivo: copia } = await gerarBackup();
  await enviarBackup(copia, aparelho);
  await registrarBackupFeito('drive');
  resumo.backup = true;

  await gravarConfig('ultimaSincronizacao', { em: new Date().toISOString(), ok: true });
  return resumo;
}
