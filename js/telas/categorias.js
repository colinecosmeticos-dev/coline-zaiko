// =========================================================
// Tela Categorias de produto (Produtos → Categorias).
// Foto e ordem aparecem na tela de venda, no modo Categorias.
// =========================================================
import { db, listarCategorias } from '../db.js';
import { esc, icones, iniciais } from '../ui.js';

export async function render(el) {
  const categorias = await listarCategorias();
  const produtos = await db.produtos.toArray();
  const qtd = (id) => produtos.filter((p) => p.categoriaId === id).length;
  const urls = [];
  const foto = (c) => {
    if (!c.foto) return `<div class="foto" aria-hidden="true">${iniciais(c.nome)}</div>`;
    const u = URL.createObjectURL(c.foto); urls.push(u);
    return `<div class="foto"><img src="${u}" alt=""></div>`;
  };

  el.innerHTML = `
    <a class="voltar" href="#/produtos">${icones.voltar} Produtos</a>
    <header class="cab">
      <div><h1>Categorias</h1>
        <p class="sub">A foto e a ordem aparecem na tela de venda. Use as setas para mudar a ordem.</p></div>
      <a class="btn primario" href="#/produtos/categorias/nova">${icones.mais} Nova categoria</a>
    </header>
    ${categorias.length ? `
    <ul class="lista">
      ${categorias.map((c, i) => `
        <li class="linha-forma">
          <a class="info com-foto" href="#/produtos/categorias/${encodeURIComponent(c.id)}">
            ${foto(c)}
            <span><strong>${esc(c.nome)}</strong><br><span class="sub">${qtd(c.id)} ${qtd(c.id) === 1 ? 'produto' : 'produtos'}</span></span>
          </a>
          <div class="setas">
            <button type="button" class="btn-icone" data-mover="-1" data-i="${i}" aria-label="Subir ${esc(c.nome)}" ${i === 0 ? 'disabled' : ''}>${icones.cima}</button>
            <button type="button" class="btn-icone" data-mover="1" data-i="${i}" aria-label="Descer ${esc(c.nome)}" ${i === categorias.length - 1 ? 'disabled' : ''}>${icones.baixo}</button>
          </div>
        </li>`).join('')}
    </ul>` : `
    <div class="cartao vazio">
      <div class="simbolo" aria-hidden="true">在庫</div>
      <h2>Nenhuma categoria</h2>
      <p>Crie aqui ou direto no cadastro de produto.</p>
      <a class="btn primario" href="#/produtos/categorias/nova">Criar categoria</a>
    </div>`}`;

  el.querySelectorAll('[data-mover]').forEach((b) => b.addEventListener('click', async () => {
    const i = Number(b.dataset.i), j = i + Number(b.dataset.mover);
    [categorias[i], categorias[j]] = [categorias[j], categorias[i]];
    await db.categorias.bulkPut(categorias.map((c, ordem) => ({ ...c, ordem })));
    urls.forEach(URL.revokeObjectURL);
    await render(el);
  }));
  return () => urls.forEach(URL.revokeObjectURL);
}
