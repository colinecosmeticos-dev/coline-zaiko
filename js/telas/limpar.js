// =========================================================
// Tela Apagar dados de teste (#/limpar; Mais, nos dois modos). v0.28.0
// Antes de usar o app de verdade: apaga os eventos escolhidos e TUDO o que
// há neles neste aparelho (vendas, trocas, devoluções, caixas, reforços e
// retiradas, brindes e avarias, estoque levado e contagem).
// Mantém: catálogo (produtos, categorias, subcategorias, linhas, fotos),
// formas de pagamento, categorias de retirada, PIN, nome e modo do aparelho.
// Registros "órfãos" (de eventos que já não existem) entram junto.
// Sem nenhuma venda sobrando, a numeração das vendas volta para 0001.
// Pede o PIN (se houver) e a palavra APAGAR. Cada aparelho limpa o seu.
// =========================================================
import { db, lerConfig, gravarConfig, lerEventoAtivo } from '../db.js';
import { esc, icones, aviso, periodo } from '../ui.js';
import { pedirPin } from '../pin.js';
import { ehCaixa } from '../modo.js';
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
  return { eventos: eventos.map((e) => ({ ...e, conta: contar(e.id) })), orfaos, dados, ids };
}

export async function render(el) {
  const { eventos, orfaos } = await levantar();
  const ativo = await lerEventoAtivo();
  const caixa = ehCaixa();
  const resumo = (c) => [c.vendas && `${c.vendas} ${c.vendas === 1 ? 'registro de venda' : 'registros de venda'}`, c.caixas && `${c.caixas} ${c.caixas === 1 ? 'caixa' : 'caixas'}`, c.outros && `${c.outros} de estoque e gaveta`].filter(Boolean).join(' · ') || 'nada registrado neste aparelho';

  el.innerHTML = `
    <a class="voltar" href="#/mais">${icones.voltar} Mais</a>
    <header class="cab"><div><h1>Apagar dados de teste</h1>
      <p class="sub">Para começar a usar de verdade: apaga os eventos de teste e tudo o que foi registrado neles <strong>neste aparelho</strong>.</p></div></header>

    <section class="cartao">
      <h2>O que fica</h2>
      <p class="sub">Produtos, fotos, categorias, subcategorias e linhas, formas de pagamento e taxas, categorias de retirada, PIN, nome, sigla e modo do aparelho.</p>
      <h2 style="margin-top:14px">O que é apagado</h2>
      <p class="sub">Os eventos marcados abaixo, com as vendas, trocas, devoluções, caixas, reforços, retiradas, brindes, avarias, estoque levado e contagem de cada um. Sem nenhuma venda sobrando, a numeração volta para ${esc('0001')}.</p>
      <p class="aviso-inline">${caixa
        ? 'Faça antes na Gestão (e publique a base). Depois, aqui, apague e toque em Sincronizar.'
        : 'Ordem: 1) apague aqui na Gestão; 2) crie o evento de verdade e publique a base; 3) apague em cada caixa e sincronize.'}</p>
      <div class="acoes" style="justify-content:flex-start"><a class="btn" href="#/backup">Fazer um backup antes</a></div>
    </section>

    <section class="cartao">
      <h2>Eventos deste aparelho</h2>
      ${eventos.length || orfaos ? `<ul class="lista-limpar">
        ${eventos.map((e) => `<li><label class="marcar">
          <input type="checkbox" data-evento="${esc(e.id)}" checked>
          <span><strong>${esc(e.nome)}</strong>${e.id === ativo?.id ? ' <span class="etiqueta">em uso</span>' : ''}${e.status === 'encerrado' ? ' <span class="etiqueta">encerrado</span>' : ''}
            <br><span class="sub">${esc(periodo(e.dataInicio, e.dataFim))} · ${resumo(e.conta)}</span></span></label></li>`).join('')}
        ${orfaos ? `<li><label class="marcar"><input type="checkbox" id="orfaos" checked>
          <span><strong>Registros soltos</strong><br><span class="sub">${orfaos} ${orfaos === 1 ? 'registro' : 'registros'} de eventos que já não existem</span></span></label></li>` : ''}
      </ul>` : '<p class="sub">Nenhum evento neste aparelho. Não há o que apagar.</p>'}
    </section>

    ${eventos.length || orfaos ? `<section class="cartao">
      <h2>Confirmar</h2>
      <div class="campo"><label for="palavra">Para confirmar, digite <strong>${PALAVRA}</strong></label>
        <input class="entrada" id="palavra" autocomplete="off" autocapitalize="characters" spellcheck="false"></div>
      <div class="acoes" style="justify-content:flex-start"><button type="button" class="btn primario perigo-cheio" id="apagar" disabled></button></div>
    </section>` : ''}`;

  const $ = (s) => el.querySelector(s);
  if (!$('#apagar')) return;
  const marcados = () => [...el.querySelectorAll('[data-evento]:checked')].map((c) => c.dataset.evento);
  const conferir = () => {
    const n = marcados().length, soltos = $('#orfaos')?.checked;
    const algo = n || soltos;
    $('#apagar').textContent = n ? `Apagar ${n} ${n === 1 ? 'evento' : 'eventos'}${soltos ? ' e os registros soltos' : ''}` : soltos ? 'Apagar os registros soltos' : 'Marque o que apagar';
    $('#apagar').disabled = !algo || $('#palavra').value.trim().toUpperCase() !== PALAVRA;
  };
  el.addEventListener('change', conferir);
  $('#palavra').addEventListener('input', conferir);
  conferir();

  $('#apagar').addEventListener('click', async () => {
    if (!(await pedirPin({ titulo: 'Apagar dados de teste', texto: 'Digite o PIN para apagar.' }))) return;
    $('#apagar').disabled = true;
    try {
      const r = await apagar(marcados(), !!$('#orfaos')?.checked);
      aviso(`Apagado: ${r.eventos} ${r.eventos === 1 ? 'evento' : 'eventos'} e ${r.registros} ${r.registros === 1 ? 'registro' : 'registros'}.${r.numeracao ? ' A numeração das vendas recomeçou.' : ''}`);
      render(el);
    } catch (e) {
      console.error(e);
      aviso('Não foi possível apagar. Nada foi mudado.', { tipo: 'erro' });
      conferir();
    }
  });
}

// Apaga numa transação só: ou apaga tudo, ou nada
async function apagar(idsEventos, soltos) {
  const { dados, ids } = await levantar();
  const apagarEvento = new Set(idsEventos);
  const sai = (r) => apagarEvento.has(r.eventoId) || (soltos && !ids.has(r.eventoId));
  let registros = 0, numeracao = false;
  await db.transaction('rw', [db.eventos, db.config, ...TABELAS.map((t) => db.table(t))], async () => {
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
  return { eventos: apagarEvento.size, registros, numeracao };
}
