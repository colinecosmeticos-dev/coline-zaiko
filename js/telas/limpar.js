// =========================================================
// Tela Apagar dados de teste (#/limpar; Mais, nos dois modos). v0.28.0
// Apaga só o que está marcado como TESTE (v0.37.0; antes listava todos os
// eventos): os eventos de teste e TUDO o que há neles neste aparelho (vendas,
// trocas, devoluções, caixas, reforços e retiradas, brindes e avarias, estoque
// levado e contagem) e, na Gestão, os produtos de teste com as variações.
// A marca fica no cadastro do evento ("Evento de teste") e do produto
// ("Produto de teste") e vai aos caixas na base.
// Mantém: o que não está marcado, catálogo (produtos, categorias, subcategorias, linhas, fotos),
// formas de pagamento, categorias de retirada, PIN, nome e modo do aparelho.
// Registros "órfãos" (de eventos que já não existem) entram junto.
// Sem nenhuma venda sobrando, a numeração das vendas volta para 0001.
// Pede o PIN (se houver) e a palavra APAGAR. Cada aparelho limpa o seu.
// =========================================================
import { db, lerConfig, gravarConfig, lerEventoAtivo } from '../db.js';
import { esc, icones, aviso, periodo } from '../ui.js';
import { pedirPin } from '../pin.js';
import { ehCaixa, voltarDoMenu } from '../modo.js';
import { limparCarrinho } from '../venda/carrinho.js';

const TABELAS = ['vendas', 'caixas', 'movimentos', 'saidas', 'estoqueLevado', 'estoqueContado'];
const PALAVRA = 'APAGAR';

async function levantar() {
  const [eventos, ...tabelas] = await Promise.all([db.eventos.toArray(), ...TABELAS.map((t) => db.table(t).toArray())]);
  const dados = Object.fromEntries(TABELAS.map((t, i) => [t, tabelas[i]]));
  const ids = new Set(eventos.map((e) => e.id));
  const contar = (id) => {
    const de = (t) => dados[t].filter((r) => r.eventoId === id);
    return {
      vendas: de('vendas').length, caixas: de('caixas').length,
      outros: de('movimentos').length + de('saidas').length + de('estoqueLevado').length + de('estoqueContado').length
    };
  };
  const orfaos = TABELAS.reduce((s, t) => s + dados[t].filter((r) => !ids.has(r.eventoId)).length, 0);
  eventos.sort((a, b) => (b.dataInicio || '').localeCompare(a.dataInicio || ''));
  const produtos = ehCaixa() ? [] : (await db.produtos.toArray()).filter((p) => p.teste).sort((a, b) => a.nome.localeCompare(b.nome));
  for (const p of produtos) p.variacoes = await db.variacoes.where('produtoId').equals(p.id).count();
  return { eventos: eventos.filter((e) => e.teste).map((e) => ({ ...e, conta: contar(e.id) })), semMarca: eventos.filter((e) => !e.teste).length, produtos, orfaos, dados, ids };
}

