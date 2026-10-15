// =========================================================
// Tela Taxas da maquininha (Mais → Configurações → Taxas).
// Uma tabela só, usada pelos dois tablets. Em branco = taxa ainda
// não informada (o fechamento vai avisar quando faltar).
// =========================================================
import { FORMAS_TAXA, lerTaxas, gravarTaxas } from '../db.js';
import { campoPercentual, lerCentavos, escreverCentavos, aviso, icones } from '../ui.js';

export async function render(el) {
  const taxas = await lerTaxas();

  el.innerHTML = `
    <a class="voltar" href="#/configuracoes">${icones.voltar} Configurações</a>
    <header class="cab">
      <div>
        <h1>Taxas da maquininha</h1>
        <p class="sub">Percentual que o Mercado Pago desconta de cada venda. Confira no app do Mercado Pago.</p>
      </div>
    </header>

    <form class="cartao" novalidate>
      <div class="tabela-taxas">
        ${FORMAS_TAXA.map(([chave, nome]) => `
          <label class="linha-taxa" for="t-${chave}">
            <span>${nome}</span>
            <span class="com-sufixo"><input class="entrada" id="t-${chave}" data-chave="${chave}"><span aria-hidden="true">%</span></span>
          </label>`).join('')}
      </div>
      <p class="sub" style="margin-top:16px">Taxa zero: digite 0. Campo vazio: taxa ainda não informada, e o fechamento vai avisar.</p>
      <div class="acoes" style="display:flex;justify-content:flex-end;margin-top:16px">
        <button type="submit" class="btn primario">Salvar taxas</button>
      </div>
    </form>`;

  const campos = [...el.querySelectorAll('input[data-chave]')];
  campos.forEach((c) => { campoPercentual(c); escreverCentavos(c, taxas[c.dataset.chave] ?? null); });

  el.querySelector('form').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.target.tagName !== 'INPUT') return;
    e.preventDefault();
    const prox = campos[campos.indexOf(e.target) + 1];
    if (prox) prox.focus(); else e.target.blur();
  });

  el.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const novas = {};
    for (const c of campos) {
      const v = lerCentavos(c);
      if (v != null && v >= 10000) { c.setAttribute('aria-invalid', 'true'); c.focus(); aviso('Uma taxa precisa ser menor que 100%.', { tipo: 'erro' }); return; }
      novas[c.dataset.chave] = v;
    }
    await gravarTaxas(novas);
    const faltando = campos.filter((c) => lerCentavos(c) == null).length;
    aviso(faltando ? `Taxas salvas. ${faltando} ainda sem valor.` : 'Taxas salvas.');
    location.hash = '#/configuracoes';
  });
}
