// Tela Mais: atalhos para as telas que não cabem no menu.
// No modo Caixa, só o que a equipe precisa, mais a passagem para a Gestão (com PIN).
import { lerEventoAtivo, lerAparelho } from '../db.js';
import { esc, aviso, confirmar } from '../ui.js';
import { ehCaixa, definirModo } from '../modo.js';
import { temPin, pedirPin } from '../pin.js';
import { escolherEvento } from '../venda/escolher-evento.js';
import { procurar } from '../atualizacao.js';
import { VERSAO } from '../versao.js';

// Sincronizar, pacote, vendas por arquivo e instalar em outro aparelho ficam
// na tela Sincronizar (menu), desde a v0.26.0.
const itensGestao = [
  ['#/eventos', 'Eventos', 'Criar eventos, preços do evento e o evento deste aparelho'],
  ['#/estoque', 'Estoque do evento', 'Quantidades levadas, brindes, avarias e contagem final'],
  ['#/fechamento', 'Fechamento do evento', 'Totais, resultado, resumo por dia e planilha'],
  ['#/painel', 'Painel de vendas', 'Vendas do aparelho, protegido por PIN'],
  ['#/backup', 'Backup', 'Cópia completa do aparelho no Drive ou em arquivo, e restauração'],
  ['#/configuracoes', 'Configurações', 'Aparelho, modo, formas de pagamento, retiradas, PIN e tema']
];

const itensCaixa = [
  ['#/painel', 'Painel de vendas', 'Vendas e totais deste aparelho, protegido pelo PIN'],
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
    <p class="sub" style="margin-top:12px">Receber o catálogo e enviar as vendas (com ou sem internet) ficam em <a href="#/sincronizar">Sincronizar</a>.</p>
    <section class="cartao" style="margin-top:16px">
      <h2>Modo Gestão</h2>
      <p class="sub">Cadastros, estoque, fechamento e relatórios. ${comPin ? 'Pede o PIN.' : 'Defina um PIN na Gestão para proteger esta passagem.'}</p>
      <div class="acoes" style="justify-content:flex-start"><button type="button" class="btn" id="gestao">Entrar no modo Gestão</button></div>
    </section>
    <section class="cartao" style="margin-top:16px">
      <h2>Versão do app</h2>
      <p class="sub">Este aparelho está na versão <strong class="num">${VERSAO}</strong>.</p>
      <div class="acoes" style="justify-content:flex-start"><button type="button" class="btn" id="procurar-atualizacao">Procurar atualização</button></div>
      <p class="sub" id="status-atualizacao" style="margin-top:8px" hidden></p>
    </section>`;
  // Procurar atualização também no modo Caixa (antes só nas Configurações da Gestão)
  el.querySelector('#procurar-atualizacao').addEventListener('click', async (e) => {
    const botao = e.currentTarget, status = el.querySelector('#status-atualizacao');
    botao.disabled = true; status.hidden = false; status.textContent = 'Procurando...';
    try {
      const r = await procurar();
      status.textContent = r === 'nova' ? 'Versão nova encontrada. Em instantes aparece no topo o botão Atualizar agora.'
        : r === 'sem-internet' ? 'Sem internet. Conecte e tente de novo.'
        : 'O app já está na versão mais recente publicada.';
    } catch (erro) {
      status.textContent = 'Não foi possível procurar agora. Tente de novo em instantes.';
    } finally { botao.disabled = false; }
  });
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