export async function render(el) {
  const { eventos, semMarca, produtos, orfaos } = await levantar();
  const ativo = await lerEventoAtivo();
  const caixa = ehCaixa();
  const resumo = (c) => [c.vendas && `${c.vendas} ${c.vendas === 1 ? 'registro de venda' : 'registros de venda'}`, c.caixas && `${c.caixas} ${c.caixas === 1 ? 'caixa' : 'caixas'}`, c.outros && `${c.outros} de estoque e gaveta`].filter(Boolean).join(' · ') || 'nada registrado neste aparelho';

  el.innerHTML = `
    ${voltarDoMenu()}
    <header class="cab"><div><h1>Apagar dados de teste</h1>
      <p class="sub">Apaga só o que está marcado como <strong>teste</strong>, e tudo o que foi registrado nos eventos de teste <strong>neste aparelho</strong>.</p></div></header>

    <section class="cartao">
      <h2>O que fica</h2>
      <p class="sub">Tudo o que não está marcado como teste: eventos, produtos, fotos, categorias, subcategorias e linhas, formas de pagamento e taxas, categorias de retirada, PIN, nome, sigla e modo do aparelho.</p>
      <h2 style="margin-top:14px">O que é apagado</h2>
      <p class="sub">Os eventos de teste, com as vendas, trocas, devoluções, caixas, reforços, retiradas, brindes, avarias, estoque levado e contagem de cada um. Sem nenhuma venda sobrando, a numeração volta para ${esc('0001')}.</p>
      <p class="sub" style="margin-top:8px">Para marcar: abra o evento (ou o produto) e ligue <strong>${caixa ? 'Evento de teste' : 'Evento de teste / Produto de teste'}</strong>.${caixa ? ' Nos caixas, a marca chega pela base, ao sincronizar.' : ''}</p>
      <p class="aviso-inline">${caixa
        ? 'Faça antes na Gestão (e envie aos caixas). Depois, aqui, apague e toque em Sincronizar.'
        : 'Ordem: 1) marque e apague aqui na Gestão; 2) envie aos caixas; 3) apague em cada caixa e sincronize.'}</p>
      <div class="acoes" style="justify-content:flex-start"><a class="btn" href="#/backup">Fazer um backup antes</a></div>
    </section>

    <section class="cartao">
      <h2>Eventos de teste neste aparelho</h2>
      ${eventos.length || orfaos ? `<ul class="lista-limpar">
        ${eventos.map((e) => `<li><label class="marcar">
          <input type="checkbox" data-evento="${esc(e.id)}" checked>
          <span><strong>${esc(e.nome)}</strong>${e.id === ativo?.id ? ' <span class="etiqueta">em uso</span>' : ''}${e.status === 'encerrado' ? ' <span class="etiqueta">encerrado</span>' : ''} <span class="etiqueta teste">Teste</span>
            <br><span class="sub">${esc(periodo(e.dataInicio, e.dataFim))} · ${resumo(e.conta)}</span></span></label></li>`).join('')}
        ${orfaos ? `<li><label class="marcar"><input type="checkbox" id="orfaos" checked>
          <span><strong>Registros soltos</strong><br><span class="sub">${orfaos} ${orfaos === 1 ? 'registro' : 'registros'} de eventos que já não existem</span></span></label></li>` : ''}
      </ul>` : '<p class="sub">Nenhum evento marcado como teste.</p>'}
      ${semMarca ? `<p class="sub" style="margin-top:8px">${semMarca} ${semMarca === 1 ? 'evento sem a marca de teste fica' : 'eventos sem a marca de teste ficam'} e não aparece${semMarca === 1 ? '' : 'm'} aqui.</p>` : ''}
    </section>

    ${caixa ? '' : `<section class="cartao">
      <h2>Produtos de teste</h2>
      ${produtos.length ? `<ul class="lista-limpar">
        ${produtos.map((p) => `<li><label class="marcar">
          <input type="checkbox" data-produto="${esc(p.id)}" checked>
          <span><strong>${esc(p.nome)}</strong> <span class="etiqueta teste">Teste</span>
            <br><span class="sub">${p.variacoes} ${p.variacoes === 1 ? 'variação' : 'variações'} · as vendas já feitas guardam o nome</span></span></label></li>`).join('')}
      </ul>` : '<p class="sub">Nenhum produto marcado como teste.</p>'}
    </section>`}

    ${eventos.length || orfaos || produtos.length ? `<section class="cartao">
      <h2>Confirmar</h2>
      <div class="campo"><label for="palavra">Para confirmar, digite <strong>${PALAVRA}</strong></label>
        <input class="entrada" id="palavra" autocomplete="off" autocapitalize="characters" spellcheck="false"></div>
      <div class="acoes" style="justify-content:flex-start"><button type="button" class="btn primario perigo-cheio" id="apagar" disabled></button></div>
    </section>` : ''}`;

  const $ = (s) => el.querySelector(s);
  if (!$('#apagar')) return;
  const marcados = () => [...el.querySelectorAll('[data-evento]:checked')].map((c) => c.dataset.evento);
  const prods = () => [...el.querySelectorAll('[data-produto]:checked')].map((c) => c.dataset.produto);
  const conferir = () => {
    const n = marcados().length, np = prods().length, soltos = $('#orfaos')?.checked;
    const algo = n || np || soltos;
    const partes = [n && `${n} ${n === 1 ? 'evento' : 'eventos'}`, np && `${np} ${np === 1 ? 'produto' : 'produtos'}`, soltos && 'os registros soltos'].filter(Boolean);
    $('#apagar').textContent = algo ? `Apagar ${partes.join(', ').replace(/, ([^,]*)$/, ' e $1')}` : 'Marque o que apagar';
    $('#apagar').disabled = !algo || $('#palavra').value.trim().toUpperCase() !== PALAVRA;
  };
  el.addEventListener('change', conferir);
  $('#palavra').addEventListener('input', conferir);
  conferir();

  $('#apagar').addEventListener('click', async () => {
    if (!(await pedirPin({ titulo: 'Apagar dados de teste', texto: 'Digite o PIN para apagar.' }))) return;
    $('#apagar').disabled = true;
    try {
      const r = await apagar(marcados(), !!$('#orfaos')?.checked, prods());
      aviso(`Apagado: ${r.eventos} ${r.eventos === 1 ? 'evento' : 'eventos'}, ${r.registros} ${r.registros === 1 ? 'registro' : 'registros'}${r.produtos ? ` e ${r.produtos} ${r.produtos === 1 ? 'produto' : 'produtos'}` : ''}.${r.numeracao ? ' A numeração das vendas recomeçou.' : ''}`);
      render(el);
    } catch (e) {
      console.error(e);
      aviso('Não foi possível apagar. Nada foi mudado.', { tipo: 'erro' });
      conferir();
    }
  });
}

