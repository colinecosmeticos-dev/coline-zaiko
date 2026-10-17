// =========================================================
// Modo do aparelho: Gestão (dono) ou Caixa (equipe de venda).
//   Gestão: tudo o que o app tem.
//   Caixa:  só Vender, Vendas, Caixa e um "Mais" reduzido
//           (receber catálogo, enviar vendas, backup, evento).
// Aparelhos que já usavam o app viram Gestão ao atualizar (nada some).
// Aparelho novo passa pelo assistente (#/configurar).
// =========================================================
import { lerConfig, gravarConfig, lerAparelho } from './db.js';

let modo = null;   // 'gestao' | 'caixa' | null (ainda não configurado)

// Telas que o modo Caixa pode abrir (o resto volta para Vender)
const TELAS_CAIXA = new Set(['vender', 'vendas', 'caixa', 'mais', 'pacote', 'juntar', 'backup', 'configurar', 'sincronizar', 'painel']);

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
export const podeAbrir = (secao) => modo !== 'caixa' || TELAS_CAIXA.has(secao);
export const telaInicial = () => (modo === 'caixa' ? 'vender' : 'inicio');

export async function definirModo(novo) {
  modo = novo;
  await gravarConfig('modoAparelho', novo);
  aplicarNoMenu();
}

// No modo Caixa, o menu esconde Início e Produtos
function aplicarNoMenu() {
  document.body.classList.toggle('modo-caixa', modo === 'caixa');
  document.body.classList.toggle('sem-modo', !modo);   // assistente: esconde o menu
}
