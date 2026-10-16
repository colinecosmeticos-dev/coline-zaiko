// Tela Mais: atalhos para as telas que não cabem no menu.
// No modo Caixa, só o que a equipe precisa, mais a passagem para a Gestão (com PIN).
import { lerEventoAtivo, lerAparelho } from '../db.js';
import { esc, aviso, confirmar } from '../ui.js';
import { ehCaixa, definirModo } from '../modo.js';
import { temPin, pedirPin } from '../pin.js';
import { escolherEvento } from '../venda/escolher-evento.js';

const itensGestao = [
  ['#/eventos', 'Eventos', 'Criar eventos e escolher o evento deste aparelho'],
  ['#/pacote', 'Preparar outros aparelhos', 'Enviar ou receber catálogo, taxas e eventos'],
  ['#/juntar', 'Juntar vendas dos aparelhos', 'Enviar as vendas ao principal e conferir quem já mandou'],
  ['#/estoque', 'Estoque do evento', 'Quantidades levadas, brindes e avarias'],
  ['#/fechamento', 'Fechamento do evento', 'Totais, resumo por dia e exportação'],
  ['#/painel', 'Painel de vendas', 'Vendas do aparelho, protegido por PIN'],
  ['#/backup', 'Backup', 'Cópia completa do aparelho no Drive ou em arquivo, e restauração'],
  ['#/configuracoes', 'Configurações', 'Aparelho, modo, formas de pagamento, retiradas, PIN e tema']
];

const itensCaixa = [
  ['#/pacote', 'Receber catálogo e evento', 'Pacote preparado na Gestão (produtos, formas de pagamento e eventos)'],
  ['#/juntar', 'Enviar vendas', 'Manda as vendas e os caixas deste aparelho para a Gestão'],
  ['#/backup', 'Backup', 'Cópia completa deste aparelho no Drive ou em arquivo']
];

const lista = (itens) => `
  <ul class="lista lista-links">
    ${itens.map(([href, titulo, sub]) => `
      <li><a href="${href}">
        <span><strong>${titulo}</strong><br><span class="sub">${sub}</span></span>
        <span class="seta" aria-hidden="true">›</span>
      </a></li>`).join('')}
  </ul>`;

export async function render(el) {
  if (!ehCaixa()) {
    el.innerHTML = `<header class="cab"><h1>Mais</h1></header>${lista(itensGestao)}`;
    return;
  }
  const [evento, aparelho, comPin] = await Promise.all([lerEventoAtivo(), lerAparelho(), temPin()]);
  el.innerHTML = `
    <header class="cab"><div><h1>Mais</h1>
      <p class="sub">${aparelho ? `${esc(aparelho.nome)} (${esc(aparelho.sigla)}) · ` : ''}modo Caixa</p></div></header>
    <ul class="lista lista-links">
      <li><button type="button" class="link-evento" id="evento">
        <span><strong>Evento</strong><br><span class="sub">${evento ? esc(evento.nome) : 'Nenhum evento escolhido'}</span></span>
        <span class="seta" aria-hidden="true">›</span></button></li>
    </ul>
    <div style="margin-top:16px">${lista(itensCaixa)}</div>
    <section class="cartao" style="margin-top:16px">
      <h2>Modo Gestão</h2>
      <p class="sub">Cadastros, estoque, fechamento e relatórios. ${comPin ? 'Pede o PIN.' : 'Defina um PIN na Gestão para proteger esta passagem.'}</p>
      <div class="acoes" style="justify-content:flex-start"><button type="button" class="btn" id="gestao">Entrar no modo Gestão</button></div>
    </section>`;
  el.querySelector('#evento').addEventListener('click', async () => {
    const e = await escolherEvento();
    if (e) { aviso(`Evento em uso: ${e.nome}.`); render(el); }
  });
  el.querySelector('#gestao').addEventListener('click', async () => {
    if (comPin) {
      if (!(await pedirPin({ titulo: 'Modo Gestão', texto: 'Digite o PIN.' }))) return;
    } else if (!(await confirmar({ titulo: 'Entrar no modo Gestão?', texto: 'Este aparelho passa a mostrar todas as telas. Sem PIN definido, qualquer pessoa pode fazer isso.', botao: 'Entrar' }))) return;
    await definirModo('gestao');
    aviso('Modo Gestão.');
    location.hash = '#/inicio';
  });
}
