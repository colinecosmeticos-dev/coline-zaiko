// =========================================================
// Tela de cadastro e edição de produto.
// Endereços:  #/produtos/novo   e   #/produtos/<id>
//
// Um produto pode ser:
//  - sem variações: tem um único código de barras;
//  - com variações: um atributo (ex.: Fragrância) e uma linha por
//    valor (ex.: Lavanda, Rosa), cada uma com seu código e,
//    se quiser, um preço próprio.
// Código em branco = o app gera um código interno ao salvar.
//
// Duplicar (#/produtos/novo?copiar=<id>): abre um cadastro novo já com
// categoria, tipo, linha, preço, custo e variações do produto copiado.
// Não copia foto nem códigos de barras (cada produto tem os seus).
// =========================================================
import { db, novoId, listarCategorias, listarTipos, listarLinhas, buscarPorCodigo } from '../db.js';
import { esc, dinheiro, campoDinheiro, lerCentavos, escreverCentavos, aviso, confirmar, abrirJanela, icones } from '../ui.js';
import { gerarCodigoInterno, normalizarCodigo, ehCodigoInterno } from '../codigos.js';
import { prepararFoto } from '../foto.js';
import { abrirCamera, cameraDisponivel } from '../camera.js';
import { ouvirLeitor } from '../leitor.js';
import { temPin, pedirPin } from '../pin.js';
import { escolherCor, corValida } from '../cores.js';

