// =========================================================
// Ferramentas de interface usadas por todas as telas:
// formatação de dinheiro, campo de valor, avisos e confirmação.
// =========================================================

// Escapa texto digitado pelo usuário antes de colocar no HTML
export function esc(texto) {
  return String(texto ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------- Dinheiro ----------
// Guardamos valores SEMPRE em centavos (número inteiro): R$ 12,90 = 1290.
// Isso evita erros de arredondamento nas contas.
const formatoReal = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
export function dinheiro(centavos) {
  return formatoReal.format((centavos || 0) / 100);
}
function centavosParaTexto(centavos) {
  return ((centavos || 0) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Transforma um <input> em campo de dinheiro estilo maquininha:
// os números entram pela direita (1 → 0,01 · 129 → 1,29 · 1290 → 12,90).
// Campo vazio = valor não informado.
export function campoDinheiro(input, { permitirZero = false } = {}) {
  input.inputMode = 'numeric';
  input.autocomplete = 'off';
  input.classList.add('dinheiro');
  if (!input.placeholder) input.placeholder = '0,00';

  // permitirZero: deixa gravar 0,00 (ex.: taxa zero); sem ele, só zeros = campo vazio
  const soDigitos = (texto) => {
    const todos = texto.replace(/\D/g, '');
    const limpo = todos.replace(/^0+/, '').slice(0, 9);
    return !limpo && permitirZero && todos ? '0' : limpo;
  };
  const mostrar = (digitos) => {
    input.value = digitos ? centavosParaTexto(Number(digitos)) : '';
    input.setSelectionRange(input.value.length, input.value.length);
  };

  // Não importa onde o cursor esteja: número digitado entra no fim,
  // apagar tira o último número (igual à maquininha).
  input.addEventListener('beforeinput', (e) => {
    const tudoSelecionado = input.selectionStart === 0 && input.selectionEnd === input.value.length;
    let digitos = tudoSelecionado ? '' : soDigitos(input.value);
    if (e.inputType.startsWith('insert')) digitos = soDigitos(digitos + (e.data || '').replace(/\D/g, ''));
    else if (e.inputType.startsWith('delete')) digitos = digitos.slice(0, -1);
    else return;
    e.preventDefault();
    mostrar(digitos);
    // Avisa quem estiver ouvindo o campo (ex.: cálculo de troco) que o valor mudou
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  // Plano B (alguns teclados não avisam antes): reformata o que estiver no campo
  input.addEventListener('input', () => mostrar(soDigitos(input.value)));
  // Ao tocar no campo, o valor fica todo selecionado: digitar substitui o valor inteiro
  input.addEventListener('focus', () => requestAnimationFrame(() => input.select()));
  mostrar(soDigitos(input.value));
}
export function lerCentavos(input) {
  const digitos = input.value.replace(/\D/g, '');
  return digitos ? Number(digitos) : null;
}
export function escreverCentavos(input, centavos) {
  input.value = centavos == null ? '' : centavosParaTexto(centavos);
}

// ---------- Percentual (taxas) ----------
// Mesmo jeito do campo de dinheiro: 3 → 0,03 · 357 → 3,57 (%). Guardamos 357.
export function campoPercentual(input) {
  campoDinheiro(input, { permitirZero: true });
  input.classList.add('percentual');
  input.placeholder = 'Não informada';
}
export function percentual(centesimos) {
  if (centesimos == null) return '—';
  return (centesimos / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%';
}

// ---------- Datas ----------
// Datas de evento ficam guardadas como "2026-10-18"
function paraData(iso) { const [a, m, d] = iso.split('-').map(Number); return new Date(a, m - 1, d); }
export function hojeISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function periodo(inicio, fim) {
  if (!inicio) return '';
  const a = paraData(inicio), b = paraData(fim || inicio);
  const dia = (d) => d.getDate();
  const mes = (d) => d.toLocaleDateString('pt-BR', { month: 'long' });
  if (inicio === (fim || inicio)) return `${dia(a)} de ${mes(a)} de ${a.getFullYear()}`;
  if (a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()) return `${dia(a)} a ${dia(b)} de ${mes(b)} de ${b.getFullYear()}`;
  if (a.getFullYear() === b.getFullYear()) return `${dia(a)} de ${mes(a)} a ${dia(b)} de ${mes(b)} de ${b.getFullYear()}`;
  return `${a.toLocaleDateString('pt-BR')} a ${b.toLocaleDateString('pt-BR')}`;
}
export function diasEntre(inicio, fim) {
  return Math.round((paraData(fim) - paraData(inicio)) / 86400000) + 1;
}

// ---------- Avisos rápidos (aparecem embaixo e somem sozinhos) ----------
export function aviso(texto, { tipo = 'normal', acao, aoClicar, duracao = 3500 } = {}) {
  const area = document.getElementById('avisos');
  area.replaceChildren(); // mostra só o aviso mais recente
  const el = document.createElement('div');
  el.className = 'aviso' + (tipo === 'erro' ? ' erro' : '');
  el.setAttribute('role', tipo === 'erro' ? 'alert' : 'status');
  el.innerHTML = `<span>${esc(texto)}</span>`;
  if (acao) {
    const b = document.createElement('button');
    b.className = 'btn texto';
    b.textContent = acao;
    b.onclick = () => { el.remove(); aoClicar && aoClicar(); };
    el.append(b);
  }
  area.append(el);
  setTimeout(() => el.remove(), acao ? duracao + 2500 : duracao);
}

// ---------- Janela de confirmação (substitui o confirm() do navegador) ----------
export function confirmar({ titulo, texto = '', botao = 'Confirmar', cancelar = 'Cancelar', perigo = false }) {
  return new Promise((resolver) => {
    const d = document.createElement('dialog');
    d.className = 'dialogo';
    d.innerHTML = `
      <h2>${esc(titulo)}</h2>
      ${texto ? `<p>${esc(texto)}</p>` : ''}
      <div class="acoes">
        <button class="btn" value="nao">${esc(cancelar)}</button>
        <button class="btn primario ${perigo ? 'perigo' : ''}" value="sim">${esc(botao)}</button>
      </div>`;
    document.body.append(d);
    d.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => d.close(b.value)));
    d.addEventListener('close', () => { resolver(d.returnValue === 'sim'); d.remove(); });
    d.showModal();
    d.querySelector('[value="nao"]').focus();
  });
}

// ---------- Janela (diálogo) genérica ----------
// Abre uma janela por cima da tela com o HTML informado.
// Devolve o elemento <dialog>; ao fechar, ele é removido sozinho.
export function abrirJanela(html, { classe = '', aoFechar } = {}) {
  const d = document.createElement('dialog');
  d.className = 'dialogo ' + classe;
  d.innerHTML = html;
  document.body.append(d);
  d.addEventListener('close', () => { d.remove(); if (aoFechar) aoFechar(d.returnValue); });
  d.showModal();
  return d;
}

// ---------- Ícones usados nas telas ----------
export const icones = {
  mais: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  lixo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
  camera: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
  imagem: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/></svg>',
  fechar: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  trocar: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><path d="M9.5 12.5a2.8 2.8 0 0 1 5-1.5M14.5 14a2.8 2.8 0 0 1-5 1.4"/><path d="M14.5 9.5V11H13M9.5 16.5V15H11"/></svg>',
  cadeado: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
  compartilhar: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V3M7 8l5-5 5 5"/><path d="M5 13v7h14v-7"/></svg>',
  baixar: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M7 10l5 5 5-5"/><path d="M5 19h14"/></svg>',
  cima: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 15l6-6 6 6"/></svg>',
  baixo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>',
  grade: '<svg viewBox="0 0 24 24" aria-hidden="true" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/></svg>',
  busca: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  voltar: '<svg viewBox="0 0 24 24" aria-hidden="true" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>'
};

// Iniciais do produto (usadas quando não há foto)
export function iniciais(nome) {
  return esc((nome || '?').trim().slice(0, 2).toUpperCase());
}
