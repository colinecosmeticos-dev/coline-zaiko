// =========================================================
// Tema claro / escuro.
// "auto" segue o modo escuro do aparelho; "claro" e "escuro" fixam o tema.
// A escolha fica guardada só neste aparelho.
// =========================================================
const CHAVE = 'zaiko-tema';

export function temaSalvo() {
  try { return localStorage.getItem(CHAVE) || 'auto'; } catch (e) { return 'auto'; }
}

export function escolherTema(tema) {
  try { localStorage.setItem(CHAVE, tema); } catch (e) { /* sem armazenamento: vale só até fechar */ }
  aplicarTema(tema);
}

export function aplicarTemaSalvo() {
  aplicarTema(temaSalvo());
  // No modo automático, acompanha quando o aparelho troca de tema
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (temaSalvo() === 'auto') atualizarCorDaBarra();
  });
}

function aplicarTema(tema) {
  const raiz = document.documentElement;
  if (tema === 'claro' || tema === 'escuro') raiz.dataset.tema = tema;
  else delete raiz.dataset.tema;
  atualizarCorDaBarra();
}

// Pinta a barra de status do Android com a cor do fundo do app
function atualizarCorDaBarra() {
  const cor = getComputedStyle(document.documentElement).getPropertyValue('--superficie').trim();
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta && cor) meta.content = cor;
}