export async function render(el, { id, consulta }) {
  const editando = !!id;
  const produto = editando ? await db.produtos.get(id) : null;
  // Cópia: o produto de origem serve de modelo para um cadastro novo
  const copiarId = !editando && consulta ? consulta.get('copiar') : null;
  const origem = copiarId ? await db.produtos.get(copiarId) : null;
  const modelo = produto || origem;   // de onde vêm os valores iniciais
  if (editando && !produto) {
    el.innerHTML = `<div class="cartao vazio"><h2>Produto não encontrado</h2><p>Ele pode ter sido excluído.</p><a class="btn" href="#/produtos">Voltar para Produtos</a></div>`;
    return;
  }
  const variacoesSalvas = editando ? (await db.variacoes.where('produtoId').equals(id).toArray()).sort((a, b) => a.ordem - b.ordem) : [];
  // Na cópia: só nome, preço, custo e cor das variações (sem id, código e foto)
  const variacoesOrigem = origem ? (await db.variacoes.where('produtoId').equals(origem.id).toArray()).sort((a, b) => a.ordem - b.ordem)
    .map((v) => ({ nome: v.nome, preco: v.preco, custo: v.custo, cor: v.cor })) : [];
  const categorias = await listarCategorias();
  const tipos = await listarTipos();
  const linhasProduto = await listarLinhas();
  // Custo e lucro só aparecem com o PIN, e só enquanto esta tela está aberta.
  // Sem PIN definido, ficam visíveis.
  const pinDefinido = await temPin();
  const custoLiberado = !pinDefinido;
  // Categoria já marcada ao abrir: a do produto; num cadastro novo, a do último produto salvo
  const idsCategorias = new Set(categorias.map((c) => c.id));
  const sugerida = modelo ? modelo.categoriaId : (consulta && consulta.get('categoria'));
  const categoriaInicial = sugerida && idsCategorias.has(sugerida) ? sugerida : (categorias.length ? '' : '__nova');
  const tipoInicial = modelo && tipos.some((t) => t.id === modelo.tipoId) ? modelo.tipoId : (tipos.length ? '' : '__nova');
  const linhaInicial = modelo && linhasProduto.some((l) => l.id === modelo.linhaId) ? modelo.linhaId : '';
  const temVariacoes = (lista) => lista.length > 1 || !!(lista[0] && lista[0].nome);
  const comVariacoes = editando ? temVariacoes(variacoesSalvas) : temVariacoes(variacoesOrigem);
  const unica = !comVariacoes ? variacoesSalvas[0] : null;
  const codigoInicial = consulta && consulta.get('codigo') ? consulta.get('codigo') : '';

  let fotoBlob = produto ? produto.foto || null : null;
  let urlFoto = null;

  el.innerHTML = `
    <a class="voltar" href="#/produtos">${icones.voltar} Produtos</a>
    <header class="cab"><h1>${editando ? esc(produto.nome) : 'Novo produto'}</h1></header>
    ${origem ? `<div class="cartao aviso-copia">
      <strong>Cópia de ${esc(origem.nome)}</strong>
      <p class="sub">Troque o que muda (por exemplo, a linha: o nome acompanha), coloque a foto e o código de barras, e salve.</p>
    </div>` : ''}

    <form class="form-produto ${custoLiberado ? '' : 'custo-bloqueado'}" novalidate>
      <section class="cartao">
        <h2 style="margin-bottom:16px">Informações</h2>
        <div class="grade-campos">
          <div class="bloco-foto">
            <div class="seletor-foto" id="seletor-foto" aria-hidden="true"></div>
            <div class="acoes-foto">
              <span class="rotulo">Foto</span>
              <span class="dica">O app recorta um quadrado do centro da imagem.</span>
              <div class="botoes-foto">
                <button type="button" class="btn" id="tirar-foto">${icones.camera} Tirar foto</button>
                <button type="button" class="btn" id="galeria-foto">${icones.imagem} Galeria</button>
                <button type="button" class="btn texto perigo" id="remover-foto" hidden>Remover</button>
              </div>
            </div>
            <!-- capture="environment" abre direto a câmera traseira no tablet/celular -->
            <input type="file" accept="image/*" capture="environment" id="arquivo-camera" hidden>
            <input type="file" accept="image/*" id="arquivo-galeria" hidden>
            <input type="file" accept="image/*" capture="environment" id="arquivo-camera-var" hidden>
            <input type="file" accept="image/*" id="arquivo-galeria-var" hidden>
          </div>

          <div class="campo">
            <label for="f-nome">Nome do produto</label>
            <input class="entrada" id="f-nome" maxlength="80" autocomplete="off" value="${esc(modelo ? modelo.nome : '')}">
            <span class="dica">Ao escolher o tipo e a linha abaixo, o app sugere o nome (ex.: Shampoo Umeboshi).</span>
          </div>

          <div class="campo">
            <span class="rotulo" id="r-categoria">Categoria</span>
            <div class="opcoes" role="radiogroup" aria-labelledby="r-categoria">
              ${categorias.map((c) => `<label><input type="radio" name="categoria" value="${esc(c.id)}" ${categoriaInicial === c.id ? 'checked' : ''}><span>${esc(c.nome)}</span></label>`).join('')}
              <label><input type="radio" name="categoria" value="__nova" ${categoriaInicial === '__nova' ? 'checked' : ''}><span>+ Nova categoria</span></label>
            </div>
            <input class="entrada" id="f-categoria-nova" maxlength="40" autocomplete="off" aria-label="Nome da nova categoria" placeholder="Nome da nova categoria (ex.: Capilar)" ${categoriaInicial === '__nova' ? '' : 'hidden'}>
            <span class="dica">${categorias.length ? 'O grupo grande (ex.: Capilar, Corpo e Mãos). Vira o filtro do topo na tela de venda.' : 'Nenhuma categoria cadastrada ainda. Digite o nome da primeira (ex.: Capilar).'}</span>
          </div>

          <div class="campo">
            <span class="rotulo" id="r-tipo">Tipo</span>
            <div class="opcoes" role="radiogroup" aria-labelledby="r-tipo">
              ${tipos.map((t) => `<label><input type="radio" name="tipo" value="${esc(t.id)}" ${tipoInicial === t.id ? 'checked' : ''}><span>${esc(t.nome)}</span></label>`).join('')}
              <label><input type="radio" name="tipo" value="__nova" ${tipoInicial === '__nova' ? 'checked' : ''}><span>+ Novo tipo</span></label>
            </div>
            <input class="entrada" id="f-tipo-nova" maxlength="40" autocomplete="off" aria-label="Nome do novo tipo" placeholder="Nome do novo tipo (ex.: Shampoo)" ${tipoInicial === '__nova' ? '' : 'hidden'}>
            <span class="dica">O que é o produto. Na venda, cada tipo fica sempre na mesma coluna.</span>
          </div>

          <div class="campo">
            <span class="rotulo" id="r-linha">Linha <span class="sub" style="font-weight:400">(opcional)</span></span>
            <div class="opcoes" role="radiogroup" aria-labelledby="r-linha">
              <label><input type="radio" name="linha" value="" ${linhaInicial === '' ? 'checked' : ''}><span>Sem linha</span></label>
              ${linhasProduto.map((l) => `<label><input type="radio" name="linha" value="${esc(l.id)}" ${linhaInicial === l.id ? 'checked' : ''}><span>${esc(l.nome)}</span></label>`).join('')}
              <label><input type="radio" name="linha" value="__nova"><span>+ Nova linha</span></label>
            </div>
            <div class="linha-nova" id="f-linha-nova-campos" hidden>
              <input class="entrada" id="f-linha-nova" maxlength="40" autocomplete="off" aria-label="Nome da nova linha" placeholder="Nome da nova linha (ex.: Umeboshi)">
              <input class="entrada" id="f-linha-descricao" maxlength="40" autocomplete="off" aria-label="Descrição da nova linha (opcional)" placeholder="Descrição, opcional (ex.: Oriental Blend)">
            </div>
            <span class="dica">Família do produto (ex.: Umeboshi). Na venda, os produtos da mesma linha ficam lado a lado.</span>
          </div>

          <div class="grade-campos duas">
            <div class="campo">
              <label for="f-preco">Preço de venda</label>
              <input class="entrada" id="f-preco">
              <span class="dica">Vale para todas as variações, a não ser que alguma tenha preço próprio.</span>
            </div>
            <div class="campo so-dono">
              <label for="f-custo">Custo unitário</label>
              <input class="entrada" id="f-custo">
              <span class="dica" id="margem">Quanto você paga por unidade. Opcional, usado para calcular o lucro.</span>
              ${pinDefinido
                ? '<button type="button" class="btn texto" id="ocultar-custo" style="align-self:flex-start;margin-left:-12px">Ocultar custo</button>'
                : '<span class="dica">Defina um PIN em Mais → Configurações para esconder o custo de quem opera o tablet.</span>'}
            </div>
            <div class="campo trancado">
              <span class="rotulo">Custo unitário</span>
              <button type="button" class="btn" id="ver-custo" style="align-self:flex-start">${icones.cadeado} Ver custo e lucro</button>
              <span class="dica">Protegido pelo PIN.</span>
            </div>
          </div>

          <label class="interruptor">
            <span><strong>Disponível para venda</strong><br><span class="dica" style="font-size:.8125rem;color:var(--texto-2)">Desligado, o produto some da tela de venda mas continua cadastrado.</span></span>
            <input type="checkbox" id="f-ativo" ${!modelo || modelo.ativo ? 'checked' : ''}>
          </label>
        </div>
      </section>

      <section class="cartao">
        <h2>Variações e códigos de barras</h2>
        <p class="sub" style="margin-bottom:16px">Com o leitor ligado, toque no campo de código e leia a embalagem.</p>

        <div class="segmentos" role="radiogroup" aria-label="Tipo de produto">
          <label><input type="radio" name="modo" value="unica" ${comVariacoes ? '' : 'checked'}><span>Sem variações</span></label>
          <label><input type="radio" name="modo" value="variacoes" ${comVariacoes ? 'checked' : ''}><span>Com variações</span></label>
        </div>

        <div id="area-unica" style="margin-top:16px" ${comVariacoes ? 'hidden' : ''}>
          <div class="campo">
            <label for="f-codigo">Código de barras</label>
            <input class="entrada codigo" id="f-codigo" inputmode="numeric" autocomplete="off" maxlength="40" placeholder="Em branco: o app gera um código interno" value="${esc(unica ? unica.codigo : codigoInicial)}">
            ${unica && unica.codigoInterno ? '<span class="dica">Código interno gerado pelo app.</span>' : ''}
          </div>
        </div>

        <div id="area-variacoes" style="margin-top:16px" ${comVariacoes ? '' : 'hidden'}>
          <div class="campo" style="max-width:360px;margin-bottom:16px">
            <label for="f-atributo">Tipo de variação</label>
            <input class="entrada" id="f-atributo" list="lista-atributos" maxlength="30" autocomplete="off" placeholder="Ex.: Fragrância, Cor" value="${esc(modelo ? modelo.atributo || '' : '')}">
            <datalist id="lista-atributos"><option value="Fragrância"><option value="Cor"><option value="Tamanho"><option value="Sabor"><option value="Modelo"></datalist>
          </div>
          <div class="cab-variacoes" aria-hidden="true"><span id="titulo-valor">Variação</span><span>Código de barras</span><span>Preço próprio</span><span class="so-dono">Custo próprio</span><span></span></div>
          <div class="variacoes" id="linhas"></div>
          <button type="button" class="btn texto" id="adicionar-linha" style="margin-top:8px">${icones.mais} Adicionar variação</button>
        </div>
      </section>

      <div class="rodape-form">
        ${editando ? '<button type="button" class="btn texto perigo btn-excluir" id="excluir">Excluir</button>' : ''}
        ${editando ? `<button type="button" class="btn" id="duplicar">Duplicar</button>` : ''}
        <a class="btn" href="#/produtos">Cancelar</a>
        ${editando ? '' : '<button type="submit" class="btn" data-depois="novo">Salvar e cadastrar outro</button>'}
        <button type="submit" class="btn primario" data-depois="lista">Salvar produto</button>
      </div>
    </form>`;

  const form = el.querySelector('form');
  const $ = (sel) => el.querySelector(sel);
  const linhas = $('#linhas');

  // ---------- Preço ----------
  campoDinheiro($('#f-preco'));
  campoDinheiro($('#f-custo'));
  if (modelo) { escreverCentavos($('#f-preco'), modelo.preco); escreverCentavos($('#f-custo'), modelo.custo ?? null); }

  // Mostra o lucro por unidade enquanto preço e custo são digitados
  const textoMargemPadrao = $('#margem').textContent;
  function atualizarMargem() {
    const p = lerCentavos($('#f-preco')), c = lerCentavos($('#f-custo'));
    const m = $('#margem');
    m.classList.remove('negativa');
    if (!p || !c) { m.textContent = textoMargemPadrao; return; }
    const lucro = p - c;
    const pct = Math.round((lucro / p) * 1000) / 10;
    m.textContent = `Lucro de ${dinheiro(lucro)} por unidade (${pct.toLocaleString('pt-BR')}% do preço).`;
    if (lucro < 0) m.classList.add('negativa');
  }
  $('#f-preco').addEventListener('input', atualizarMargem);
  $('#f-custo').addEventListener('input', atualizarMargem);
  // o campo de dinheiro formata por conta própria; checa de novo após cada tecla
  $('#f-preco').addEventListener('keyup', atualizarMargem);
  $('#f-custo').addEventListener('keyup', atualizarMargem);
  atualizarMargem();

  // Mostrar / esconder custo com o PIN (vale só nesta tela)
  $('#ver-custo').addEventListener('click', async () => {
    if (await pedirPin({ titulo: 'Ver custo e lucro', texto: 'Digite o PIN.' })) {
      form.classList.remove('custo-bloqueado');
      $('#f-custo').focus();
    }
  });
  if ($('#ocultar-custo')) $('#ocultar-custo').addEventListener('click', () => {
    form.classList.add('custo-bloqueado');
  });

  // ---------- Foto ----------
  function desenharFoto() {
    const botao = $('#seletor-foto');
    if (urlFoto) { URL.revokeObjectURL(urlFoto); urlFoto = null; }
    if (fotoBlob) {
      urlFoto = URL.createObjectURL(fotoBlob);
      botao.innerHTML = `<img src="${urlFoto}" alt="">`;
      botao.classList.add('tem-foto');
    } else {
      botao.textContent = 'Sem foto';
      botao.classList.remove('tem-foto');
    }
    $('#remover-foto').hidden = !fotoBlob;
  }
  async function usarArquivo(e) {
    const arquivo = e.target.files[0];
    e.target.value = '';
    if (!arquivo) return;
    try { fotoBlob = await prepararFoto(arquivo); desenharFoto(); }
    catch (erro) { aviso('Não foi possível usar essa imagem. Tente outra.', { tipo: 'erro' }); }
  }
  $('#arquivo-camera').addEventListener('change', usarArquivo);
  $('#arquivo-galeria').addEventListener('change', usarArquivo);
  $('#tirar-foto').addEventListener('click', async () => {
    // Plano B: navegador sem acesso à câmera → usa o app de câmera do aparelho
    if (!cameraDisponivel()) { $('#arquivo-camera').click(); return; }
    try {
      const foto = await abrirCamera();
      if (foto) { fotoBlob = await prepararFoto(foto); desenharFoto(); }
    } catch (erro) {
      console.error(erro);
      const negou = erro && erro.name === 'NotAllowedError';
      aviso(negou ? 'O app não tem permissão para usar a câmera.' : 'Não foi possível abrir a câmera.', {
        tipo: 'erro', acao: 'Usar app da câmera', aoClicar: () => $('#arquivo-camera').click()
      });
    }
  });
  $('#galeria-foto').addEventListener('click', () => $('#arquivo-galeria').click());
  // No computador não há câmera de produto: mostra só "Galeria" (que abre a pasta de arquivos)
  if (!matchMedia('(pointer: coarse)').matches) $('#tirar-foto').hidden = true;
  $('#remover-foto').addEventListener('click', () => { fotoBlob = null; desenharFoto(); });
  desenharFoto();

  // ---------- Categoria, tipo e linha ----------
  // "+ Nova..." mostra o campo para digitar o nome
  for (const campo of ['categoria', 'tipo', 'linha']) {
    form.querySelectorAll(`input[name="${campo}"]`).forEach((r) => r.addEventListener('change', () => {
      const nova = form[campo].value === '__nova';
      $(campo === 'linha' ? '#f-linha-nova-campos' : `#f-${campo}-nova`).hidden = !nova;
      if (nova) $(`#f-${campo}-nova`).focus();
      sugerirNome();
    }));
    $(`#f-${campo}-nova`).addEventListener('input', sugerirNome);
  }
  // Nome sugerido: tipo + linha (ex.: "Shampoo Umeboshi"). Só preenche se o nome
  // estiver vazio ou ainda for a sugestão anterior (não apaga o que a pessoa digitou).
  const nomeEscolhido = (campo, lista) => {
    const v = form[campo].value;
    if (v === '__nova') return $(`#f-${campo}-nova`).value.trim();
    const achado = lista.find((x) => x.id === v);
    return achado ? achado.nome : '';
  };
  let ultimaSugestao = '';
  function sugerirNome() {
    const sugestao = [nomeEscolhido('tipo', tipos), nomeEscolhido('linha', linhasProduto)].filter(Boolean).join(' ');
    const campoNome = $('#f-nome');
    const atual = campoNome.value.trim();
    if (sugestao && (!atual || atual === ultimaSugestao)) campoNome.value = sugestao;
    ultimaSugestao = sugestao;
  }
  ultimaSugestao = [nomeEscolhido('tipo', tipos), nomeEscolhido('linha', linhasProduto)].filter(Boolean).join(' ');

  // ---------- Foto das variações ----------
  const fotosVar = new Map();   // linha da variação (div) → Blob da foto, ou null
  const urlsVar = new Map();
  let linhaFoto = null;         // variação que está escolhendo foto agora
  function desenharFotoVar(div) {
    const b = div.querySelector('.btn-foto-var');
    if (urlsVar.has(div)) { URL.revokeObjectURL(urlsVar.get(div)); urlsVar.delete(div); }
    const blob = fotosVar.get(div);
    if (blob) {
      const u = URL.createObjectURL(blob); urlsVar.set(div, u);
      b.innerHTML = `<img src="${u}" alt="">`; b.classList.add('tem-foto'); b.title = 'Foto da variação';
    } else {
      b.innerHTML = icones.camera; b.classList.remove('tem-foto'); b.title = 'Sem foto (toque para escolher)';
    }
  }
  async function usarFotoVar(arquivo) {
    if (!arquivo || !linhaFoto) return;
    try { fotosVar.set(linhaFoto, await prepararFoto(arquivo)); desenharFotoVar(linhaFoto); }
    catch (erro) { aviso('Não foi possível usar essa imagem. Tente outra.', { tipo: 'erro' }); }
  }
  $('#arquivo-camera-var').addEventListener('change', (e) => { const f = e.target.files[0]; e.target.value = ''; usarFotoVar(f); });
  $('#arquivo-galeria-var').addEventListener('change', (e) => { const f = e.target.files[0]; e.target.value = ''; usarFotoVar(f); });
  function escolherFotoVar(div) {
    linhaFoto = div;
    const nomeVar = div.querySelector('.v-nome').value.trim();
    const temFoto = !!fotosVar.get(div);
    const toque = matchMedia('(pointer: coarse)').matches;
    const d = abrirJanela(`
      <h2>${nomeVar ? `Foto de ${esc(nomeVar)}` : 'Foto da variação'}</h2>
      <p>Aparece no botão desta variação na tela de venda. Sem foto, o botão usa a foto do produto ou a cor.</p>
      <div class="acoes" style="flex-wrap:wrap">
        ${temFoto ? '<button type="button" class="btn texto perigo" data-acao="remover" style="margin-right:auto">Remover foto</button>' : ''}
        <button type="button" class="btn" data-acao="cancelar">Cancelar</button>
        <button type="button" class="btn" data-acao="galeria">${icones.imagem} Galeria</button>
        ${toque ? `<button type="button" class="btn primario" data-acao="camera">${icones.camera} Tirar foto</button>` : ''}
      </div>`);
    d.querySelector('[data-acao="cancelar"]').addEventListener('click', () => d.close());
    d.querySelector('[data-acao="galeria"]').addEventListener('click', () => { d.close(); $('#arquivo-galeria-var').click(); });
    if (temFoto) d.querySelector('[data-acao="remover"]').addEventListener('click', () => { fotosVar.set(div, null); desenharFotoVar(div); d.close(); });
    if (toque) d.querySelector('[data-acao="camera"]').addEventListener('click', async () => {
      d.close();
      if (!cameraDisponivel()) { $('#arquivo-camera-var').click(); return; }
      try { const foto = await abrirCamera(); if (foto) await usarFotoVar(foto); }
      catch (erro) { aviso('Não foi possível abrir a câmera.', { tipo: 'erro', acao: 'Usar app da câmera', aoClicar: () => $('#arquivo-camera-var').click() }); }
    });
  }

  // ---------- Variações ----------
  function adicionarLinha(v = {}) {
    const div = document.createElement('div');
    div.className = 'linha-variacao';
    div.dataset.id = v.id || '';
    div.innerHTML = `
      <div class="campo c-valor"><label class="rotulo-m">Variação</label><div class="nome-com-cor"><button type="button" class="btn-foto-var" aria-label="Foto da variação"></button><button type="button" class="btn-cor" aria-label="Cor da variação"></button><input class="entrada v-nome" maxlength="40" autocomplete="off" placeholder="Ex.: Lavanda" value="${esc(v.nome || '')}"></div></div>
      <div class="campo c-codigo"><label class="rotulo-m">Código de barras</label><input class="entrada codigo v-codigo" inputmode="numeric" maxlength="40" autocomplete="off" placeholder="Em branco: código interno" value="${esc(v.codigo || '')}"></div>
      <div class="campo c-preco"><label class="rotulo-m">Preço próprio</label><input class="entrada v-preco" placeholder="Igual ao produto"></div>
      <div class="campo c-custo so-dono"><label class="rotulo-m">Custo próprio</label><input class="entrada v-custo" placeholder="Igual ao produto"></div>
      <button type="button" class="btn-icone" aria-label="Remover variação">${icones.lixo}</button>`;
    // Liga cada rótulo ao seu campo (acessibilidade)
    div.querySelectorAll('.campo').forEach((c) => {
      const input = c.querySelector('input');
      input.id = 'v-' + novoId();
      c.querySelector('label').htmlFor = input.id;
    });
    // Cor opcional: o botão mostra a cor (ou um quadrado tracejado, sem cor)
    const btnCor = div.querySelector('.btn-cor');
    function desenharCor() {
      const c = corValida(div.dataset.cor);
      btnCor.style.background = c || '';
      btnCor.classList.toggle('sem-cor', !c);
      btnCor.title = c ? 'Cor: ' + c : 'Sem cor (toque para escolher)';
    }
    div.dataset.cor = corValida(v.cor) || '';
    desenharCor();
    btnCor.addEventListener('click', async () => {
      const nomeVar = div.querySelector('.v-nome').value.trim();
      const escolha = await escolherCor({ atual: div.dataset.cor, titulo: nomeVar ? `Cor de ${nomeVar}` : 'Cor da variação' });
      if (escolha === undefined) return; // cancelou
      div.dataset.cor = escolha || '';
      desenharCor();
    });
    // Foto opcional da variação (aparece no botão da tela de venda)
    fotosVar.set(div, v.foto || null);
    desenharFotoVar(div);
    div.querySelector('.btn-foto-var').addEventListener('click', () => escolherFotoVar(div));
    const preco = div.querySelector('.v-preco');
    campoDinheiro(preco);
    escreverCentavos(preco, v.preco ?? null);
    const custo = div.querySelector('.v-custo');
    campoDinheiro(custo);
    escreverCentavos(custo, v.custo ?? null);
    div.querySelector('.btn-icone').addEventListener('click', () => { fotosVar.delete(div); div.remove(); if (!linhas.children.length) adicionarLinha(); });
    linhas.append(div);
    return div;
  }
  if (comVariacoes) (editando ? variacoesSalvas : variacoesOrigem).forEach(adicionarLinha);
  else adicionarLinha();

  $('#adicionar-linha').addEventListener('click', () => adicionarLinha().querySelector('.v-nome').focus());
  $('#f-atributo').addEventListener('input', (e) => { $('#titulo-valor').textContent = e.target.value.trim() || 'Variação'; });
  $('#titulo-valor').textContent = (modelo && modelo.atributo) || 'Variação';

  // Troca entre "Sem variações" e "Com variações", levando o código junto
  form.querySelectorAll('input[name="modo"]').forEach((r) => r.addEventListener('change', () => {
    const modo = form.modo.value;
    $('#area-unica').hidden = modo !== 'unica';
    $('#area-variacoes').hidden = modo !== 'variacoes';
    const primeiraLinha = linhas.querySelector('.v-codigo');
    if (modo === 'variacoes' && $('#f-codigo').value && !primeiraLinha.value) primeiraLinha.value = $('#f-codigo').value;
    if (modo === 'unica' && !$('#f-codigo').value && primeiraLinha.value) $('#f-codigo').value = primeiraLinha.value;
  }));

  // Enter (ou o leitor) num campo pula para o próximo, em vez de salvar
  form.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.target.tagName !== 'INPUT') return;
    e.preventDefault();
    const campos = [...form.querySelectorAll('input.entrada')].filter((i) => i.offsetParent !== null);
    const proximo = campos[campos.indexOf(e.target) + 1];
    if (proximo) proximo.focus();
  });

  // Leitura com nenhum campo selecionado: preenche o próximo código vazio
  const pararLeitor = ouvirLeitor((codigo) => {
    if (form.modo.value === 'unica') { $('#f-codigo').value = codigo; return; }
    const vazio = [...linhas.querySelectorAll('.v-codigo')].find((i) => !i.value);
    const alvo = vazio || adicionarLinha().querySelector('.v-codigo');
    alvo.value = codigo;
    alvo.closest('.linha-variacao').querySelector('.v-nome').focus();
  });

  // ---------- Erros ----------
  function limparErros() {
    form.querySelectorAll('[aria-invalid]').forEach((i) => i.removeAttribute('aria-invalid'));
    form.querySelectorAll('.msg-erro').forEach((m) => m.remove());
  }
  function marcarErro(input, texto) {
    input.setAttribute('aria-invalid', 'true');
    const msg = document.createElement('span');
    msg.className = 'msg-erro';
    msg.textContent = texto;
    input.closest('.campo').append(msg);
  }

  // ---------- Salvar ----------
  let salvando = false;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (salvando) return;
    const depois = e.submitter ? e.submitter.dataset.depois : 'lista';
    limparErros();

    const nome = $('#f-nome').value.trim();
    const preco = lerCentavos($('#f-preco'));
    const custo = lerCentavos($('#f-custo'));
    const escolhaCategoria = form.categoria.value;
    const nomeCategoria = escolhaCategoria === '__nova' ? $('#f-categoria-nova').value.trim() : '';
    const escolhaTipo = form.tipo.value;
    const nomeTipo = escolhaTipo === '__nova' ? $('#f-tipo-nova').value.trim() : '';
    const escolhaLinha = form.linha.value;
    const nomeLinha = escolhaLinha === '__nova' ? $('#f-linha-nova').value.trim() : '';
    const modo = form.modo.value;
    const atributo = $('#f-atributo').value.trim();

    if (!nome) marcarErro($('#f-nome'), 'Informe o nome do produto.');
    if (!preco) marcarErro($('#f-preco'), 'Informe o preço de venda.');
    const erroEscolha = (campo, texto) => {
      const nova = form[campo].value === '__nova';
      if (nova) { marcarErro($(`#f-${campo}-nova`), texto); return; }
      const grupo = form.querySelector(`[aria-labelledby="r-${campo}"]`);
      grupo.setAttribute('aria-invalid', 'true');
      const msg = document.createElement('span'); msg.className = 'msg-erro'; msg.textContent = texto;
      grupo.after(msg);
    };
    if (!escolhaCategoria || (escolhaCategoria === '__nova' && !nomeCategoria)) erroEscolha('categoria', 'Escolha a categoria (ex.: Capilar).');
    if (!escolhaTipo || (escolhaTipo === '__nova' && !nomeTipo)) erroEscolha('tipo', 'Escolha o tipo (ex.: Shampoo).');
    if (escolhaLinha === '__nova' && !nomeLinha) erroEscolha('linha', 'Digite o nome da nova linha, ou escolha "Sem linha".');

    // Monta a lista de variações a partir da tela
    let itens;
    if (modo === 'unica') {
      itens = [{ id: unica ? unica.id : (variacoesSalvas[0] && variacoesSalvas[0].id) || novoId(), nome: '', codigo: normalizarCodigo($('#f-codigo').value), preco: null, custo: null, input: $('#f-codigo') }];
    } else {
      if (!atributo) marcarErro($('#f-atributo'), 'Informe o tipo de variação (ex.: Fragrância).');
      itens = [...linhas.children].map((div) => ({
        id: div.dataset.id || novoId(),
        nome: div.querySelector('.v-nome').value.trim(),
        codigo: normalizarCodigo(div.querySelector('.v-codigo').value),
        preco: lerCentavos(div.querySelector('.v-preco')),
        custo: lerCentavos(div.querySelector('.v-custo')),
        cor: corValida(div.dataset.cor),
        foto: fotosVar.get(div) || null,
        inputNome: div.querySelector('.v-nome'),
        input: div.querySelector('.v-codigo')
      }));
      const nomesVistos = new Set();
      for (const it of itens) {
        const chave = it.nome.toLowerCase();
        if (!it.nome) marcarErro(it.inputNome, 'Informe o nome da variação.');
        else if (nomesVistos.has(chave)) marcarErro(it.inputNome, 'Variação repetida.');
        nomesVistos.add(chave);
      }
    }

    // Códigos: não podem repetir no formulário nem em outro produto
    const codigosVistos = new Set();
    for (const it of itens) {
      if (!it.codigo) continue;
      if (codigosVistos.has(it.codigo)) { marcarErro(it.input, 'Código repetido neste produto.'); continue; }
      codigosVistos.add(it.codigo);
      const dono = await buscarPorCodigo(it.codigo);
      if (dono && dono.produtoId !== id) {
        const outro = await db.produtos.get(dono.produtoId);
        marcarErro(it.input, `Código já usado em ${outro ? outro.nome : 'outro produto'}${dono.nome ? ' (' + dono.nome + ')' : ''}.`);
      }
    }

    const primeiroErro = form.querySelector('[aria-invalid="true"]');
    if (primeiroErro) {
      if (primeiroErro.focus) primeiroErro.focus();
      primeiroErro.scrollIntoView({ block: 'center' });
      aviso('Revise os campos destacados.', { tipo: 'erro' });
      return;
    }

    // Avisa antes de apagar variações ao mudar para "Sem variações"
    if (modo === 'unica' && variacoesSalvas.length > 1) {
      const ok = await confirmar({
        titulo: 'Remover as variações?',
        texto: `O produto passa a ter um único código. As outras ${variacoesSalvas.length - 1} variações serão excluídas.`,
        botao: 'Remover e salvar', perigo: true
      });
      if (!ok) return;
    }

    salvando = true;
    try {
      // Gera códigos internos para os campos em branco
      let gerados = 0;
      for (const it of itens) {
        if (!it.codigo) { it.codigo = await gerarCodigoInterno(codigosVistos); codigosVistos.add(it.codigo); gerados++; }
      }

      // Categoria: usa a existente com o mesmo nome ou cria uma nova
      let categoriaId = escolhaCategoria && escolhaCategoria !== '__nova' ? escolhaCategoria : null;
      if (nomeCategoria) {
        const existente = categorias.find((c) => c.nome.toLowerCase() === nomeCategoria.toLowerCase());
        categoriaId = existente ? existente.id : novoId();
        if (!existente) await db.categorias.add({ id: categoriaId, nome: nomeCategoria.charAt(0).toUpperCase() + nomeCategoria.slice(1), ordem: categorias.length });
      }
      // Tipo e linha: mesma regra (usa o existente com o mesmo nome, ou cria)
      const escolherOuCriar = async (escolha, nomeNovo, lista, tabela, extra = {}) => {
        if (escolha !== '__nova') return escolha || null;
        const existente = lista.find((x) => x.nome.toLowerCase() === nomeNovo.toLowerCase());
        if (existente) return existente.id;
        const novo = { id: novoId(), nome: nomeNovo.charAt(0).toUpperCase() + nomeNovo.slice(1), ordem: lista.length, ...extra };
        await db[tabela].add(novo);
        return novo.id;
      };
      const tipoId = await escolherOuCriar(escolhaTipo, nomeTipo, tipos, 'tipos');
      const descricaoLinha = $('#f-linha-descricao').value.trim();
      const linhaId = await escolherOuCriar(escolhaLinha, nomeLinha, linhasProduto, 'linhas', descricaoLinha ? { descricao: descricaoLinha } : {});

      const agora = new Date().toISOString();
      const registro = {
        id: id || novoId(),
        nome,
        categoriaId,
        tipoId,
        linhaId,
        atributo: modo === 'variacoes' ? atributo : '',
        preco,
        custo: custo || null,
        foto: fotoBlob,
        ativo: $('#f-ativo').checked,
        criadoEm: produto ? produto.criadoEm : agora,
        atualizadoEm: agora
      };

      // Grava tudo de uma vez: ou salva tudo, ou nada (transação)
      await db.transaction('rw', db.produtos, db.variacoes, async () => {
        await db.produtos.put(registro);
        await db.variacoes.where('produtoId').equals(registro.id).delete();
        await db.variacoes.bulkAdd(itens.map((it, ordem) => ({
          id: it.id,
          produtoId: registro.id,
          nome: it.nome,
          codigo: it.codigo,
          codigoInterno: ehCodigoInterno(it.codigo),
          preco: modo === 'variacoes' && it.preco ? it.preco : null,
          custo: modo === 'variacoes' && it.custo ? it.custo : null,
          cor: modo === 'variacoes' ? it.cor || null : null,
          foto: modo === 'variacoes' ? it.foto || null : null,
          ativo: true,
          ordem
        })));
      });

      aviso(gerados ? `Produto salvo. ${gerados === 1 ? 'Gerei 1 código interno' : `Gerei ${gerados} códigos internos`}.` : 'Produto salvo.');
      if (depois === 'novo') {
        // Recarrega a tela de cadastro vazia
        location.hash = '#/produtos/novo?categoria=' + encodeURIComponent(categoriaId || '') + '&_=' + Date.now();
      } else {
        location.hash = '#/produtos';
      }
    } catch (erro) {
      console.error(erro);
      aviso('Não foi possível salvar: ' + (erro.message || erro), { tipo: 'erro' });
    } finally {
      salvando = false;
    }
  });

  // ---------- Duplicar ----------
  // Copia o produto como está salvo. Se houver mudanças na tela, pergunta antes.
  let mexeu = false;
  form.addEventListener('input', () => { mexeu = true; });
  form.addEventListener('change', () => { mexeu = true; });
  if (editando) {
    $('#duplicar').addEventListener('click', async () => {
      if (mexeu && !(await confirmar({
        titulo: 'Duplicar sem salvar?',
        texto: 'A cópia usa o produto como está salvo. As mudanças feitas nesta tela ficam de fora. Para levar as mudanças, toque em Salvar produto e depois duplique.',
        botao: 'Duplicar assim mesmo'
      }))) return;
      location.hash = '#/produtos/novo?copiar=' + encodeURIComponent(id);
    });
  }

  // ---------- Excluir ----------
  if (editando) {
    $('#excluir').addEventListener('click', async () => {
      const ok = await confirmar({
        titulo: `Excluir ${produto.nome}?`,
        texto: 'O produto e todas as suas variações serão apagados deste aparelho. Isso não pode ser desfeito.',
        botao: 'Excluir', perigo: true
      });
      if (!ok) return;
      await db.transaction('rw', db.produtos, db.variacoes, async () => {
        await db.variacoes.where('produtoId').equals(id).delete();
        await db.produtos.delete(id);
      });
      aviso('Produto excluído.');
      location.hash = '#/produtos';
    });
  }

  // No computador já deixa o cursor no nome; no tablet não, para o teclado não cobrir a tela
  if (!editando && matchMedia('(pointer: fine)').matches) $('#f-nome').focus();

  // Ao sair da tela
  return () => { pararLeitor(); if (urlFoto) URL.revokeObjectURL(urlFoto); urlsVar.forEach((u) => URL.revokeObjectURL(u)); };
}
