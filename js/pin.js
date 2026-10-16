// =========================================================
// PIN do dono.
// Protege o que só o dono deve ver (custo, lucro, painel de vendas).
// O PIN não é guardado como texto: guardamos uma "impressão digital"
// dele (hash SHA-256), então nem olhando o banco dá para lê-lo.
// Depois de digitado, fica liberado por alguns minutos neste aparelho.
// =========================================================
import { lerConfig, gravarConfig, db } from './db.js';
import { esc } from './ui.js';

const MINUTOS_LIBERADO = 10;
let liberadoAte = 0;

async function hash(pin, sal) {
  const dados = new TextEncoder().encode(sal + ':' + pin);
  const resumo = await crypto.subtle.digest('SHA-256', dados);
  return [...new Uint8Array(resumo)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function temPin() {
  return !!(await lerConfig('pinHash'));
}

export async function conferirPin(pin) {
  const sal = await lerConfig('pinSal');
  const guardado = await lerConfig('pinHash');
  return !!guardado && (await hash(pin, sal)) === guardado;
}

export async function definirPin(pin) {
  const sal = [...crypto.getRandomValues(new Uint8Array(8))].map((b) => b.toString(16).padStart(2, '0')).join('');
  await gravarConfig('pinSal', sal);
  await gravarConfig('pinHash', await hash(pin, sal));
}

export async function removerPin() {
  await db.config.bulkDelete(['pinHash', 'pinSal']);
  liberadoAte = 0;
}

export function pinValido(pin) {
  return /^\d{4,6}$/.test(pin);
}

// Está liberado agora? (sem PIN definido, conta como liberado)
export async function liberado() {
  if (!(await temPin())) return true;
  return Date.now() < liberadoAte;
}

export function bloquear() {
  liberadoAte = 0;
}

// Pede o PIN numa janela. Devolve true se acertou (e libera por alguns minutos).
// manterLiberado = false: o PIN vale só para esta ação (pede sempre e não libera o resto do app)
export async function pedirPin({ titulo = 'PIN do dono', texto = '', manterLiberado = true } = {}) {
  if (manterLiberado ? await liberado() : !(await temPin())) return true;
  return new Promise((resolver) => {
    const d = document.createElement('dialog');
    d.className = 'dialogo';
    d.innerHTML = `
      <form method="dialog" novalidate>
        <h2>${esc(titulo)}</h2>
        ${texto ? `<p>${esc(texto)}</p>` : ''}
        <div class="campo" style="margin-top:16px">
          <label for="campo-pin">PIN</label>
          <input class="entrada entrada-pin" id="campo-pin" type="password" inputmode="numeric" autocomplete="off" maxlength="6">
          <span class="msg-erro" hidden>PIN incorreto.</span>
        </div>
        <div class="acoes">
          <button type="button" class="btn" value="cancelar">Cancelar</button>
          <button type="submit" class="btn primario">Liberar</button>
        </div>
      </form>`;
    document.body.append(d);
    const campo = d.querySelector('input');
    const erro = d.querySelector('.msg-erro');
    let ok = false;

    d.querySelector('[value="cancelar"]').addEventListener('click', () => d.close());
    d.querySelector('form').addEventListener('submit', async (e) => {
      e.preventDefault();
      if (await conferirPin(campo.value)) {
        ok = true;
        if (manterLiberado) liberadoAte = Date.now() + MINUTOS_LIBERADO * 60 * 1000;
        d.close();
      } else {
        erro.hidden = false;
        campo.setAttribute('aria-invalid', 'true');
        campo.value = '';
        campo.focus();
      }
    });
    d.addEventListener('close', () => { d.remove(); resolver(ok); });
    d.showModal();
    campo.focus();
  });
}
