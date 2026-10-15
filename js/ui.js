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
// opcional = true permite deixar o campo vazio.
export function campoDinheiro(input) {
  input.inputMode = 'numeric';
  input.autocomplete = 'off';
  input.classList.add('dinheiro');
  if (!input.placeholder) input.placeholder = '0,00';

  const soDigitos = (texto) => texto.replace(/\D/g, '').replace(/^0+/, '').slice(0, 9);
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
  });
  // Plano B (alguns teclados não avisam antes): reformata o que estiver no campo
  input.addEventListener('input', () => mostrar(soDigitos(input.value)));
  input.addEventListener('focus', () => requestAnimationFrame(() => input.setSelectionRange(input.value.length, input.value.length)));
  mostrar(soDigitos(input.value));
}
export function lerCentavos(input) {
  const digitos = input.value.replace(/\D/g, '');
  return digitos ? Number(digitos) : null;
}
export function escreverCentavos(input, centavos) {
  input.value = centavos == null ? '' : centavosParaTexto(centavos);
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

// ---------- Ícones usados nas telas ----------
export const icones = {
  mais: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  lixo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
  camera: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
  imagem: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/></svg>',
  busca: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  voltar: '<svg viewBox="0 0 24 24" aria-hidden="true" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>'
};

// Iniciais do produto (usadas quando não há foto)
export function iniciais(nome) {
  return esc((nome || '?').trim().slice(0, 2).toUpperCase());
}
