// =========================================================
// Modo do aparelho: Gestão (dono) ou Caixa (equipe de venda).
//   Gestão: cadastro, eventos, sincronização, relatórios e fechamento.
//           Não vende (v0.28.0): sem Vender e sem Gaveta.
//   Caixa:  Início (avisos e situação; o app abre nele), Vender, Vendas,
//           Caixa, Sincronizar e um "Mais" reduzido.
// Aparelhos que já usavam o app viram Gestão ao atualizar (nada some).
// Aparelho novo passa pelo assistente (#/configurar).
// =========================================================
import { lerConfig, gravarConfig, lerAparelho } from './db.js';

let modo = null;   // 'gestao' | 'caixa' | null (ainda não configurado)

// Telas que o modo Caixa pode abrir (o resto volta para Vender)
const TELAS_CAIXA = new Set(['inicio', 'vender', 'vendas', 'caixa', 'mais', 'pacote', 'juntar', 'backup', 'configurar', 'sincronizar', 'painel', 'limpar']);

export async function iniciarModo() {
  modo = await lerConfig('modoAparelho', null);
  if (!modo && (await lerAparelho())) {
    modo = 'gestao';
    await gravarConfig('modoAparelho', modo);
  }
  aplicarNoMenu();
  return modo;
}

export const modoAtual = () => modo;
export const ehCaixa = () => modo === 'caixa';
// Gestão não vende (v0.28.0): sem Vender e sem Gaveta; vender é só nos aparelhos de caixa
const TELAS_SO_CAIXA = new Set(['vender', 'caixa']);
export const podeAbrir = (secao) => (modo === 'caixa' ? TELAS_CAIXA.has(secao) : !TELAS_SO_CAIXA.has(secao));
export const telaInicial = () => 'inicio';   // Caixa também (v0.25.0): conferir antes de abrir o caixa

export async function definirModo(novo) {
  modo = novo;
  await gravarConfig('modoAparelho', novo);
  aplicarNoMenu();
}

// No modo Caixa, o menu esconde Produtos
function aplicarNoMenu() {
  document.body.classList.toggle('modo-caixa', modo === 'caixa');
  document.body.classList.toggle('sem-modo', !modo);   // assistente: esconde o menu
}
