// =========================================================
// Arquivo principal: liga o menu às telas (o "roteador").
// O endereço depois do # diz qual tela mostrar:
//   #/inicio  #/produtos  #/produtos/novo  #/produtos/<id>  #/mais ...
// =========================================================
import { pedirArmazenamentoPersistente, garantirCategoriasPadrao, garantirFormasPadrao } from './db.js';
import { aplicarTemaSalvo } from './tema.js';
import { iniciarAtualizacoes } from './atualizacao.js';
import * as inicio from './telas/inicio.js';
import * as produtos from './telas/produtos.js';
import * as produtoForm from './telas/produto-form.js';
import * as mais from './telas/mais.js';
import * as configuracoes from './telas/configuracoes.js';
import * as formas from './telas/formas.js';
import * as formaForm from './telas/forma-form.js';
import * as categorias from './telas/categorias.js';
import * as categoriaForm from './telas/categoria-form.js';
import * as retiradas from './telas/retiradas.js';
import * as eventos from './telas/eventos.js';
import * as eventoForm from './telas/evento-form.js';
import * as pacote from './telas/pacote.js';
import * as vender from './telas/vender.js';
import { emBreve } from './telas/em-breve.js';


// Cada rota aponta para uma função que desenha a tela.
// ":id" é uma parte variável do endereço.
const rotas = [
  ['inicio', inicio.render],
  ['vender', vender.render],
  ['vendas', emBreve('Vendas do evento', 'A lista de vendas, com cancelamento, troca e devolução.')],
  ['caixa', emBreve('Caixa', 'Abertura do dia, reforços, retiradas e fechamento.')],
  ['produtos', produtos.render],
  ['produtos/categorias', categorias.render],
  ['produtos/categorias/:id', categoriaForm.render],
  ['produtos/novo', produtoForm.render],
  ['produtos/:id', produtoForm.render],
  ['mais', mais.render],
  ['configuracoes', configuracoes.render],
  ['configuracoes/taxas', () => location.replace('#/configuracoes/formas')],
  ['configuracoes/formas', formas.render],
  ['configuracoes/formas/:id', formaForm.render],
  ['configuracoes/retiradas', retiradas.render],
  ['pacote', pacote.render],
  ['eventos', eventos.render],
  ['eventos/novo', eventoForm.render],
  ['eventos/:id', eventoForm.render],
  ['estoque', emBreve('Estoque do evento', 'Quantidades levadas, brindes, avarias e sobra.')],
  ['fechamento', emBreve('Fechamento do evento', 'Totais bruto e líquido, resumo por dia e exportação.')],
  ['painel', emBreve('Painel de vendas', 'Vendas e totais do aparelho, protegidos por PIN.')]
];

const tela = document.getElementById('tela');
let limparTelaAnterior = null;

function encontrarRota(caminho) {
  const partes = caminho.split('/');
  for (const [modelo, render] of rotas) {
    const m = modelo.split('/');
    if (m.length !== partes.length) continue;
    const params = {};
    const bate = m.every((p, i) => (p.startsWith(':') ? ((params[p.slice(1)] = decodeURIComponent(partes[i])), true) : p === partes[i]));
    if (bate) return { render, params };
  }
  return null;
}

async function navegar() {
  const [caminhoBruto, consulta = ''] = location.hash.replace(/^#\/?/, '').split('?');
  const caminho = caminhoBruto || 'inicio';
  const rota = encontrarRota(caminho);
  if (!rota) { location.replace('#/inicio'); return; }

  // Marca no menu o item da seção atual
  const secao = caminho.split('/')[0];
  const secaoMenu = ['inicio', 'vender', 'vendas', 'caixa', 'produtos'].includes(secao) ? secao : 'mais';
  document.querySelectorAll('.nav a').forEach((a) => {
    if (a.dataset.rota === secaoMenu) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });

  // Limpa o que a tela anterior deixou ligado (leitor, fotos na memória...)
  if (limparTelaAnterior) { try { limparTelaAnterior(); } catch (e) { console.error(e); } }
  limparTelaAnterior = null;

  tela.innerHTML = '';
  window.scrollTo(0, 0);
  try {
    const limpar = await rota.render(tela, { ...rota.params, consulta: new URLSearchParams(consulta) });
    if (typeof limpar === 'function') limparTelaAnterior = limpar;
  } catch (erro) {
    console.error(erro);
    tela.innerHTML = `<div class="cartao"><h2>Algo deu errado ao abrir esta tela</h2>
      <p class="sub">${String(erro.message || erro)}</p>
      <div class="acoes"><a class="btn" href="#/inicio">Voltar ao início</a></div></div>`;
  }
}

window.addEventListener('hashchange', navegar);

// ---------- Inicialização ----------
aplicarTemaSalvo();
Promise.all([garantirCategoriasPadrao(), garantirFormasPadrao()]).catch((e) => console.error(e)).finally(navegar);
pedirArmazenamentoPersistente().catch(() => {});

// ---------- Atualizações do app ----------
iniciarAtualizacoes();
