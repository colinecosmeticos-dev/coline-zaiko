// =========================================================
// Janelas do caixa: reforço, retirada e fechamento do dia.
// =========================================================
import { listarCategoriasRetirada, adicionarMovimento, fecharCaixa } from '../db.js';
import { esc, dinheiro, abrirJanela, campoDinheiro, lerCentavos } from '../ui.js';

const dataCurta = (iso) => new Date(iso + 'T12:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' });

// ---------- Reforço / Retirada ----------
export async function pedirMovimento(caixa, tipo) {
  const ehRetirada = tipo === 'retirada';
  const categorias = ehRetirada ? (await listarCategoriasRetirada()).filter((c) => c.ativo !== false) : [];
  return new Promise((resolver) => {
    let feito = null;
    const d = abrirJanela(`
      <form method="dialog" class="form-movimento" novalidate>
        <h2>${ehRetirada ? 'Retirada do caixa' : 'Reforço no caixa'}</h2>
        <p>${ehRetirada ? 'Dinheiro que sai da gaveta (sangria, almoço, estacionamento…).' : 'Dinheiro que entra na gaveta (ex.: mais troco).'}</p>
        ${ehRetirada ? `<div class="campo"><span class="rotulo">Categoria</span>
          <div class="opcoes" role="radiogroup" aria-label="Categoria">
            ${categorias.map((c) => `<label><input type="radio" name="categoria" value="${esc(c.id)}"><span>${esc(c.nome)}</span></label>`).join('')}
          </div></div>` : ''}
        <div class="linha-campos">
        <div class="campo"><label for="mov-valor">Valor</label><input class="entrada entrada-grande" id="mov-valor"></div>
        <div class="campo"><label for="mov-motivo">${ehRetirada ? 'Motivo' : 'Observação'} <span class="sub">(opcional)</span></label>
          <input class="entrada" id="mov-motivo" maxlength="140" autocomplete="off" placeholder="${ehRetirada ? 'Ex.: almoço da equipe' : 'Ex.: troco extra'}"></div>
        </div>
        <div class="acoes">
          <button type="button" class="btn" id="voltar">Voltar</button>
          <button type="submit" class="btn primario" id="confirmar" disabled>${ehRetirada ? 'Registrar retirada' : 'Registrar reforço'}</button>
        </div>
      </form>`, { classe: 'janela-movimento', aoFechar: () => resolver(feito) });
    const $ = (s) => d.querySelector(s);
    const campo = $('#mov-valor');
    campoDinheiro(campo);
    const categoria = () => d.querySelector('input[name="categoria"]:checked');
    const conferir = () => {
      const v = lerCentavos(campo);
      $('#confirmar').disabled = !v || (ehRetirada && !categoria());
      $('#confirmar').textContent = v ? `${ehRetirada ? 'Retirar' : 'Reforçar'} ${dinheiro(v)}` : (ehRetirada ? 'Registrar retirada' : 'Registrar reforço');
    };
    campo.addEventListener('input', conferir);
    d.querySelectorAll('input[name="categoria"]').forEach((r) => r.addEventListener('change', () => { conferir(); setTimeout(() => campo.focus(), 0); }));
    $('#voltar').addEventListener('click', () => d.close());
    $('form').addEventListener('submit', async (e) => {
      e.preventDefault();
      if ($('#confirmar').disabled) return;
      const cat = ehRetirada ? categorias.find((c) => c.id === categoria().value) : null;
      feito = await adicionarMovimento(caixa, {
        tipo, valor: lerCentavos(campo), motivo: $('#mov-motivo').value.trim(),
        ...(cat ? { categoriaId: cat.id, categoriaNome: cat.nome, despesa: cat.despesa !== false } : {})
      });
      d.close();
    });
    if (!ehRetirada) campo.focus();
  });
}

