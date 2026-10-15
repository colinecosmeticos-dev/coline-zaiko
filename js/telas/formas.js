// =========================================================
// Tela Formas de pagamento (Mais → Configurações).
// A ordem desta lista é a ordem dos botões na hora de cobrar.
// Use as setas para mudar a ordem; toque no nome para editar.
// =========================================================
import { db, listarFormasPagamento } from '../db.js';
import { esc, percentual, icones, aviso } from '../ui.js';

export function resumoTaxa(f) {
  if (f.tipo === 'dinheiro') return 'Sem taxa, calcula o troco';
  if (f.tipo === 'credito') {
    const t = f.taxasCredito || {};
    const faltam = [1, 2, 3, 4, 5].filter((n) => t[n] == null).length;
    return `À vista ${percentual(t[1])}, 2x ${percentual(t[2])}${faltam ? `, ${faltam} sem taxa` : ''}`;
  }
  return f.taxa == null ? 'Taxa não informada' : `Taxa ${percentual(f.taxa)}`;
}

export async function render(el) {
  const formas = await listarFormasPagamento();

  el.innerHTML = `
    <a class="voltar" href="#/configuracoes">${icones.voltar} Configurações</a>
    <header class="cab">
      <div><h1>Formas de pagamento</h1>
        <p class="sub">A ordem desta lista é a ordem dos botões na hora de cobrar. Toque no nome para editar a taxa.</p></div>
      <a class="btn primario" href="#/configuracoes/formas/nova">${icones.mais} Nova forma</a>
    </header>
    <ul class="lista" id="lista-formas">
      ${formas.map((f, i) => `
        <li class="linha-forma ${f.ativo ? '' : 'inativo'}">
          <a class="info" href="#/configuracoes/formas/${encodeURIComponent(f.id)}">
            <strong>${esc(f.nome)}</strong>
            <span class="sub">${esc(resumoTaxa(f))}${f.ativo ? '' : ' (desativada)'}</span>
          </a>
          <div class="setas">
            <button type="button" class="btn-icone" data-mover="-1" data-i="${i}" aria-label="Subir ${esc(f.nome)}" ${i === 0 ? 'disabled' : ''}>${icones.cima}</button>
            <button type="button" class="btn-icone" data-mover="1" data-i="${i}" aria-label="Descer ${esc(f.nome)}" ${i === formas.length - 1 ? 'disabled' : ''}>${icones.baixo}</button>
          </div>
        </li>`).join('')}
    </ul>`;

  el.querySelectorAll('[data-mover]').forEach((b) => b.addEventListener('click', async () => {
    const i = Number(b.dataset.i), j = i + Number(b.dataset.mover);
    [formas[i], formas[j]] = [formas[j], formas[i]];
    await db.formasPagamento.bulkPut(formas.map((f, ordem) => ({ ...f, ordem })));
    await render(el);
    const foco = el.querySelectorAll('[data-mover]')[j * 2 + (b.dataset.mover === '-1' ? 0 : 1)];
    if (foco && !foco.disabled) foco.focus();
  }));
}
