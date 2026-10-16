// =========================================================
// Cor opcional das variações (ex.: Lavanda = lilás).
// A cor é guardada na variação como texto "#RRGGBB", ou null (sem cor).
// Aparece como um quadradinho à esquerda do nome na janela de
// variações da tela de venda.
// =========================================================
import { abrirJanela, esc } from './ui.js';

// Paleta rápida: cores comuns em fragrâncias e embalagens
export const PALETA = [
  { nome: 'Rosa', cor: '#F48FB1' },
  { nome: 'Pink', cor: '#FF496F' },
  { nome: 'Vermelho', cor: '#D32F2F' },
  { nome: 'Laranja', cor: '#FB8C00' },
  { nome: 'Pêssego', cor: '#FFCCA8' },
  { nome: 'Amarelo', cor: '#FDD835' },
  { nome: 'Verde', cor: '#43A047' },
  { nome: 'Menta', cor: '#80CBC4' },
  { nome: 'Azul-claro', cor: '#81D4FA' },
  { nome: 'Azul', cor: '#1E88E5' },
  { nome: 'Lilás', cor: '#B39DDB' },
  { nome: 'Roxo', cor: '#7B1FA2' },
  { nome: 'Marrom', cor: '#795548' },
  { nome: 'Bege', cor: '#E8D5B5' },
  { nome: 'Dourado', cor: '#C9A227' },
  { nome: 'Cinza', cor: '#9E9E9E' },
  { nome: 'Preto', cor: '#212121' },
  { nome: 'Branco', cor: '#FFFFFF' }
];

// Aceita só "#RRGGBB" (protege contra valores estranhos vindos de um pacote)
export function corValida(cor) {
  return typeof cor === 'string' && /^#[0-9a-f]{6}$/i.test(cor) ? cor.toUpperCase() : null;
}

// HTML do quadradinho de cor (vazio quando não há cor)
export function quadradoCor(cor, classe = 'quadrado-cor') {
  const c = corValida(cor);
  return c ? `<span class="${classe}" style="background:${c}" aria-hidden="true"></span>` : '';
}

// Janela para escolher a cor. Devolve a cor escolhida, null para "Sem cor",
// ou undefined se a pessoa cancelar.
export function escolherCor({ atual = null, titulo = 'Cor da variação' } = {}) {
  const corAtual = corValida(atual);
  return new Promise((resolver) => {
    let resultado;
    const d = abrirJanela(`
      <h2>${esc(titulo)}</h2>
      <p>Aparece como um quadradinho ao lado do nome, na hora de vender.</p>
      <div class="paleta-cores" role="radiogroup" aria-label="Paleta de cores">
        ${PALETA.map((p) => `
          <button type="button" class="amostra-cor" role="radio" data-cor="${p.cor}" aria-checked="${p.cor === corAtual}" aria-label="${esc(p.nome)}" title="${esc(p.nome)}" style="background:${p.cor}"></button>`).join('')}
      </div>
      <div class="cor-livre">
        <label class="btn" for="cor-livre-entrada">
          <span class="arco-iris" aria-hidden="true"></span> Outra cor…
          <input type="color" id="cor-livre-entrada" value="${corAtual || '#FF496F'}">
        </label>
        <span class="cor-previa"><span class="quadrado-cor grande" id="cor-previa" ${corAtual ? `style="background:${corAtual}"` : ''}></span><span id="cor-codigo" class="num">${corAtual || 'Sem cor'}</span></span>
      </div>
      <div class="acoes">
        <button type="button" class="btn texto" data-acao="sem">Sem cor</button>
        <span style="flex:1"></span>
        <button type="button" class="btn" data-acao="cancelar">Cancelar</button>
        <button type="button" class="btn primario" data-acao="ok">Usar esta cor</button>
      </div>`, { classe: 'janela-cor', aoFechar: () => resolver(resultado) });

    let escolhida = corAtual;
    const mostrar = () => {
      const previa = d.querySelector('#cor-previa');
      previa.style.background = escolhida || '';
      previa.classList.toggle('cor-vazia', !escolhida);
      d.querySelector('#cor-codigo').textContent = escolhida || 'Sem cor';
      d.querySelectorAll('.amostra-cor').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.cor === escolhida)));
    };
    mostrar();

    // Na paleta, um toque já escolhe e fecha (menos toques)
    d.querySelectorAll('.amostra-cor').forEach((b) => b.addEventListener('click', () => {
      resultado = b.dataset.cor; d.close();
    }));
    // Seletor livre: mostra a prévia; confirma em "Usar esta cor"
    const livre = d.querySelector('#cor-livre-entrada');
    livre.addEventListener('input', () => { escolhida = corValida(livre.value); mostrar(); });
    d.querySelector('[data-acao="sem"]').addEventListener('click', () => { resultado = null; d.close(); });
    d.querySelector('[data-acao="cancelar"]').addEventListener('click', () => d.close());
    d.querySelector('[data-acao="ok"]').addEventListener('click', () => { resultado = escolhida; d.close(); });
  });
}
