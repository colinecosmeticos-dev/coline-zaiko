// Tela Configurações: tema, armazenamento e versão
import { temaSalvo, escolherTema } from '../tema.js';
import { VERSAO } from '../versao.js';

export async function render(el) {
  const tema = temaSalvo();
  const protegido = navigator.storage && navigator.storage.persisted ? await navigator.storage.persisted() : false;
  let usado = '';
  if (navigator.storage && navigator.storage.estimate) {
    const { usage } = await navigator.storage.estimate();
    usado = (usage / 1024 / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' MB';
  }

  el.innerHTML = `
    <a class="voltar" href="#/mais"><span aria-hidden="true">‹</span> Mais</a>
    <header class="cab"><h1>Configurações</h1></header>

    <section class="cartao">
      <h2>Tema</h2>
      <p class="sub">Automático segue o modo escuro do aparelho. Em tela LCD, o escuro não economiza bateria; em tela AMOLED, economiza.</p>
      <div class="segmentos" role="radiogroup" aria-label="Tema" style="margin-top:16px">
        ${[['auto', 'Automático'], ['claro', 'Claro'], ['escuro', 'Escuro']].map(([v, t]) => `
          <label><input type="radio" name="tema" value="${v}" ${tema === v ? 'checked' : ''}><span>${t}</span></label>`).join('')}
      </div>
    </section>

    <section class="cartao">
      <h2>Armazenamento</h2>
      <dl>
        <div class="par"><dt>Dados protegidos contra limpeza automática</dt><dd>${protegido ? 'Sim' : 'Não'}</dd></div>
        ${usado ? `<div class="par"><dt>Espaço usado pelo app</dt><dd class="num">${usado}</dd></div>` : ''}
      </dl>
      ${protegido ? '' : '<p class="sub" style="margin-top:8px">Instale o app na tela inicial para o navegador proteger os dados. Mesmo assim, faça backup ao fim de cada evento.</p>'}
    </section>

    <section class="cartao">
      <h2>Sobre</h2>
      <dl><div class="par"><dt>Versão do app</dt><dd class="num">${VERSAO}</dd></div></dl>
    </section>`;

  el.querySelectorAll('input[name="tema"]').forEach((r) => r.addEventListener('change', () => escolherTema(r.value)));
}
