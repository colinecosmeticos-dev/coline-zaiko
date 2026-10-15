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
// =========================================================
import { db, novoId, listarCategorias, buscarPorCodigo } from '../db.js';
import { esc, dinheiro, campoDinheiro, lerCentavos, escreverCentavos, aviso, confirmar, icones } from '../ui.js';
import { gerarCodigoInterno, normalizarCodigo, ehCodigoInterno } from '../codigos.js';
import { prepararFoto } from '../foto.js';
import { abrirCamera, cameraDisponivel } from '../camera.js';
import { ouvirLeitor } from '../leitor.js';
import { temPin, liberado, pedirPin, bloquear } from '../pin.js';

export async function render(el, { id, consulta }) {
  const editando = !!id;
  const produto = editando ? await db.produtos.get(id) : null;
  if (editando && !produto) {
    el.innerHTML = `<div class="cartao vazio"><h2>Produto não encontrado</h2><p>Ele pode ter sido excluído.</p><a class="btn" href="#/produtos">Voltar para Produtos</a></div>`;
    return;
  }
  const variacoesSalvas = editando ? (await db.variacoes.where('produtoId').equals(id).toArray()).sort((a, b) => a.ordem - b.ordem) : [];
  const categorias = await listarCategorias();
  // Custo e lucro só aparecem para o dono (PIN). Sem PIN definido, ficam visíveis.
  const pinDefinido = await temPin();
  const custoLiberado = await liberado();
  // Categoria já marcada ao abrir: a do produto; num cadastro novo, a do último produto salvo
  const idsCategorias = new Set(categorias.map((c) => c.id));
  const sugerida = produto ? produto.categoriaId : (consulta && consulta.get('categoria'));
  const categoriaInicial = sugerida && idsCategorias.has(sugerida) ? sugerida : (categorias.length ? '' : '__nova');
  const comVariacoes = editando ? (variacoesSalvas.length > 1 || !!(variacoesSalvas[0] && variacoesSalvas[0].nome)) : false;
  const unica = !comVariacoes ? variacoesSalvas[0] : null;
  const codigoInicial = consulta && consulta.get('codigo') ? consulta.get('codigo') : '';

  let fotoBlob = produto ? produto.foto || null : null;
  let urlFoto = null;

  el.innerHTML = `
    <a class="voltar" href="#/produtos">${icones.voltar} Produtos</a>
    <header class="cab"><h1>${editando ? esc(produto.nome) : 'Novo produto'}</h1></header>

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
          </div>

          <div class="campo">
            <label for="f-nome">Nome do produto</label>
            <input class="entrada" id="f-nome" maxlength="80" autocomplete="off" value="${esc(produto ? produto.nome : '')}">
          </div>

          <div class="campo">
            <span class="rotulo" id="r-categoria">Categoria</span>
            <div class="opcoes" role="radiogroup" aria-labelledby="r-categoria">
              <label><input type="radio" name="categoria" value="" ${categoriaInicial === '' ? 'checked' : ''}><span>Sem categoria</span></label>
              ${categorias.map((c) => `<label><input type="radio" name="categoria" value="${esc(c.id)}" ${categoriaInicial === c.id ? 'checked' : ''}><span>${esc(c.nome)}</span></label>`).join('')}
              <label><input type="radio" name="categoria" value="__nova" ${categoriaInicial === '__nova' ? 'checked' : ''}><span>+ Nova categoria</span></label>
            </div>
            <input class="entrada" id="f-categoria-nova" maxlength="40" autocomplete="off" aria-label="Nome da nova categoria" placeholder="Nome da nova categoria (ex.: Shampoo)" ${categoriaInicial === '__nova' ? '' : 'hidden'}>
            ${categorias.length ? '' : '<span class="dica">Nenhuma categoria cadastrada ainda. Digite o nome da primeira, ou deixe em branco.</span>'}
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
              <span class="dica">Protegido pelo PIN do dono.</span>
            </div>
          </div>

          <label class="interruptor">
            <span><strong>Disponível para venda</strong><br><span class="dica" style="font-size:.8125rem;color:var(--texto-2)">Desligado, o produto some da tela de venda mas continua cadastrado.</span></span>
            <input type="checkbox" id="f-ativo" ${!produto || produto.ativo ? 'checked' : ''}>
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
            <input class="entrada" id="f-atributo" list="lista-atributos" maxlength="30" autocomplete="off" placeholder="Ex.: Fragrância, Cor" value="${esc(produto ? produto.atributo || '' : '')}">
            <datalist id="lista-atributos"><option value="Fragrância"><option value="Cor"><option value="Tamanho"><option value="Sabor"><option value="Modelo"></datalist>
          </div>
          <div class="cab-variacoes" aria-hidden="true"><span id="titulo-valor">Variação</span><span>Código de barras</span><span>Preço próprio</span><span class="so-dono">Custo próprio</span><span></span></div>
          <div class="variacoes" id="linhas"></div>
          <button type="button" class="btn texto" id="adicionar-linha" style="margin-top:8px">${icones.mais} Adicionar variação</button>
        </div>
      </section>

      <div class="rodape-form">
        ${editando ? '<button type="button" class="btn texto perigo btn-excluir" id="excluir">Excluir</button>' : ''}
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
  if (produto) { escreverCentavos($('#f-preco'), produto.preco); escreverCentavos($('#f-custo'), produto.custo ?? null); }

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

  // Mostrar / esconder custo com o PIN do dono
  $('#ver-custo').addEventListener('click', async () => {
    if (await pedirPin({ titulo: 'Ver custo e lucro', texto: 'Digite o PIN do dono.' })) {
      form.classList.remove('custo-bloqueado');
      $('#f-custo').focus();
    }
  });
  if ($('#ocultar-custo')) $('#ocultar-custo').addEventListener('click', () => {
    bloquear();
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

  // ---------- Categoria ----------
  form.querySelectorAll('input[name="categoria"]').forEach((r) => r.addEventListener('change', () => {
    const nova = form.categoria.value === '__nova';
    $('#f-categoria-nova').hidden = !nova;
    if (nova) $('#f-categoria-nova').focus();
  }));

  // ---------- Variações ----------
  function adicionarLinha(v = {}) {
    const div = document.createElement('div');
    div.className = 'linha-variacao';
    div.dataset.id = v.id || '';
    div.innerHTML = `
      <div class="campo c-valor"><label class="rotulo-m">Variação</label><input class="entrada v-nome" maxlength="40" autocomplete="off" placeholder="Ex.: Lavanda" value="${esc(v.nome || '')}"></div>
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
    const preco = div.querySelector('.v-preco');
    campoDinheiro(preco);
    escreverCentavos(preco, v.preco ?? null);
    const custo = div.querySelector('.v-custo');
    campoDinheiro(custo);
    escreverCentavos(custo, v.custo ?? null);
    div.querySelector('.btn-icone').addEventListener('click', () => { div.remove(); if (!linhas.children.length) adicionarLinha(); });
    linhas.append(div);
    return div;
  }
  if (comVariacoes) variacoesSalvas.forEach(adicionarLinha);
  else adicionarLinha();

  $('#adicionar-linha').addEventListener('click', () => adicionarLinha().querySelector('.v-nome').focus());
  $('#f-atributo').addEventListener('input', (e) => { $('#titulo-valor').textContent = e.target.value.trim() || 'Variação'; });
  $('#titulo-valor').textContent = (produto && produto.atributo) || 'Variação';

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
    const modo = form.modo.value;
    const atributo = $('#f-atributo').value.trim();

    if (!nome) marcarErro($('#f-nome'), 'Informe o nome do produto.');
    if (!preco) marcarErro($('#f-preco'), 'Informe o preço de venda.');

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
      primeiroErro.focus();
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

      const agora = new Date().toISOString();
      const registro = {
        id: id || novoId(),
        nome,
        categoriaId,
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
  return () => { pararLeitor(); if (urlFoto) URL.revokeObjectURL(urlFoto); };
}
