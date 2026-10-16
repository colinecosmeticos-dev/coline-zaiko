// =========================================================
// Tela Vender.
// Esquerda: busca/leitor e produtos (modo Categorias ou Produtos).
// Direita: carrinho, desconto da venda, total e botão Cobrar.
// No celular, o carrinho vira uma barra no rodapé.
// =========================================================
import { db, lerAparelho, lerEventoAtivo, caixaAbertoDoEvento, caixaDoDia, listarCategorias, listarProdutosCompletos, buscarPorCodigo, proximoNumeroVenda } from '../db.js';
import { esc, dinheiro, iniciais, icones, aviso, abrirJanela, campoDinheiro, campoPercentual, lerCentavos, escreverCentavos, hojeISO } from '../ui.js';
import { ouvirLeitor } from '../leitor.js';
import { som } from '../sons.js';
import { quadradoCor } from '../cores.js';
import { carrinho, adicionarItem, removerItem, calcularItem, calcularTotais, limparCarrinho } from '../venda/carrinho.js';
import { pedirAberturaCaixa } from '../venda/abrir-caixa.js';
import { abrirCobranca, finalizarTrocaSemCobranca } from '../venda/cobrar.js';

const CHAVE_MODO = 'zaiko-modo-venda';
// Plural simples para nomes de atributo: fragrância → fragrâncias, cor → cores, opção → opções
function plural(p, n) {
  if (n === 1 || /s$/.test(p)) return p;
  if (/ão$/.test(p)) return p.replace(/ão$/, 'ões');
  if (/[rz]$/.test(p)) return p + 'es';
  if (/l$/.test(p)) return p.replace(/l$/, 'is');
  return p + 's';
}
const lerModo = () => { try { return localStorage.getItem(CHAVE_MODO) || 'categorias'; } catch (e) { return 'categorias'; } };
const gravarModo = (m) => { try { localStorage.setItem(CHAVE_MODO, m); } catch (e) { /* ok */ } };

