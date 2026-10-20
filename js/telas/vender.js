// =========================================================
// Tela Vender.
// Esquerda: busca/leitor, botões de categoria e um botão por item
// vendável (cada variação é um botão; um toque adiciona).
//   - produtos com linha: um grupo por linha, com cada tipo sempre
//     na mesma coluna (shampoo na 1ª, condicionador na 2ª...);
//   - produtos sem linha: um grupo por tipo.
// Direita: carrinho, desconto da venda, total e botão Cobrar.
// No celular, o carrinho vira uma barra no rodapé.
// =========================================================
import { db, lerAparelho, lerEventoAtivo, caixaAbertoDoEvento, caixaDoDia, listarCategorias, listarTipos, listarLinhas, listarProdutosCompletos, buscarPorCodigo, proximoNumeroVenda } from '../db.js';
import { esc, dinheiro, iniciais, icones, aviso, abrirJanela, campoDinheiro, campoPercentual, lerCentavos, escreverCentavos, hojeISO } from '../ui.js';
import { ouvirLeitor } from '../leitor.js';
import { som } from '../sons.js';
import { corValida } from '../cores.js';
import { carrinho, adicionarItem, removerItem, calcularItem, calcularTotais, limparCarrinho, guardarCarrinho, totalPago } from '../venda/carrinho.js';
import { pedirAberturaCaixa } from '../venda/abrir-caixa.js';
import { abrirCobranca, finalizarTrocaSemCobranca, textoPagamento } from '../venda/cobrar.js';
import { montarGrupos, temLinhas, SEM_CATEGORIA } from '../venda/grupos.js';
import { escolherEvento } from '../venda/escolher-evento.js';
import { ehCaixa } from '../modo.js';

// Escolhas da tela de venda lembradas em cada aparelho (só conforto; sem elas, vale o padrão)
const lerLocal = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const gravarLocal = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* ok */ } };
const CHAVE_CATEGORIA = 'zaiko-categoria-venda';
const CHAVE_VER = 'zaiko-venda-ver';       // 'linha' (padrão) ou 'subcategoria'
const CHAVE_TEXTO = 'zaiko-venda-texto';   // '1' = botões só com texto, sem foto
const TODOS = '__todos';

// Painel "Caixa livre" (v0.25.0): fica na tela depois de cada venda, até o próximo
// cliente (ler um código ou tocar). Guardado aqui para continuar se a pessoa sair
// da tela Vender e voltar.
let ultimaConcluida = null;

