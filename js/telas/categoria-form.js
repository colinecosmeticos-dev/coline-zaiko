// =========================================================
// Editar / criar categoria de produto: nome e foto.
// =========================================================
import { db, novoId, listarCategorias } from '../db.js';
import { esc, aviso, confirmar, icones } from '../ui.js';
import { prepararFoto } from '../foto.js';
import { abrirCamera, cameraDisponivel } from '../camera.js';

export async function render(el, { id }) {
  const nova = id === 'nova';
  const c = nova ? { nome: '', foto: null } : await db.categorias.get(id);
  if (!c) { el.innerHTML = '<div class="cartao vazio"><h2>Categoria não encontrada</h2><a class="btn" href="#/produtos/categorias">Voltar</a></div>'; return; }
  const qtdProdutos = nova ? 0 : await db.produtos.where('categoriaId').equals(id).count();
  let fotoBlob = c.foto || null;
  let url = null;

  el.innerHTML = `
    <a class="voltar" href="#/produtos/categorias">${icones.voltar} Categorias</a>
    <header class="cab"><h1>${nova ? 'Nova categoria' : esc(c.nome)}</h1></header>
    <form class="form-produto" novalidate>
      <section class="cartao">
        <div class="grade-campos">
          <div class="bloco-foto">
            <div class="seletor-foto" id="seletor-foto" aria-hidden="true"></div>
            <div class="acoes-foto">
              <span class="rotulo">Foto</span>
              <span class="dica">Aparece no botão da categoria na tela de venda.</span>
              <div class="botoes-foto">
                <button type="button" class="btn" id="tirar-foto">${icones.camera} Tirar foto</button>
                <button type="button" class="btn" id="galeria-foto">${icones.imagem} Galeria</button>
                <button type="button" class="btn texto perigo" id="remover-foto" hidden>Remover</button>
              </div>
            </div>
            <input type="file" accept="image/*" capture="environment" id="arquivo-camera" hidden>
            <input type="file" accept="image/*" id="arquivo-galeria" hidden>
          </div>
          <div class="campo"><label for="c-nome">Nome</label>
            <input class="entrada" id="c-nome" maxlength="40" autocomplete="off" placeholder="Ex.: Shampoo" value="${esc(c.nome)}"></div>
          ${nova ? '' : `<p class="sub">${qtdProdutos} ${qtdProdutos === 1 ? 'produto' : 'produtos'} nesta categoria.</p>`}
        </div>
      </section>
      <div class="rodape-form">
        ${nova ? '' : '<button type="button" class="btn texto perigo btn-excluir" id="excluir">Excluir</button>'}
        <a class="btn" href="#/produtos/categorias">Cancelar</a>
        <button type="submit" class="btn primario">Salvar</button>
      </div>
    </form>`;

  const $ = (s) => el.querySelector(s);
  function desenharFoto() {
    if (url) { URL.revokeObjectURL(url); url = null; }
    const caixa = $('#seletor-foto');
    if (fotoBlob) { url = URL.createObjectURL(fotoBlob); caixa.innerHTML = `<img src="${url}" alt="">`; caixa.classList.add('tem-foto'); }
    else { caixa.textContent = 'Sem foto'; caixa.classList.remove('tem-foto'); }
    $('#remover-foto').hidden = !fotoBlob;
  }
  async function usarArquivo(e) {
    const arq = e.target.files[0]; e.target.value = '';
    if (!arq) return;
    try { fotoBlob = await prepararFoto(arq); desenharFoto(); } catch (er) { aviso('Não foi possível usar essa imagem.', { tipo: 'erro' }); }
  }
  $('#arquivo-camera').addEventListener('change', usarArquivo);
  $('#arquivo-galeria').addEventListener('change', usarArquivo);
  $('#galeria-foto').addEventListener('click', () => $('#arquivo-galeria').click());
  $('#tirar-foto').addEventListener('click', async () => {
    if (!cameraDisponivel()) { $('#arquivo-camera').click(); return; }
    try { const f = await abrirCamera(); if (f) { fotoBlob = await prepararFoto(f); desenharFoto(); } }
    catch (er) { aviso('Não foi possível abrir a câmera.', { tipo: 'erro', acao: 'Usar app da câmera', aoClicar: () => $('#arquivo-camera').click() }); }
  });
  if (!matchMedia('(pointer: coarse)').matches) $('#tirar-foto').hidden = true;
  $('#remover-foto').addEventListener('click', () => { fotoBlob = null; desenharFoto(); });
  desenharFoto();

  el.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const nome = $('#c-nome').value.trim();
    if (!nome) { aviso('Informe o nome da categoria.', { tipo: 'erro' }); $('#c-nome').focus(); return; }
    const todas = await listarCategorias();
    if (todas.some((o) => o.id !== id && o.nome.toLowerCase() === nome.toLowerCase())) { aviso('Já existe uma categoria com esse nome.', { tipo: 'erro' }); return; }
    await db.categorias.put({ ...c, id: nova ? novoId() : id, nome, foto: fotoBlob, ordem: nova ? todas.length : (c.ordem ?? todas.length) });
    aviso('Categoria salva.');
    location.hash = '#/produtos/categorias';
  });

  if ($('#excluir')) $('#excluir').addEventListener('click', async () => {
    if (qtdProdutos) { aviso(`Mova os ${qtdProdutos} produtos para outra categoria antes de excluir.`, { tipo: 'erro' }); return; }
    if (!(await confirmar({ titulo: `Excluir ${c.nome}?`, botao: 'Excluir', perigo: true }))) return;
    await db.categorias.delete(id);
    aviso('Categoria excluída.');
    location.hash = '#/produtos/categorias';
  });
  return () => { if (url) URL.revokeObjectURL(url); };
}