// ---------- Resumo (usado no fechamento e na consulta) ----------
export function htmlResumo(r, { categorias = true } = {}) {
  const linha = (rotulo, valor, sinal = '') => `<div><span>${rotulo}</span><span class="num">${sinal}${dinheiro(valor)}</span></div>`;
  const qtd = [r.vendas && `${r.vendas} ${r.vendas === 1 ? 'venda' : 'vendas'}`, r.trocas && `${r.trocas} ${r.trocas === 1 ? 'troca' : 'trocas'}`, r.devolucoes && `${r.devolucoes} ${r.devolucoes === 1 ? 'devolução' : 'devoluções'}`].filter(Boolean).join(' · ') || 'Nenhuma venda';
  return `
    <div class="resumo-caixa">
      <section>
        <h3>Dinheiro na gaveta</h3>
        <div class="contas">
          ${linha('Troco inicial', r.trocoInicial)}
          ${linha('Vendas em dinheiro', r.dinheiroVendas, '+ ')}
          ${r.reforcos ? linha('Reforços', r.reforcos, '+ ') : ''}
          ${r.retiradas ? linha('Retiradas', r.retiradas, '− ') : ''}
          ${r.devolvido.dinheiro ? linha('Devolvido em dinheiro', r.devolvido.dinheiro, '− ') : ''}
          <div class="total"><span>Esperado</span><strong class="num">${dinheiro(r.esperado)}</strong></div>
        </div>
      </section>
      <section>
        <h3>Recebido por forma <span class="sub">${qtd}</span></h3>
        <div class="contas">
          ${r.porForma.length ? r.porForma.map((f) => linha(`${esc(f.nome)} <span class="sub">(${f.quantidade})</span>`, f.valor)).join('') : '<div><span class="sub">Nada recebido.</span></div>'}
          ${r.devolvido.pix ? linha('Devolvido por Pix', r.devolvido.pix, '− ') : ''}
          ${r.devolvido.estorno ? linha('Estornado na maquininha', r.devolvido.estorno, '− ') : ''}
          <div class="total"><span>Total recebido</span><strong class="num">${dinheiro(r.totalRecebido - r.totalDevolvido)}</strong></div>
        </div>
        ${categorias && r.retiradasPorCategoria.length ? `<h3>Retiradas por categoria</h3><div class="contas">${r.retiradasPorCategoria.map((c) => linha(`${esc(c.nome)}${c.despesa ? '' : ' <span class="sub">(não é despesa)</span>'}`, c.valor)).join('')}</div>` : ''}
      </section>
    </div>`;
}

// ---------- Fechamento ----------
export function pedirFechamento(caixa, resumo) {
  return new Promise((resolver) => {
    let fechado = null;
    const d = abrirJanela(`
      <form method="dialog" class="form-fechamento" novalidate>
        <h2>Fechar o caixa de ${esc(dataCurta(caixa.data))}</h2>
        ${htmlResumo(resumo, { categorias: false })}
        <div class="contagem-caixa">
          <div class="campo"><label for="contado">Dinheiro contado na gaveta</label><input class="entrada entrada-grande" id="contado"></div>
          <p class="diferenca num" id="diferenca" aria-live="polite"></p>
          <div class="campo"><label for="obs">Observação <span class="sub">(opcional)</span></label>
            <input class="entrada" id="obs" maxlength="140" autocomplete="off"></div>
        </div>
        <div class="acoes">
          <button type="button" class="btn" id="voltar">Voltar</button>
          <button type="submit" class="btn primario" id="confirmar" disabled>Informe o valor contado</button>
        </div>
      </form>`, { classe: 'janela-fechamento', aoFechar: () => resolver(fechado) });
    const $ = (s) => d.querySelector(s);
    const campo = $('#contado');
    campoDinheiro(campo, { permitirZero: true });
    const atualizar = () => {
      const v = lerCentavos(campo);
      const dif = v == null ? null : v - resumo.esperado;
      const el = $('#diferenca');
      el.className = 'diferenca num' + (dif == null ? '' : dif === 0 ? ' confere' : dif > 0 ? ' sobra' : ' falta');
      el.textContent = dif == null ? '' : dif === 0 ? 'Confere com o esperado' : dif > 0 ? `Sobra ${dinheiro(dif)}` : `Falta ${dinheiro(-dif)}`;
      $('#confirmar').disabled = v == null;
      $('#confirmar').textContent = v == null ? 'Informe o valor contado' : 'Fechar caixa';
    };
    campo.addEventListener('input', atualizar);
    $('#voltar').addEventListener('click', () => d.close());
    $('form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const contado = lerCentavos(campo);
      if (contado == null) return;
      fechado = await fecharCaixa(caixa.id, {
        contado, esperado: resumo.esperado, diferenca: contado - resumo.esperado,
        observacao: $('#obs').value.trim(), resumo
      });
      d.close();
    });
  });
}