// Apaga numa transação só: ou apaga tudo, ou nada
async function apagar(idsEventos, soltos, idsProdutos = []) {
  const { dados, ids, eventos, produtos } = await levantar();
  // Só o que está marcado como teste (confere de novo na hora de apagar)
  const deTeste = new Set(eventos.map((e) => e.id)), prodTeste = new Set(produtos.map((p) => p.id));
  const apagarEvento = new Set(idsEventos.filter((id) => deTeste.has(id)));
  const apagarProduto = idsProdutos.filter((id) => prodTeste.has(id));
  const variacoes = apagarProduto.length ? await db.variacoes.where('produtoId').anyOf(apagarProduto).primaryKeys() : [];
  const varSai = new Set(variacoes);
  const sai = (r) => apagarEvento.has(r.eventoId) || (soltos && !ids.has(r.eventoId));
  let registros = 0, numeracao = false;
  await db.transaction('rw', [db.eventos, db.config, db.produtos, db.variacoes, ...TABELAS.map((t) => db.table(t))], async () => {
    // Produtos de teste: o produto, as variações e o estoque levado/contado delas
    if (apagarProduto.length) {
      await db.variacoes.bulkDelete(variacoes);
      await db.produtos.bulkDelete(apagarProduto);
      for (const t of ['estoqueLevado', 'estoqueContado']) {
        const chaves = dados[t].filter((r) => varSai.has(r.variacaoId) && !apagarEvento.has(r.eventoId)).map((r) => r.id);
        await db.table(t).bulkDelete(chaves);
      }
    }
    for (const t of TABELAS) {
      const chaves = dados[t].filter(sai).map((r) => r.id);
      registros += chaves.length;
      await db.table(t).bulkDelete(chaves);
    }
    await db.eventos.bulkDelete([...apagarEvento]);
    // Evento em uso apagado: fica sem evento (escolher depois)
    const ativo = await db.config.get('eventoAtivoId');
    if (ativo && apagarEvento.has(ativo.valor)) await db.config.delete('eventoAtivoId');
    // Marcas de vendas importadas dos eventos apagados
    const importadas = (await db.config.get('vendasImportadas'))?.valor;
    if (importadas) {
      for (const id of Object.keys(importadas)) if (apagarEvento.has(id) || (soltos && !ids.has(id))) delete importadas[id];
      await db.config.put({ chave: 'vendasImportadas', valor: importadas });
    }
    const busca = (await db.config.get('ultimaBuscaVendas'))?.valor;
    if (busca && apagarEvento.has(busca.eventoId)) await db.config.delete('ultimaBuscaVendas');
    // Sem nenhuma venda: numeração volta para 0001
    if (!(await db.vendas.count())) { await db.config.delete('seqVenda'); numeracao = true; }
  });
  limparCarrinho();   // venda em andamento de teste também sai
  return { eventos: apagarEvento.size, registros, numeracao, produtos: apagarProduto.length };
}