export async function render(el) {
  // ---------- Pré-requisitos ----------
  const aparelho = await lerAparelho();
  const evento = await lerEventoAtivo();
  const totalProdutos = await db.produtos.count();
  const falta = !aparelho ? ['Identifique este aparelho', 'Dê nome e sigla ao aparelho; a sigla vai no número de cada venda.', '#/configuracoes', 'Configurar aparelho']
    : !evento ? ['Escolha o evento', 'As vendas ficam guardadas dentro de um evento.', '#/eventos', 'Ir para Eventos']
    : !totalProdutos ? ['Cadastre os produtos', 'A tela de venda mostra os produtos do catálogo.', '#/produtos/novo', 'Cadastrar produto']
    : null;
  if (falta) {
    el.innerHTML = `<header class="cab"><h1>Vender</h1></header>
      <div class="cartao vazio"><div class="simbolo" aria-hidden="true">在庫</div><h2>${falta[0]}</h2><p>${falta[1]}</p><a class="btn primario" href="${falta[2]}">${falta[3]}</a></div>`;
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
    bloquear('Feche o caixa anterior', `O caixa de ${new Date(caixa.data + 'T12:00').toLocaleDateString('pt-BR')} ainda está aberto. Feche-o (com a contagem do dinheiro) para abrir o de hoje.`, '<a class="btn primario" href="#/caixa">Ir para o Caixa</a>');
    return;
  }
  if (!caixa) {
    const deHoje = await caixaDoDia(evento.id, hojeISO());
    if (deHoje) {
      bloquear('Caixa de hoje fechado', 'Para voltar a vender, reabra o caixa na tela Caixa.', '<a class="btn primario" href="#/caixa">Ir para o Caixa</a>');
      return;
    }
    const novo = await pedirAberturaCaixa(evento);
    if (!novo) {
      bloquear('Caixa fechado', 'Abra o caixa do dia para começar a vender.', '<button class="btn primario" id="abrir">Abrir caixa</button>');
      el.querySelector('#abrir').addEventListener('click', () => render(el));
      return;
    }
    caixa = novo;
    aviso('Caixa aberto. Boas vendas!');
  }

  // ---------- Dados ----------
  const categorias = await listarCategorias();
  // Preço do evento: onde houver, substitui o preço normal (que fica guardado em precoBase)
  const precosEvento = evento.precos || {};
  const produtos = (await listarProdutosCompletos()).filter((p) => p.ativo && p.variacoes.length)
    .map((p) => ({ ...p, variacoes: p.variacoes.map((v) => {
      const normal = v.preco ?? p.preco;
      const doEvento = precosEvento[v.id];
      return doEvento != null && doEvento !== normal ? { ...v, preco: doEvento, precoBase: normal } : v;
    }) }));
  const urls = [];
  const urlFoto = (blob) => { const u = URL.createObjectURL(blob); urls.push(u); return u; };
  const fotoCategoria = new Map(categorias.filter((c) => c.foto).map((c) => [c.id, urlFoto(c.foto)]));
  const fotoProduto = new Map(produtos.filter((p) => p.foto).map((p) => [p.id, urlFoto(p.foto)]));

  let modo = lerModo();          // 'categorias' | 'produtos'
  let categoriaAberta = null;    // id da categoria aberta no modo Categorias ('' = todas)
  let filtroCategoria = '';      // filtro de chips no modo Produtos
  let busca = '';

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
          <div class="segmentos" role="radiogroup" aria-label="Mostrar">
            <label><input type="radio" name="modo" value="categorias" ${modo === 'categorias' ? 'checked' : ''}><span>Categorias</span></label>
            <label><input type="radio" name="modo" value="produtos" ${modo === 'produtos' ? 'checked' : ''}><span>Produtos</span></label>
          </div>
        </div>
        <div class="venda-navegacao" id="navegacao"></div>
        <div class="venda-grade" id="grade"></div>
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
  function produtosVisiveis() {
    const t = busca.toLowerCase();
    if (t) return produtos.filter((p) => p.nome.toLowerCase().includes(t) || p.variacoes.some((v) => v.nome.toLowerCase().includes(t) || v.codigo.includes(t)));
    if (modo === 'categorias') return categoriaAberta === '' ? produtos : produtos.filter((p) => p.categoriaId === categoriaAberta);
    return filtroCategoria ? produtos.filter((p) => p.categoriaId === filtroCategoria) : produtos;
  }

  function cartaoProduto(p) {
    const precos = p.variacoes.map((v) => v.preco ?? p.preco);
    const min = Math.min(...precos), max = Math.max(...precos);
    const temVar = p.variacoes.length > 1 || p.variacoes[0].nome;
    const normais = p.variacoes.map((v) => v.precoBase ?? v.preco ?? p.preco);
    const minNormal = Math.min(...normais);
    const especial = p.variacoes.some((v) => v.precoBase != null);
    return `
      <button type="button" class="ladrilho" data-produto="${esc(p.id)}">
        <span class="ladrilho-foto">${fotoProduto.has(p.id) ? `<img src="${fotoProduto.get(p.id)}" alt="">` : `<span>${iniciais(p.nome)}</span>`}</span>
        <span class="ladrilho-nome">${esc(p.nome)}</span>
        ${especial ? `<span class="ladrilho-especial"><s class="num">${dinheiro(minNormal)}</s> preço do evento</span>` : ''}
        <span class="ladrilho-info"><strong class="num">${min === max ? dinheiro(min) : `${dinheiro(min)}+`}</strong>${temVar ? `<span>${p.variacoes.length} ${esc(plural((p.atributo || 'opção').toLowerCase(), p.variacoes.length))}</span>` : ''}</span>
      </button>`;
  }

  function desenharProdutos() {
    const nav = $('#navegacao'), grade = $('#grade');
    const categoriasComProduto = categorias.filter((c) => produtos.some((p) => p.categoriaId === c.id));

    if (!busca && modo === 'categorias' && categoriaAberta === null) {
      nav.innerHTML = '';
      grade.className = 'venda-grade grade-categorias';
      grade.innerHTML = [
        ...categoriasComProduto.map((c) => `
          <button type="button" class="ladrilho ladrilho-categoria" data-categoria="${esc(c.id)}">
            <span class="ladrilho-foto">${fotoCategoria.has(c.id) ? `<img src="${fotoCategoria.get(c.id)}" alt="">` : `<span>${iniciais(c.nome)}</span>`}</span>
            <span class="ladrilho-nome">${esc(c.nome)}</span>
          </button>`),
        `<button type="button" class="ladrilho ladrilho-categoria todos" data-categoria=""><span class="ladrilho-foto"><span>${icones.grade}</span></span><span class="ladrilho-nome">Todos os produtos</span></button>`
      ].join('');
      return;
    }

    if (busca) {
      nav.innerHTML = `<span class="sub">Resultado da busca</span>`;
    } else if (modo === 'categorias') {
      const nome = categoriaAberta === '' ? 'Todos os produtos' : (categorias.find((c) => c.id === categoriaAberta) || {}).nome || 'Sem categoria';
      nav.innerHTML = `<button type="button" class="btn texto" id="voltar-categorias">${icones.voltar} Categorias</button><strong>${esc(nome)}</strong>`;
      $('#voltar-categorias').addEventListener('click', () => { categoriaAberta = null; desenharProdutos(); });
    } else {
      nav.innerHTML = `<div class="chips">
        <button type="button" class="chip" aria-pressed="${filtroCategoria === ''}" data-filtro="">Todas</button>
        ${categoriasComProduto.map((c) => `<button type="button" class="chip" aria-pressed="${filtroCategoria === c.id}" data-filtro="${esc(c.id)}">${esc(c.nome)}</button>`).join('')}
      </div>`;
      nav.querySelectorAll('[data-filtro]').forEach((b) => b.addEventListener('click', () => { filtroCategoria = b.dataset.filtro; desenharProdutos(); }));
    }
    const lista = produtosVisiveis();
    grade.className = 'venda-grade';
    grade.innerHTML = lista.length ? lista.map(cartaoProduto).join('') : '<p class="sub vazio-grade">Nenhum produto encontrado.</p>';
  }

  $('#grade').addEventListener('click', (e) => {
    const cat = e.target.closest('[data-categoria]');
    if (cat) { categoriaAberta = cat.dataset.categoria; desenharProdutos(); $('#grade').scrollTop = 0; return; }
    const prod = e.target.closest('[data-produto]');
    if (prod) escolherProduto(produtos.find((p) => p.id === prod.dataset.produto));
  });
  el.querySelectorAll('input[name="modo"]').forEach((r) => r.addEventListener('change', () => {
    modo = r.value; gravarModo(modo); categoriaAberta = null; desenharProdutos();
  }));
  $('#busca').addEventListener('input', (e) => { busca = e.target.value.trim(); desenharProdutos(); });
  $('#busca').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const texto = e.target.value.trim();
    if (texto) { lerCodigo(texto); e.target.value = ''; busca = ''; desenharProdutos(); }
  });

  // ---------- Adicionar produtos ----------
  function escolherProduto(p) {
    if (!p) return;
    if (p.variacoes.length === 1 && !p.variacoes[0].nome) return adicionar(p, p.variacoes[0]);
    const d = abrirJanela(`
      <h2>${esc(p.nome)}</h2>
      <p>Escolha ${esc((p.atributo || 'a opção').toLowerCase())}:</p>
      <div class="grade-variacoes">
        ${p.variacoes.map((v) => `
          <button type="button" class="btn botao-variacao" data-variacao="${esc(v.id)}">
            <span class="nome-variacao">${quadradoCor(v.cor)}<span>${esc(v.nome)}</span></span>${v.precoBase != null ? `<small class="num"><s>${dinheiro(v.precoBase)}</s> ${dinheiro(v.preco)}</small>` : (v.preco ?? p.preco) !== p.preco ? `<small class="num">${dinheiro(v.preco)}</small>` : ''}
          </button>`).join('')}
      </div>
      <div class="acoes"><button type="button" class="btn" value="x">Cancelar</button></div>`, { classe: 'janela-variacoes' });
    d.querySelector('[value="x"]').addEventListener('click', () => d.close());
    d.querySelectorAll('[data-variacao]').forEach((b) => b.addEventListener('click', () => {
      adicionar(p, p.variacoes.find((v) => v.id === b.dataset.variacao));
      d.close();
    }));
  }

  function adicionar(p, v) {
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
      acao: v ? undefined : 'Cadastrar',
      aoClicar: () => { location.hash = `#/produtos/novo?codigo=${encodeURIComponent(codigo)}`; }
    });
  }

  // ---------- Carrinho ----------
  async function desenharCarrinho(destacar) {
    const { subtotal, descontoVenda, total, quantidade } = calcularTotais();
    const { numero } = await proximoNumeroVenda();
    $('#numero-venda').textContent = numero;
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
    $('#rotulo-total').textContent = troca ? (total < 0 ? 'A devolver' : 'Diferença') : 'Total';
    $('#total').textContent = dinheiro(Math.abs(total));
    $('#cobrar').textContent = troca ? (total > 0 ? `Cobrar ${dinheiro(total)}` : total < 0 ? `Devolver ${dinheiro(-total)}` : 'Finalizar troca')
      : carrinho.itens.length ? `Cobrar ${dinheiro(total)}` : 'Cobrar';
    $('#cobrar').disabled = !troca && !carrinho.itens.length;
    $('#limpar').hidden = !troca && !carrinho.itens.length;
    $('#limpar').textContent = troca ? 'Desistir' : 'Limpar';
    $('#barra-qtd').textContent = quantidade ? `${quantidade} ${quantidade === 1 ? 'item' : 'itens'}${carrinho.troca ? ' · troca' : ''}` : carrinho.troca ? 'Troca' : 'Carrinho vazio';
    $('#barra-total').textContent = (total < 0 ? '−' : '') + dinheiro(Math.abs(total));
    if (destacar) {
      const novo = el.querySelector('.item-carrinho.novo');
      if (novo) novo.scrollIntoView({ block: 'nearest' });
    }
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
    if (concluida && el.isConnected && $('#carrinho')) {
      $('#carrinho').classList.remove('aberto');
      desenharCarrinho();
    }
  });

  desenharProdutos();
  desenharCarrinho();
  const pararLeitor = ouvirLeitor(lerCodigo);

  return () => {
    pararLeitor();
    urls.forEach(URL.revokeObjectURL);
    el.classList.remove('tela-venda');
    document.body.classList.remove('em-venda');
  };
}
