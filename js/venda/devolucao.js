// =========================================================
// Janela "Devolver itens" / "Trocar itens".
// Escolhe quais itens voltam (e quantas unidades), o estado de cada um
// (bom estado volta para a sobra; com defeito vai para avarias) e qual
// valor considerar: o valor pago (com descontos) ou o preço cheio.
// Na devolução, também escolhe como devolver o dinheiro.
// =========================================================
import { esc, dinheiro, abrirJanela } from '../ui.js';
import { valoresItem, valorUnidades, quantidadesDevolvidas, FORMAS_REEMBOLSO } from './registro.js';
import { htmlFormasReembolso, textoPagamento } from './cobrar.js';

// modo: 'devolucao' | 'troca'. Devolve null (voltou) ou
// { devolvidos, credito, modoValor, motivo, reembolso? }
export async function escolherItensDevolvidos(venda, modo) {
  const devolvidas = await quantidadesDevolvidas(venda);
  const linhas = venda.itens.map((item, indice) => ({
    item, indice,
    disponivel: item.quantidade - (devolvidas.get(indice) || 0),
    qtd: 0,
    estado: 'bom'
  }));
  const temDiferenca = venda.itens.some((i) => { const v = valoresItem(venda, i); return v.pago !== v.cheio; });
  const ehTroca = modo === 'troca';

  return new Promise((resolver) => {
    let resultado = null;
    const d = abrirJanela(`
      <form method="dialog" class="form-devolucao" novalidate>
        <h2>${ehTroca ? 'Trocar' : 'Devolver'} itens da ${esc(venda.numero)}</h2>
        <div class="dev-colunas">
        <div class="dev-col">
        <p>Escolha o que o cliente está ${ehTroca ? 'trocando' : 'devolvendo'}.</p>
        <ul class="dev-itens">
          ${linhas.map((l) => `
            <li class="dev-item" data-linha="${l.indice}">
              <div class="dev-info">
                <strong>${esc(l.item.nome)}</strong>${l.item.variacaoNome ? ` <span class="sub">${esc(l.item.variacaoNome)}</span>` : ''}
                <div class="sub num">${l.item.quantidade} ${l.item.quantidade === 1 ? 'vendido' : 'vendidos'}${l.item.brinde ? ' · brinde' : ''}${l.disponivel < l.item.quantidade ? ` · ${l.item.quantidade - l.disponivel} já ${l.item.quantidade - l.disponivel === 1 ? 'voltou' : 'voltaram'}` : ''}</div>
              </div>
              ${l.disponivel > 0 ? `
                <div class="quantidade pequena">
                  <button type="button" class="btn-icone" data-menos aria-label="Menos">−</button>
                  <strong class="num" data-qtd>0</strong>
                  <button type="button" class="btn-icone" data-mais aria-label="Mais">+</button>
                </div>
                <div class="dev-estado" hidden>
                  <div class="segmentos" role="radiogroup" aria-label="Estado">
                    <label><input type="radio" name="estado-${l.indice}" value="bom" checked><span>Bom estado</span></label>
                    <label><input type="radio" name="estado-${l.indice}" value="defeito"><span>Com defeito</span></label>
                  </div>
                  <span class="num dev-valor" data-valor></span>
                </div>` : '<span class="etiqueta">Já devolvido</span>'}
            </li>`).join('')}
        </ul>
        </div>
        <div class="dev-col">
        ${temDiferenca ? `
          <div class="campo"><span class="rotulo">Valor a considerar</span>
            <div class="segmentos segmentos-largos" role="radiogroup" aria-label="Valor a considerar">
              <label><input type="radio" name="modo-valor" value="pago" checked><span><span class="sv-rotulo">Valor pago</span><b class="num" id="soma-pago"></b></span></label>
              <label><input type="radio" name="modo-valor" value="cheio"><span><span class="sv-rotulo">Preço cheio</span><b class="num" id="soma-cheio"></b></span></label>
            </div>
            <span class="dica">Valor pago já tem os descontos da venda; preço cheio é o de tabela.</span>
          </div>` : ''}
        ${ehTroca ? '' : `<div class="campo"><span class="rotulo">Como devolver</span>${htmlFormasReembolso(textoPagamento(venda))}</div>`}
        <div class="campo"><label for="motivo">Motivo <span class="sub">(opcional)</span></label>
          <input class="entrada" id="motivo" maxlength="140" autocomplete="off" placeholder="Ex.: não gostou da fragrância"></div>
        <div class="acoes">
          <button type="button" class="btn" id="voltar">Voltar</button>
          <button type="submit" class="btn primario" id="confirmar" disabled></button>
        </div>
        </div>
        </div>
      </form>`, { classe: 'janela-devolucao', aoFechar: () => resolver(resultado) });

    const $ = (s) => d.querySelector(s);
    const modoValor = () => (temDiferenca ? d.querySelector('input[name="modo-valor"]:checked').value : 'pago');
    const escolhidas = () => linhas.filter((l) => l.qtd > 0);
    const soma = (m) => escolhidas().reduce((s, l) => s + valorUnidades(venda, l.item, l.qtd, m), 0);

    function atualizar() {
      for (const l of linhas) {
        const li = d.querySelector(`[data-linha="${l.indice}"]`);
        if (!li.querySelector('[data-qtd]')) continue;
        li.querySelector('[data-qtd]').textContent = l.qtd;
        li.classList.toggle('escolhido', l.qtd > 0);
        li.querySelector('.dev-estado').hidden = !l.qtd;
        li.querySelector('[data-valor]').textContent = l.qtd ? dinheiro(valorUnidades(venda, l.item, l.qtd, modoValor())) : '';
      }
      if (temDiferenca) { $('#soma-pago').textContent = dinheiro(soma('pago')); $('#soma-cheio').textContent = dinheiro(soma('cheio')); }
      const total = soma(modoValor());
      const nada = !escolhidas().length;
      $('#confirmar').disabled = nada || (!ehTroca && !d.querySelector('input[name="reembolso"]:checked'));
      $('#confirmar').textContent = nada ? 'Escolha os itens' : (!ehTroca && !d.querySelector('input[name="reembolso"]:checked')) ? 'Escolha como devolver' : ehTroca ? `Continuar com crédito de ${dinheiro(total)}` : `Devolver ${dinheiro(total)}`;
    }

    d.querySelectorAll('[data-linha]').forEach((li) => {
      const l = linhas[Number(li.dataset.linha)];
      li.querySelector('[data-menos]')?.addEventListener('click', () => { if (l.qtd > 0) { l.qtd -= 1; atualizar(); } });
      li.querySelector('[data-mais]')?.addEventListener('click', () => { if (l.qtd < l.disponivel) { l.qtd += 1; atualizar(); } });
      li.querySelectorAll(`input[name="estado-${l.indice}"]`).forEach((r) => r.addEventListener('change', () => { l.estado = r.value; }));
    });
    d.querySelectorAll('input[name="modo-valor"], input[name="reembolso"]').forEach((r) => r.addEventListener('change', atualizar));
    $('#voltar').addEventListener('click', () => d.close());
    $('form').addEventListener('submit', (e) => {
      e.preventDefault();
      if ($('#confirmar').disabled) return;
      const m = modoValor();
      const devolvidos = escolhidas().map((l) => ({
        itemIndice: l.indice,
        variacaoId: l.item.variacaoId, produtoId: l.item.produtoId, nome: l.item.nome, variacaoNome: l.item.variacaoNome, codigo: l.item.codigo,
        quantidade: l.qtd, precoUnit: l.item.precoUnit, custoUnit: l.item.custoUnit,
        valor: valorUnidades(venda, l.item, l.qtd, m),
        estado: l.estado
      }));
      const credito = devolvidos.reduce((s, x) => s + x.valor, 0);
      resultado = { devolvidos, credito, modoValor: m, motivo: $('#motivo').value.trim() };
      if (!ehTroca) {
        const f = FORMAS_REEMBOLSO.find((x) => x.tipo === d.querySelector('input[name="reembolso"]:checked').value);
        resultado.reembolso = { ...f, valor: credito };
      }
      d.close();
    });
    atualizar();
  });
}
