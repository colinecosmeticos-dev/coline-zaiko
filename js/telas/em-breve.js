// Tela provisória para as partes do app que ainda vamos construir
import { esc } from '../ui.js';

export function emBreve(titulo, descricao) {
  return (el) => {
    el.innerHTML = `
      <header class="cab"><h1>${esc(titulo)}</h1></header>
      <div class="cartao vazio">
        <div class="simbolo" aria-hidden="true">在庫</div>
        <h2>Esta tela ainda vai ser construída</h2>
        <p>${esc(descricao)}</p>
        <a class="btn" href="#/produtos">Ir para Produtos</a>
      </div>`;
  };
}
