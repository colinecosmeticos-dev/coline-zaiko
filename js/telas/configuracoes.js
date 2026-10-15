// Tela Configurações: tema, armazenamento e versão
import { temaSalvo, escolherTema } from '../tema.js';
import { VERSAO } from '../versao.js';
import { temPin, definirPin, removerPin, conferirPin, pinValido } from '../pin.js';
import { aviso, confirmar } from '../ui.js';

export async function render(el) {
  const tema = temaSalvo();
  const pinDefinido = await temPin();
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
      <h2>PIN do dono</h2>
      <p class="sub">Protege custo, lucro e o painel de vendas. Use de 4 a 6 números e anote em lugar seguro: o PIN não pode ser recuperado.</p>
      <dl style="margin-top:8px"><div class="par"><dt>Situação</dt><dd>${pinDefinido ? 'Definido' : 'Não definido'}</dd></div></dl>
      <form id="form-pin" class="grade-campos" style="margin-top:12px" novalidate>
        ${pinDefinido ? `
        <div class="campo"><label for="pin-atual">PIN atual</label>
          <input class="entrada entrada-pin" id="pin-atual" type="password" inputmode="numeric" maxlength="6" autocomplete="off"></div>` : ''}
        <div class="grade-campos duas">
          <div class="campo"><label for="pin-novo">${pinDefinido ? 'Novo PIN' : 'PIN'}</label>
            <input class="entrada entrada-pin" id="pin-novo" type="password" inputmode="numeric" maxlength="6" autocomplete="off"></div>
          <div class="campo"><label for="pin-confirma">Repita o PIN</label>
            <input class="entrada entrada-pin" id="pin-confirma" type="password" inputmode="numeric" maxlength="6" autocomplete="off"></div>
        </div>
        <div class="acoes" style="display:flex;gap:8px;flex-wrap:wrap">
          <button type="submit" class="btn primario">${pinDefinido ? 'Trocar PIN' : 'Definir PIN'}</button>
          ${pinDefinido ? '<button type="button" class="btn texto perigo" id="remover-pin">Remover PIN</button>' : ''}
        </div>
      </form>
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

  const formPin = el.querySelector('#form-pin');
  const campo = (id) => el.querySelector('#' + id);
  function erro(input, texto) {
    formPin.querySelectorAll('.msg-erro').forEach((m) => m.remove());
    formPin.querySelectorAll('[aria-invalid]').forEach((i) => i.removeAttribute('aria-invalid'));
    input.setAttribute('aria-invalid', 'true');
    const m = document.createElement('span');
    m.className = 'msg-erro'; m.textContent = texto;
    input.closest('.campo').append(m);
    input.focus();
  }
  formPin.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (pinDefinido && !(await conferirPin(campo('pin-atual').value))) return erro(campo('pin-atual'), 'PIN atual incorreto.');
    const novo = campo('pin-novo').value;
    if (!pinValido(novo)) return erro(campo('pin-novo'), 'Use de 4 a 6 números.');
    if (novo !== campo('pin-confirma').value) return erro(campo('pin-confirma'), 'Os dois PINs não são iguais.');
    await definirPin(novo);
    aviso(pinDefinido ? 'PIN trocado.' : 'PIN definido.');
    render(el);
  });
  const botaoRemover = el.querySelector('#remover-pin');
  if (botaoRemover) botaoRemover.addEventListener('click', async () => {
    if (!(await conferirPin(campo('pin-atual').value))) return erro(campo('pin-atual'), 'Digite o PIN atual para remover.');
    const ok = await confirmar({ titulo: 'Remover o PIN?', texto: 'Custo, lucro e painel de vendas ficarão visíveis para qualquer pessoa.', botao: 'Remover', perigo: true });
    if (!ok) return;
    await removerPin();
    aviso('PIN removido.');
    render(el);
  });

  el.querySelectorAll('input[name="tema"]').forEach((r) => r.addEventListener('change', () => escolherTema(r.value)));
}