export async function render(el) {
  // ---------- Pré-requisitos ----------
  const aparelho = await lerAparelho();
  const evento = await lerEventoAtivo();
  const totalProdutos = await db.produtos.count();
  const caixaModo = ehCaixa();
  const falta = !aparelho ? ['Identifique este aparelho', 'Dê nome e sigla ao aparelho; a sigla vai no número de cada venda.', caixaModo ? '#/configurar' : '#/configuracoes', 'Configurar aparelho']
    : !totalProdutos && caixaModo ? ['Receba o catálogo', 'O catálogo e o evento vêm da Gestão: toque em Sincronizar.', '#/sincronizar', 'Ir para Sincronizar']
    : !evento ? ['Escolha o evento', 'As vendas ficam guardadas dentro de um evento.', caixaModo ? '#escolher-evento' : '#/eventos', caixaModo ? 'Escolher o evento' : 'Ir para Eventos']
    : !totalProdutos ? ['Cadastre os produtos', 'A tela de venda mostra os produtos do catálogo.', '#/produtos/novo', 'Cadastrar produto']
    : null;
  if (falta) {
    el.innerHTML = `<header class="cab"><h1>Vender</h1></header>
      <div class="cartao vazio"><div class="simbolo" aria-hidden="true">在庫</div><h2>${falta[0]}</h2><p>${falta[1]}</p><a class="btn primario" href="${falta[2]}">${falta[3]}</a></div>`;
    // Modo Caixa: escolhe o evento aqui mesmo, sem a tela Eventos
    el.querySelector('a[href="#escolher-evento"]')?.addEventListener('click', async (e) => {
      e.preventDefault();
      if (await escolherEvento()) render(el);
    });
    return;
  }

  // ---------- Caixa do dia ----------
  // Evento encerrado: só dá para concluir uma troca (vira registro pós-evento)
  if (evento.status === 'encerrado' && !carrinho.troca) {
    el.innerHTML = `<header class="cab"><h1>Vender</h1></header>
      <div class="cartao vazio"><div class="simbolo" aria-hidden="true">在庫</div><h2>Evento encerrado</h2>
      <p>${esc(evento.nome)} foi encerrado. Para vender de novo, reabra o evento em Mais → Fechamento do evento.</p><a class="btn primario" href="#/fechamento">Ir para o Fechamento</a></div>`;
    return;
  }
  let caixa = await caixaAbertoDoEvento(evento.id);
  const bloquear = (titulo, texto, botao) => {
    el.innerHTML = `<header class="cab"><h1>Vender</h1></header>
      <div class="cartao vazio"><div class="simbolo" aria-hidden="true">在庫</div><h2>${titulo}</h2><p>${texto}</p>${botao}</div>`;
  };
  // Caixa de outro dia esquecido aberto: fechar antes de vender
  if (caixa && caixa.data !== hojeISO()) {
    bloquear('Feche o caixa anterior', `O caixa de ${new Date(caixa.data + 'T12:00').toLocaleDateString('pt-BR')} ainda está aberto. Feche-o (com a contagem do dinheiro) para abrir o de hoje.`, '<a class="btn primario" href="#/caixa">Ir para a Gaveta</a>');
    return;
  }
  if (!caixa) {
    const deHoje = await caixaDoDia(evento.id, hojeISO());
    if (deHoje) {
      // Caixa deste evento já fechado hoje: reabrir (na Gaveta) ou trocar o evento (v0.27.0)
      bloquear('Caixa de hoje fechado', `O caixa de hoje de <strong>${esc(evento.nome)}</strong> já foi fechado. Para voltar a vender neste evento, reabra na Gaveta. Se for vender em outro evento, troque o evento.`,
        '<div class="acoes" style="justify-content:center;flex-wrap:wrap"><a class="btn primario" href="#/caixa">Reabrir na Gaveta</a><button type="button" class="btn" id="trocar-evento">Trocar o evento</button></div>');
      el.querySelector('#trocar-evento').addEventListener('click', async () => {
        if (!caixaModo) { location.hash = '#/eventos'; return; }
        if (await escolherEvento()) render(el);
      });
      return;
    }
    const novo = await pedirAberturaCaixa(evento);
    if (novo === 'outro-evento') { render(el); return; }   // escolheu outro evento: começa de novo
    if (!novo) {
      bloquear('Caixa fechado', 'Abra o caixa do dia para começar a vender.', '<button class="btn primario" id="abrir">Abrir caixa</button>');
      el.querySelector('#abrir').addEventListener('click', () => render(el));
      return;
    }
    caixa = novo;
    // (v0.28.0) Em vez do catálogo (que parecia uma venda em andamento), o painel
    // "Caixa livre" confirma a abertura e espera o primeiro cliente
    ultimaConcluida = { abertura: caixa };
  }

  // ---------- Dados ----------
  const [categorias, tipos, linhas] = await Promise.all([listarCategorias(), listarTipos(), listarLinhas()]);
  // Preço do evento: onde houver, substitui o preço normal (que fica guardado em precoBase)
  const precosEvento = evento.precos || {};
  const produtos = (await listarProdutosCompletos()).filter((p) => p.ativo && p.variacoes.length)
    .map((p) => ({ ...p, variacoes: p.variacoes.map((v) => {
      const normal = v.preco ?? p.preco;
      const doEvento = precosEvento[v.id];
      return doEvento != null && doEvento !== normal ? { ...v, preco: doEvento, precoBase: normal } : v;
    }) }));
  // Descrição da linha (ex.: Mochigome → "Hidratação"): a busca também encontra por ela
  const descricaoLinha = new Map(linhas.map((l) => [l.id, l.descricao || '']));   // por linhaEfetiva da variação
  const urls = [];
  const urlFoto = (blob) => { const u = URL.createObjectURL(blob); urls.push(u); return u; };
  const fotoProduto = new Map(produtos.filter((p) => p.foto).map((p) => [p.id, urlFoto(p.foto)]));
  const fotoVariacao = new Map();
  for (const p of produtos) for (const v of p.variacoes) if (v.foto) fotoVariacao.set(v.id, urlFoto(v.foto));

  // Botões de categoria: as que têm produto, na ordem cadastrada (+ "Outros" para quem não tem categoria)
  const idsCategorias = new Set(categorias.map((c) => c.id));
  const categoriaDe = (p) => (idsCategorias.has(p.categoriaId) ? p.categoriaId : SEM_CATEGORIA);
  const botoesCategoria = categorias.filter((c) => produtos.some((p) => p.categoriaId === c.id)).map((c) => ({ id: c.id, nome: c.nome }));
  if (produtos.some((p) => categoriaDe(p) === SEM_CATEGORIA)) botoesCategoria.push({ id: SEM_CATEGORIA, nome: botoesCategoria.length ? 'Outros' : 'Todos os produtos' });
  // "Todos" (todas as categorias, uma embaixo da outra) quando há mais de uma
  if (botoesCategoria.length > 1) botoesCategoria.unshift({ id: TODOS, nome: 'Todos' });
  let verPor = lerLocal(CHAVE_VER) === 'subcategoria' ? 'subcategoria' : 'linha';
  let soTexto = lerLocal(CHAVE_TEXTO) === '1';
  const comLinhas = temLinhas(produtos, linhas);
  let categoriaAtual = lerLocal(CHAVE_CATEGORIA);
  if (!botoesCategoria.some((c) => c.id === categoriaAtual)) categoriaAtual = botoesCategoria.find((c) => c.id !== TODOS)?.id || SEM_CATEGORIA;
  let busca = '';
  let estreito = null;   // celular: 2 botões por fileira; tablet e computador: até 4

  el.classList.add('tela-venda');
  document.body.classList.add('em-venda');
  el.innerHTML = `
    <div class="venda">
      <section class="venda-produtos" aria-label="Produtos">
        <div class="venda-topo">
          <label class="busca">
            <span class="oculto">Buscar produto ou ler código</span>
            ${icones.busca}
            <input class="entrada" id="busca" type="search" placeholder="Buscar ou ler código" autocomplete="off">
          </label>
        </div>
        <div class="venda-navegacao" id="navegacao"></div>
        <div class="venda-itens" id="grade"></div>
        <div class="caixa-livre" id="caixa-livre" hidden></div>
      </section>

      <aside class="venda-carrinho" id="carrinho" aria-label="Carrinho">
        <div class="carrinho-topo">
          <div><h2 id="titulo-carrinho">Venda</h2><span class="sub num" id="numero-venda"></span></div>
          <button type="button" class="btn-icone" id="fechar-carrinho" aria-label="Fechar carrinho">${icones.fechar}</button>
          <button type="button" class="btn texto" id="limpar">Limpar</button>
        </div>
        <div class="faixa-troca" id="faixa-troca" hidden></div>
        <ul class="carrinho-itens" id="itens"></ul>
        <div class="carrinho-rodape">
          <button type="button" class="linha-desconto" id="desconto-venda"></button>
          <div class="linha-credito" id="linha-credito" hidden></div>
          <div class="linha-credito linha-pago" id="linha-pago" hidden></div>
          <div class="linha-total"><span id="rotulo-total">Total</span><strong class="num" id="total"></strong></div>
          <button type="button" class="btn primario btn-cobrar" id="cobrar"></button>
        </div>
      </aside>

      <button type="button" class="barra-carrinho" id="barra-carrinho">
        <span id="barra-qtd"></span><strong class="num" id="barra-total"></strong><span class="btn primario">Ver carrinho</span>
      </button>
    </div>`;

  const $ = (s) => el.querySelector(s);

  // ---------- Área de produtos ----------
  // Um botão por item vendável: foto da variação → foto do produto → cor → iniciais
  function botaoItem(it) {
    const { p, v } = it;
    const foto = fotoVariacao.get(v.id) || fotoProduto.get(p.id);
    const cor = corValida(v.cor);
    const imagem = foto ? `<img src="${foto}" alt="">`
      : cor ? '' : `<span>${iniciais(it.nome)}</span>`;
    const preco = v.preco ?? p.preco;
    return `
      <button type="button" class="item-venda" data-v="${esc(v.id)}">
        <span class="iv-foto ${foto ? 'tem-foto' : ''}" ${!foto && cor ? `style="background:${cor}"` : ''}>${imagem}</span>
        <span class="iv-nome">${esc(it.nome)}</span>
        <span class="iv-info">
          <span class="iv-sub">${esc(it.sub || '')}</span>
          <span class="iv-preco num">${v.precoBase != null ? `<s>${dinheiro(v.precoBase)}</s> ` : ''}<strong>${dinheiro(preco)}</strong></span>
        </span>
      </button>`;
  }
  const vaga = '<span class="vaga-venda" aria-hidden="true"></span>';
  const encher = '<span class="vaga-venda invisivel" aria-hidden="true"></span>';

  function desenharGrupo(g, porFileira) {
    // A grade tem o mesmo número de colunas da tela (4, ou 2 no celular), para o botão
    // ter o mesmo tamanho em todos os grupos, mesmo num grupo com 1 item.
    // Exceção no tablet: tabela com 5 ou 6 colunas fixas (ex.: 5 linhas na visão por
    // subcategoria) usa todas numa fileira só, em vez de quebrar 4 + 1.
    const colunas = g.fileiras && !estreito ? Math.max(porFileira, Math.min(g.colunas, 6)) : porFileira;
    let celulas = [];
    if (g.fileiras) {
      // Linha: cada fileira tem um lugar fixo por tipo; lugar sem produto fica vazio.
      // Completa a fileira até o fim da grade, para a próxima começar alinhada.
      // (só a 1ª fileira mostra o lugar vazio; as seguintes, de produtos com mais de uma variação, não)
      g.fileiras.forEach((fileira, k) => {
        celulas.push(...fileira.map((it) => (it ? botaoItem(it) : k === 0 ? vaga : encher)));
        const sobra = (colunas - (fileira.length % colunas)) % colunas;
        for (let i = 0; i < sobra; i++) celulas.push(encher);
      });
    } else {
      celulas = g.itens.map(botaoItem);
    }
    return `
      <section class="grupo-venda">
        <h3 class="grupo-titulo">${esc(g.titulo)}${g.descricao ? ` <span class="grupo-descricao">· ${esc(g.descricao)}</span>` : ''}</h3>
        <div class="grupo-itens" style="grid-template-columns:repeat(${colunas}, minmax(0, 1fr))">${celulas.join('')}</div>
      </section>`;
  }

  function desenharProdutos() {
    const nav = $('#navegacao'), grade = $('#grade');
    const porFileira = estreito ? 2 : 4;
    const t = busca.toLowerCase();
    grade.classList.toggle('so-texto', soTexto);
    if (t) {
      nav.innerHTML = `<span class="sub">Resultado da busca</span>`;
      const achados = [];
      for (const p of produtos) for (const v of p.variacoes) {
        if (p.nome.toLowerCase().includes(t) || (v.nome || '').toLowerCase().includes(t) || v.codigo.includes(t) || (descricaoLinha.get(v.linhaEfetiva) || '').toLowerCase().includes(t)) achados.push({ p, v, nome: p.nome, sub: v.nome || '' });
      }
      grade.innerHTML = achados.length ? desenharGrupo({ titulo: `${achados.length} ${achados.length === 1 ? 'item' : 'itens'}`, itens: achados }, porFileira)
        : '<p class="sub vazio-grade">Nenhum produto encontrado.</p>';
      return;
    }
    nav.innerHTML = `${botoesCategoria.length > 1 ? `<div class="chips chips-venda" role="group" aria-label="Categorias">
      ${botoesCategoria.map((c) => `<button type="button" class="chip" aria-pressed="${c.id === categoriaAtual}" data-categoria="${esc(c.id)}">${esc(c.nome)}</button>`).join('')}
    </div>` : '<span class="espaco"></span>'}
      <button type="button" class="btn-icone btn-exibicao" id="exibicao" aria-label="Exibição: ${verPor === 'linha' ? 'por linha' : 'por subcategoria'}${soTexto ? ', só texto' : ''}" title="Exibição">${icones.ajustes}</button>`;
    const daCategoria = (id) => montarGrupos(produtos.filter((p) => categoriaDe(p) === id), tipos, linhas, verPor);
    if (categoriaAtual === TODOS) {
      // Todas as categorias, uma embaixo da outra, com o nome no título
      grade.innerHTML = botoesCategoria.filter((c) => c.id !== TODOS).map((c) => {
        const gs = daCategoria(c.id);
        return gs.length ? `<h2 class="categoria-venda">${esc(c.nome)}</h2>${gs.map((g) => desenharGrupo(g, porFileira)).join('')}` : '';
      }).join('');
      return;
    }
    const grupos = daCategoria(categoriaAtual);
    grade.innerHTML = grupos.length ? grupos.map((g) => desenharGrupo(g, porFileira)).join('') : '<p class="sub vazio-grade">Nenhum produto nesta categoria.</p>';
  }

  // Janela Exibição: Ver por (linha/subcategoria) e botões com foto ou só texto.
  // Cada toque já muda a tela por trás; a escolha fica lembrada no aparelho.
  function abrirExibicao() {
    const d = abrirJanela(`
      <h2>Exibição</h2>
      ${comLinhas ? `<div class="campo" style="margin-top:12px">
        <span class="rotulo" id="r-ver">Ver por</span>
        <div class="segmentos" role="radiogroup" aria-labelledby="r-ver">
          <label><input type="radio" name="ver" value="linha" ${verPor === 'linha' ? 'checked' : ''}><span>Linha</span></label>
          <label><input type="radio" name="ver" value="subcategoria" ${verPor === 'subcategoria' ? 'checked' : ''}><span>Subcategoria</span></label>
        </div>
        <span class="dica">Por linha: um grupo por linha (o kit Umeboshi junto). Por subcategoria: um grupo por subcategoria (todos os shampoos juntos).</span>
      </div>` : ''}
      <div class="campo" style="margin-top:16px">
        <span class="rotulo" id="r-botoes">Botões</span>
        <div class="segmentos" role="radiogroup" aria-labelledby="r-botoes">
          <label><input type="radio" name="botoes" value="foto" ${soTexto ? '' : 'checked'}><span>Com foto</span></label>
          <label><input type="radio" name="botoes" value="texto" ${soTexto ? 'checked' : ''}><span>Só texto</span></label>
        </div>
        <span class="dica">Só texto: botões menores, para caber mais produtos na tela.</span>
      </div>
      <div class="acoes"><button type="button" class="btn primario" id="pronto">Pronto</button></div>`);
    d.addEventListener('change', (e) => {
      if (e.target.name === 'ver') { verPor = e.target.value; gravarLocal(CHAVE_VER, verPor); }
      if (e.target.name === 'botoes') { soTexto = e.target.value === 'texto'; gravarLocal(CHAVE_TEXTO, soTexto ? '1' : '0'); }
      desenharProdutos();
    });
    d.querySelector('#pronto').addEventListener('click', () => d.close());
  }

  $('#navegacao').addEventListener('click', (e) => {
    if (e.target.closest('#exibicao')) { abrirExibicao(); return; }
    const b = e.target.closest('[data-categoria]');
    if (!b) return;
    categoriaAtual = b.dataset.categoria; gravarLocal(CHAVE_CATEGORIA, categoriaAtual);
    desenharProdutos(); $('#grade').scrollTop = 0;
  });
  $('#grade').addEventListener('click', (e) => {
    const b = e.target.closest('[data-v]');
    if (!b) return;
    for (const p of produtos) { const v = p.variacoes.find((x) => x.id === b.dataset.v); if (v) { adicionar(p, v); return; } }
  });
  // Girar a tela ou mudar o tamanho da janela: redesenha só se mudar de celular para tablet (ou o contrário)
  const observador = new ResizeObserver(() => {
    const grade = $('#grade');
    if (!grade) return;   // a tela já foi trocada
    const agora = grade.clientWidth < 520;
    if (agora !== estreito) { estreito = agora; desenharProdutos(); }
  });
  observador.observe($('#grade'));
  estreito = $('#grade').clientWidth < 520;
  $('#busca').addEventListener('input', (e) => { busca = e.target.value.trim(); desenharProdutos(); });
  $('#busca').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const texto = e.target.value.trim();
    if (texto) { lerCodigo(texto); e.target.value = ''; busca = ''; desenharProdutos(); }
  });

  // ---------- Adicionar produtos ----------
  function adicionar(p, v) {
    esconderLivre();
    const item = adicionarItem(p, v);
    som.item();
    desenharCarrinho(item.chave);
  }

  async function lerCodigo(codigo) {
    if (document.querySelector('dialog[open]')) return; // janela aberta: ignora leitura
    const v = await buscarPorCodigo(codigo);
    const p = v && produtos.find((x) => x.id === v.produtoId);
    if (p) { adicionar(p, p.variacoes.find((x) => x.id === v.id) || v); return; }
    som.erro();
    aviso(v ? 'Produto desativado para venda.' : `Código ${codigo} não cadastrado.`, {
      tipo: 'erro',
      acao: v || caixaModo ? undefined : 'Cadastrar',
      aoClicar: () => { location.hash = `#/produtos/novo?codigo=${encodeURIComponent(codigo)}`; }
    });
  }

  // ---------- Carrinho ----------
  async function desenharCarrinho(destacar) {
    const { subtotal, descontoVenda, total, quantidade } = calcularTotais();
    const { numero } = await proximoNumeroVenda();
    $('#numero-venda').textContent = `${numero} · ${evento.nome}`;   // o evento sempre à vista
    $('#itens').innerHTML = carrinho.itens.length ? carrinho.itens.map((i) => {
      const c = calcularItem(i);
      return `
        <li><button type="button" class="item-carrinho ${i.chave === destacar ? 'novo' : ''}" data-item="${i.chave}">
          <span class="qtd num">${i.quantidade}×</span>
          <span class="descr"><strong>${esc(i.nome)}</strong>${i.variacaoNome ? `<span>${esc(i.variacaoNome)}</span>` : ''}
            ${i.brinde ? '<span class="etiqueta marca">Brinde</span>' : c.desconto ? `<span class="desc num">− ${dinheiro(c.desconto)} desconto</span>` : ''}</span>
          <span class="valor num">${i.brinde ? '<s>' + dinheiro(c.bruto) + '</s>' : dinheiro(c.total)}</span>
        </button></li>`;
    }).join('') : `<li class="carrinho-vazio">${carrinho.troca ? 'Agora adicione os produtos que o cliente vai levar.' : 'Toque num produto ou leia um código para começar.'}</li>`;

    $('#desconto-venda').innerHTML = descontoVenda
      ? `<span>Desconto${carrinho.descontoVenda.tipo === '%' ? ` (${(carrinho.descontoVenda.valor / 100).toLocaleString('pt-BR')}%)` : ''}</span><span class="num">− ${dinheiro(descontoVenda)}</span>`
      : `<span>${icones.mais} Desconto na venda</span><span class="num sub">${dinheiro(subtotal)}</span>`;
    $('#desconto-venda').hidden = !carrinho.itens.length;
    const troca = carrinho.troca;
    $('#titulo-carrinho').textContent = troca ? 'Troca' : 'Venda';
    $('#faixa-troca').hidden = !troca;
    $('#linha-credito').hidden = !troca;
    if (troca) {
      $('#faixa-troca').innerHTML = `<span><strong>Troca da ${esc(troca.origemNumero)}</strong><br><span class="sub">${troca.devolvidos.map((x) => `${x.quantidade}× ${esc(x.nome)}${x.variacaoNome ? ` (${esc(x.variacaoNome)})` : ''}`).join(', ')}</span></span>`;
      $('#linha-credito').innerHTML = `<span>Crédito da troca</span><span class="num">− ${dinheiro(troca.credito)}</span>`;
    }
    // Na troca, o total pode ficar negativo: é a diferença a devolver ao cliente
    // Pagamentos já lançados na cobrança (venda não finalizada)
    const pago = totalPago();
    $('#linha-pago').hidden = !pago;
    if (pago) $('#linha-pago').innerHTML = `<span>Já pago (${esc([...new Set(carrinho.pagamentos.map((x) => x.formaNome))].join(' e '))})</span><span class="num">${dinheiro(pago)}</span>`;
    $('#rotulo-total').textContent = troca ? (total < 0 ? 'A devolver' : 'Diferença') : 'Total';
    $('#total').textContent = dinheiro(Math.abs(total));
    $('#cobrar').textContent = troca ? (total > 0 ? `Cobrar ${dinheiro(total)}` : total < 0 ? `Devolver ${dinheiro(-total)}` : 'Finalizar troca')
      : carrinho.itens.length ? (pago ? `Cobrar o restante ${dinheiro(Math.max(total - pago, 0))}` : `Cobrar ${dinheiro(total)}`) : 'Cobrar';
    $('#cobrar').disabled = !troca && !carrinho.itens.length;
    $('#limpar').hidden = !troca && !carrinho.itens.length;
    $('#limpar').textContent = troca ? 'Desistir' : 'Limpar';
    $('#barra-qtd').textContent = quantidade ? `${quantidade} ${quantidade === 1 ? 'item' : 'itens'}${carrinho.troca ? ' · troca' : ''}` : carrinho.troca ? 'Troca' : 'Carrinho vazio';
    $('#barra-total').textContent = (total < 0 ? '−' : '') + dinheiro(Math.abs(total));
    if (destacar) {
      const novo = el.querySelector('.item-carrinho.novo');
      if (novo) novo.scrollIntoView({ block: 'nearest' });
    }
    guardarCarrinho();   // grava no aparelho: se o app fechar, a venda é recuperada
  }

  $('#itens').addEventListener('click', (e) => {
    const b = e.target.closest('[data-item]');
    if (b) editarItem(carrinho.itens.find((i) => i.chave === b.dataset.item));
  });

  // Ajustes de um item: quantidade, desconto, brinde, remover
  function editarItem(item) {
    if (!item) return;
    const d = abrirJanela(`
      <form method="dialog" novalidate>
        <h2>${esc(item.nome)}</h2>
        ${item.variacaoNome ? `<p>${esc(item.variacaoNome)}</p>` : ''}
        <div class="quantidade" style="margin-top:16px">
          <button type="button" class="btn-icone grande" id="menos" aria-label="Diminuir">−</button>
          <strong class="num" id="qtd">${item.quantidade}</strong>
          <button type="button" class="btn-icone grande" id="mais" aria-label="Aumentar">+</button>
        </div>
        <div class="campo" style="margin-top:16px">
          <span class="rotulo">Desconto neste item</span>
          <div class="linha-desconto-campo">
            <div class="segmentos" role="radiogroup" aria-label="Tipo de desconto">
              <label><input type="radio" name="tipo" value="R$" ${!item.desconto || item.desconto.tipo === 'R$' ? 'checked' : ''}><span>R$</span></label>
              <label><input type="radio" name="tipo" value="%" ${item.desconto && item.desconto.tipo === '%' ? 'checked' : ''}><span>%</span></label>
            </div>
            <input class="entrada" id="valor-desconto" aria-label="Valor do desconto">
          </div>
        </div>
        <label class="interruptor" style="margin-top:8px">
          <span><strong>Brinde</strong><br><span class="sub">Sai sem cobrar; aparece no relatório de brindes.</span></span>
          <input type="checkbox" id="brinde" ${item.brinde ? 'checked' : ''}>
        </label>
        <p class="resumo-item num" id="resumo"></p>
        <div class="acoes">
          <button type="button" class="btn texto perigo" id="remover" style="margin-right:auto">Remover</button>
          <button type="submit" class="btn primario">Pronto</button>
        </div>
      </form>`, { classe: 'janela-item' });
    let qtd = item.quantidade;
    const tipo = () => d.querySelector('input[name="tipo"]:checked').value;
    // Troca o campo de valor conforme o tipo (R$ ou %), começando com o valor informado
    const prepararCampo = (valor) => {
      const velho = d.querySelector('#valor-desconto');
      const novo = velho.cloneNode(); velho.replaceWith(novo);
      if (tipo() === '%') campoPercentual(novo); else campoDinheiro(novo);
      novo.placeholder = tipo() === '%' ? '0,00 %' : 'R$ 0,00';
      escreverCentavos(novo, valor);
      novo.addEventListener('input', resumo);
    };
    const campoAtual = () => d.querySelector('#valor-desconto');
    const simulado = () => ({ ...item, quantidade: qtd, brinde: d.querySelector('#brinde').checked, desconto: lerCentavos(campoAtual()) ? { tipo: tipo(), valor: lerCentavos(campoAtual()) } : null });
    function resumo() {
      const c = calcularItem(simulado());
      d.querySelector('#qtd').textContent = qtd;
      d.querySelector('#resumo').textContent = simulado().brinde ? `Brinde: ${dinheiro(c.bruto)} sem cobrar` : `${qtd} × ${dinheiro(item.precoUnit)} = ${dinheiro(c.bruto)}${c.desconto ? `  −  ${dinheiro(c.desconto)}  =  ${dinheiro(c.total)}` : ''}`;
    }
    prepararCampo(item.desconto ? item.desconto.valor : null);
    d.querySelectorAll('input[name="tipo"]').forEach((r) => r.addEventListener('change', () => { prepararCampo(null); resumo(); }));
    d.querySelector('#menos').addEventListener('click', () => { if (qtd > 1) { qtd -= 1; resumo(); } });
    d.querySelector('#mais').addEventListener('click', () => { qtd += 1; resumo(); });
    d.querySelector('#brinde').addEventListener('change', resumo);
    d.querySelector('#remover').addEventListener('click', () => { removerItem(item.chave); d.close(); desenharCarrinho(); });
    d.querySelector('form').addEventListener('submit', (e) => {
      e.preventDefault();
      const s = simulado();
      Object.assign(item, { quantidade: s.quantidade, brinde: s.brinde, desconto: s.brinde ? null : s.desconto });
      d.close();
      desenharCarrinho();
    });
    resumo();
  }

  // Desconto na venda inteira
  $('#desconto-venda').addEventListener('click', () => {
    const atual = carrinho.descontoVenda;
    const { subtotal } = calcularTotais();
    const d = abrirJanela(`
      <form method="dialog" novalidate>
        <h2>Desconto na venda</h2>
        <p class="num">Subtotal: ${dinheiro(subtotal)}</p>
        <div class="linha-desconto-campo" style="margin-top:16px">
          <div class="segmentos" role="radiogroup" aria-label="Tipo de desconto">
            <label><input type="radio" name="tipo" value="R$" ${!atual || atual.tipo === 'R$' ? 'checked' : ''}><span>R$</span></label>
            <label><input type="radio" name="tipo" value="%" ${atual && atual.tipo === '%' ? 'checked' : ''}><span>%</span></label>
          </div>
          <input class="entrada" id="valor-desconto" aria-label="Valor do desconto">
        </div>
        <p class="resumo-item num" id="resumo"></p>
        <div class="acoes">
          ${atual ? '<button type="button" class="btn texto perigo" id="tirar" style="margin-right:auto">Tirar desconto</button>' : ''}
          <button type="button" class="btn" value="x">Cancelar</button>
          <button type="submit" class="btn primario">Aplicar</button>
        </div>
      </form>`);
    const tipo = () => d.querySelector('input[name="tipo"]:checked').value;
    const preparar = (valor) => {
      const velho = d.querySelector('#valor-desconto');
      const novo = velho.cloneNode(); velho.replaceWith(novo);
      if (tipo() === '%') campoPercentual(novo); else campoDinheiro(novo);
      novo.placeholder = tipo() === '%' ? '0,00 %' : 'R$ 0,00';
      escreverCentavos(novo, valor);
      novo.addEventListener('input', resumo);
      novo.focus();
    };
    function resumo() {
      const v = lerCentavos(d.querySelector('#valor-desconto'));
      const desc = v ? (tipo() === '%' ? Math.min(Math.round(subtotal * v / 10000), subtotal) : Math.min(v, subtotal)) : 0;
      d.querySelector('#resumo').textContent = desc ? `${dinheiro(subtotal)} − ${dinheiro(desc)} = ${dinheiro(subtotal - desc)}` : '';
    }
    preparar(atual ? atual.valor : null);
    resumo();
    d.querySelectorAll('input[name="tipo"]').forEach((r) => r.addEventListener('change', () => { preparar(null); resumo(); }));
    d.querySelector('[value="x"]').addEventListener('click', () => d.close());
    if (d.querySelector('#tirar')) d.querySelector('#tirar').addEventListener('click', () => { carrinho.descontoVenda = null; d.close(); desenharCarrinho(); });
    d.querySelector('form').addEventListener('submit', (e) => {
      e.preventDefault();
      const v = lerCentavos(d.querySelector('#valor-desconto'));
      carrinho.descontoVenda = v ? { tipo: tipo(), valor: v } : null;
      d.close();
      desenharCarrinho();
    });
  });

  $('#limpar').addEventListener('click', () => {
    const d = carrinho.troca
      ? abrirJanela(`<h2>Desistir da troca?</h2><p>A troca da ${esc(carrinho.troca.origemNumero)} não será registrada e o carrinho fica vazio.</p>
        <div class="acoes"><button class="btn" value="nao">Continuar a troca</button><button class="btn primario perigo" value="sim">Desistir</button></div>`)
      : abrirJanela(`<h2>Limpar o carrinho?</h2><p>Todos os itens desta venda serão removidos.</p>
        ${totalPago() ? `<p><strong>Os ${dinheiro(totalPago())} já lançados (${esc(textoPagamento(carrinho))}) também serão descartados.</strong> Devolva ao cliente ou estorne na maquininha.</p>` : ''}
        <div class="acoes"><button class="btn" value="nao">Cancelar</button><button class="btn primario perigo" value="sim">Limpar</button></div>`);
    d.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
      if (b.value === 'sim') { limparCarrinho(); desenharCarrinho(); }
      d.close();
    }));
  });

  // Celular: abrir e fechar o carrinho
  $('#barra-carrinho').addEventListener('click', () => $('#carrinho').classList.add('aberto'));
  $('#fechar-carrinho').addEventListener('click', () => $('#carrinho').classList.remove('aberto'));

  // ---------- Cobrar ----------
  $('#cobrar').addEventListener('click', async () => {
    const { total } = calcularTotais();
    const concluida = carrinho.troca && total <= 0
      ? await finalizarTrocaSemCobranca({ evento, caixa, pagoCom: carrinho.troca.pagoCom })
      : await abrirCobranca({ evento, caixa });
    // (se a pessoa já saiu da tela Vender, não há o que redesenhar)
    if (!el.isConnected || !$('#carrinho')) return;
    if (concluida) {
      $('#carrinho').classList.remove('aberto');
      ultimaConcluida = concluida;
      mostrarLivre();
    }
    desenharCarrinho();   // (pagamentos lançados e mantidos ao sair da cobrança aparecem no carrinho)
  });

  // ---------- Caixa livre ----------
  function mostrarLivre() {
    const c = ultimaConcluida;
    if (!c) return;
    const r = c.registro;
    let titulo, linha;
    if (c.abertura) {
      titulo = 'Caixa aberto';
      linha = `Troco inicial ${dinheiro(c.abertura.trocoInicial || 0)} · ${esc(evento.nome)}`;
    } else if (c.saida) {
      titulo = c.saida.tipo === 'avaria' ? 'Avaria registrada' : 'Brinde registrado';
      linha = `${c.saida.pecas} ${c.saida.pecas === 1 ? 'peça' : 'peças'}${c.saida.motivo ? ` · ${esc(c.saida.motivo)}` : ''}`;
    } else {
      const nome = r.tipo === 'troca' ? 'Troca' : r.tipo === 'devolucao' ? 'Devolução' : 'Venda';
      titulo = `${nome} ${esc(r.numero)} concluída`;
      const partes = [];
      if (c.devolver) partes.push(`Devolvido ${dinheiro(c.devolver)}`);
      else partes.push(dinheiro(Math.abs(r.total)));
      const formas = textoPagamento(r);
      if (formas) partes.push(esc(formas));
      const aMais = (r.pagamentos || []).reduce((s, x) => s + (x.aMais || 0), 0);
      if (aMais) partes.push(`<strong>${dinheiro(aMais)} a mais, sem troco</strong>`);
      if (r.troco) partes.push(`<strong>Troco ${(r.pagamentos || []).some((x) => x.trocoEmDinheiro) ? 'em dinheiro ' : ''}${dinheiro(r.troco)}</strong>`);
      linha = partes.join(' · ');
    }
    const p = $('#caixa-livre');
    p.innerHTML = `
      <div class="cl-conteudo">
        <div class="cl-ultima">
          <div class="marca-ok pequena" aria-hidden="true">✓</div>
          <div><strong>${titulo}</strong><br><span class="num">${linha}</span></div>
        </div>
        <p class="cl-livre">${c.abertura ? 'Pronto para vender' : 'Caixa livre'}</p>
        <p class="sub">Leia um código ou toque para ${c.abertura ? 'o primeiro' : 'o próximo'} cliente</p>
        <div class="acoes" style="justify-content:center;flex-wrap:wrap">
          ${r && r.id ? `<a class="btn" href="#/vendas/${encodeURIComponent(r.id)}" id="ver-venda">Ver venda</a>` : ''}
          <button type="button" class="btn primario" id="proximo">${c.abertura ? 'Começar a vender' : 'Próximo cliente'}</button>
        </div>
      </div>`;
    p.hidden = false;
    el.querySelector('.venda').classList.add('com-livre');
  }
  function esconderLivre() {
    ultimaConcluida = null;
    const p = $('#caixa-livre');
    if (!p || p.hidden) return;
    p.hidden = true;
    el.querySelector('.venda').classList.remove('com-livre');
  }
  // Tocar em qualquer lugar do painel (menos "Ver venda") volta para os produtos
  $('#caixa-livre').addEventListener('click', (e) => {
    if (e.target.closest('#ver-venda')) { ultimaConcluida = null; return; }
    esconderLivre();
  });

  desenharProdutos();
  desenharCarrinho();
  if (ultimaConcluida && !carrinho.itens.length && !carrinho.troca) mostrarLivre(); else ultimaConcluida = null;
  const pararLeitor = ouvirLeitor(lerCodigo);

  // Venda que estava em andamento quando o app fechou: continuar ou descartar
  if (carrinho.recuperada) {
    const { total, quantidade } = calcularTotais();
    const pago = totalPago();
    const quando = new Date(carrinho.recuperada.em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    carrinho.recuperada = null;
    const d = abrirJanela(`
      <h2>${carrinho.troca ? 'Troca' : 'Venda'} em andamento recuperada</h2>
      <p>O app fechou no meio de ${carrinho.troca ? `uma troca da ${esc(carrinho.troca.origemNumero)}` : 'uma venda'} (${quando}):
        <strong class="num">${quantidade} ${quantidade === 1 ? 'item' : 'itens'} · ${dinheiro(Math.abs(total))}</strong>${pago ? `, com <strong class="num">${dinheiro(pago)}</strong> já pagos (${esc(textoPagamento(carrinho))})` : ''}.</p>
      ${pago ? '<p class="sub">Se descartar, devolva ao cliente o que ele já pagou.</p>' : ''}
      <div class="acoes">
        <button type="button" class="btn texto perigo" id="descartar" style="margin-right:auto">Descartar</button>
        <button type="button" class="btn primario" id="continuar">Continuar</button>
      </div>`);
    d.querySelector('#continuar').addEventListener('click', () => d.close());
    d.querySelector('#descartar').addEventListener('click', () => { limparCarrinho(); d.close(); desenharCarrinho(); });
  }

  return () => {
    pararLeitor();
    observador.disconnect();
    urls.forEach(URL.revokeObjectURL);
    el.classList.remove('tela-venda');
    document.body.classList.remove('em-venda');
  };
}
