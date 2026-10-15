// Tela Início: situação geral do aparelho
import { db } from '../db.js';

export async function render(el) {
  const totalProdutos = await db.produtos.count();
  const totalItens = await db.variacoes.count();

  el.innerHTML = `
    <div class="saudacao">
      <span class="kanji" aria-hidden="true">在庫</span>
      <h1>Coline Zaiko</h1>
    </div>

    <div class="grade-inicio">
      <section class="cartao">
        <h2>Evento</h2>
        <p class="sub">Nenhum evento aberto. A criação de eventos chega numa próxima etapa.</p>
      </section>

      <section class="cartao">
        <h2>Catálogo</h2>
        ${totalProdutos
          ? `<p class="numero-grande">${totalProdutos}</p>
             <p class="sub">${totalProdutos === 1 ? 'produto cadastrado' : 'produtos cadastrados'}, com ${totalItens} ${totalItens === 1 ? 'item vendável' : 'itens vendáveis'}</p>
             <div class="acoes"><a class="btn" href="#/produtos">Ver produtos</a><a class="btn texto" href="#/produtos/novo">Novo produto</a></div>`
          : `<p class="sub">Nenhum produto cadastrado ainda. Comece pelo catálogo: ele é a base da tela de venda.</p>
             <div class="acoes"><a class="btn primario" href="#/produtos/novo">Cadastrar o primeiro produto</a></div>`}
      </section>
    </div>`;
}
