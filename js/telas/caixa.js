// =========================================================
// Tela Caixa: caixa do dia deste aparelho no evento em uso.
// Reforço e retirada são livres. Ver os totais e fechar o caixa
// pedem o PIN. O PIN vale só nesta tela: ao sair, os totais
// voltam a ficar escondidos. O caixa fechado pode ser reaberto no mesmo dia.
// Caixa de um dia anterior esquecido aberto precisa ser fechado antes
// de abrir o de hoje.
// =========================================================
import { db, lerAparelho, lerEventoAtivo, caixaAbertoDoEvento, caixaDoDia, listarCaixasDoEvento, cancelarMovimento, reabrirCaixa } from '../db.js';
import { esc, dinheiro, icones, aviso, hojeISO, confirmar } from '../ui.js';
import { pedirPin, temPin } from '../pin.js';
import { resumoCaixa } from '../caixa/resumo.js';
import { pedirMovimento, pedirFechamento, pedirFechamentoCego, htmlResumo } from '../caixa/janelas.js';
import { pedirAberturaCaixa } from '../venda/abrir-caixa.js';
import { ehCaixa } from '../modo.js';
import { escolherEvento } from '../venda/escolher-evento.js';
import { lembrarDeSincronizar } from './sincronizar.js';
import { driveConfigurado } from '../drive.js';

const dia = (iso) => new Date(iso + 'T12:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' });
const diaCurto = (iso) => new Date(iso + 'T12:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
const hora = (iso) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

const vazio = (titulo, texto, botao = '') => `
  <header class="cab"><h1>Caixa</h1></header>
  <div class="cartao vazio"><div class="simbolo" aria-hidden="true">在庫</div><h2>${titulo}</h2><p>${texto}</p>${botao}</div>`;

export async function render(el, { id, mostrarTotais = false } = {}) {
  const aparelho = await lerAparelho();
  const evento = await lerEventoAtivo();
  if (!aparelho) { el.innerHTML = vazio('Identifique este aparelho', 'Dê nome e sigla ao aparelho.', `<a class="btn primario" href="${ehCaixa() ? '#/configurar' : '#/configuracoes'}">Configurar aparelho</a>`); return; }

  // Consulta de um caixa específico (dias anteriores)
  if (id) {
    const caixa = await db.caixas.get(id);
    if (!caixa) { location.replace('#/caixa'); return; }
    await desenharCaixa(el, caixa, { voltar: true, mostrarTotais });
    return;
  }

  if (!evento) {
    el.innerHTML = vazio('Escolha o evento', 'O caixa é aberto dentro de um evento.', ehCaixa() ? '<button type="button" class="btn primario" id="escolher">Escolher o evento</button>' : '<a class="btn primario" href="#/eventos">Ir para Eventos</a>');
    el.querySelector('#escolher')?.addEventListener('click', async () => { if (await escolherEvento()) render(el); });
    return;
  }
  const hoje = hojeISO();
  const aberto = await caixaAbertoDoEvento(evento.id);

  // Caixa de outro dia esquecido aberto: precisa fechar primeiro
  if (aberto && aberto.data !== hoje) {
    await desenharCaixa(el, aberto, { atrasado: true, mostrarTotais });
    return;
  }
  const deHoje = aberto || await caixaDoDia(evento.id, hoje);
  if (deHoje) { await desenharCaixa(el, deHoje, { mostrarTotais }); return; }

  // Nenhum caixa hoje
  el.innerHTML = vazio('Caixa fechado', `${esc(evento.nome)}. Abra o caixa do dia com o troco inicial.`, '<button type="button" class="btn primario" id="abrir">Abrir caixa</button>') + await htmlAnteriores(evento, null);
  el.querySelector('#abrir').addEventListener('click', async () => {
    if (await pedirAberturaCaixa(evento)) { aviso('Caixa aberto.'); render(el); }
  });
}

async function htmlAnteriores(evento, atual) {
  const caixas = (await listarCaixasDoEvento(evento.id)).filter((c) => !atual || c.id !== atual.id);
  if (!caixas.length) return '';
  return `<section class="cartao caixas-anteriores">
    <h2>Outros dias deste evento</h2>
    <ul class="lista lista-links">${caixas.map((c) => `<li><a href="#/caixa/${encodeURIComponent(c.id)}">
      <span><strong>${esc(dia(c.data))}</strong><br><span class="sub">${c.status === 'aberto' ? 'Aberto' : 'Fechado'}</span></span><span class="seta" aria-hidden="true">›</span></a></li>`).join('')}</ul>
  </section>`;
}

async function desenharCaixa(el, caixa, { atrasado = false, voltar = false, mostrarTotais = false }) {
  const evento = await db.eventos.get(caixa.eventoId);
  const aberto = caixa.status === 'aberto';
  const ehHoje = caixa.data === hojeISO();
  const movimentos = (await db.movimentos.where('caixaId').equals(caixa.id).toArray()).sort((a, b) => a.criadoEm.localeCompare(b.criadoEm));
  const fechamento = (caixa.fechamentos || []).at(-1);
  const comPin = await temPin();
  const verTotais = !comPin || mostrarTotais;

  const linhasMov = [
    `<li class="mov"><span class="mov-hora num">${hora(caixa.abertoEm)}</span><span class="mov-desc">Abertura (troco)</span><span class="num mov-valor">${dinheiro(caixa.trocoInicial)}</span><span></span></li>`,
    ...movimentos.map((m) => `
      <li class="mov${m.status === 'cancelado' ? ' cancelado' : ''}">
        <span class="mov-hora num">${hora(m.criadoEm)}</span>
        <span class="mov-desc">${m.tipo === 'reforco' ? 'Reforço' : `Retirada · ${esc(m.categoriaNome)}`}${m.motivo ? ` <span class="sub">— ${esc(m.motivo)}</span>` : ''}${m.status === 'cancelado' ? ' <span class="etiqueta erro">Cancelado</span>' : ''}</span>
        <span class="num mov-valor ${m.tipo}">${m.tipo === 'reforco' ? '+ ' : '− '}${dinheiro(m.valor)}</span>
        ${aberto && m.status !== 'cancelado' ? `<button type="button" class="btn-icone" data-cancelar="${esc(m.id)}" aria-label="Cancelar movimento">${icones.fechar}</button>` : '<span></span>'}
      </li>`),
    ...(caixa.reaberturas || []).map((r) => `<li class="mov info"><span class="mov-hora num">${hora(r.em)}</span><span class="mov-desc">Caixa reaberto</span><span></span><span></span></li>`)
  ].join('');

  // Situação do fechamento (com PIN)
  let blocoFechamento = '';
  if (!aberto && fechamento) {
    if (verTotais) {
      const atual = await resumoCaixa(caixa);
      const ajustado = atual.esperado !== fechamento.esperado;
      blocoFechamento = `
        <section class="cartao">
          <div class="cab-cartao"><h2>Fechamento <span class="sub">${hora(fechamento.em)}</span>${fechamento.cego ? ' <span class="etiqueta">às cegas</span>' : ''}</h2>${comPin ? `<button type="button" class="btn texto" id="ocultar-totais">${icones.cadeado} Ocultar</button>` : ''}</div>
          <div class="placar">
            <div><span>Esperado</span><strong class="num">${dinheiro(fechamento.esperado)}</strong></div>
            <div><span>Contado</span><strong class="num">${dinheiro(fechamento.contado)}</strong></div>
            <div class="${fechamento.diferenca === 0 ? 'confere' : fechamento.diferenca > 0 ? 'sobra' : 'falta'}"><span>Diferença</span>
              <strong class="num">${fechamento.diferenca === 0 ? 'Confere' : `${fechamento.diferenca > 0 ? 'Sobra' : 'Falta'} ${dinheiro(Math.abs(fechamento.diferenca))}`}</strong></div>
          </div>
          ${fechamento.observacao ? `<p class="sub">Observação: ${esc(fechamento.observacao)}</p>` : ''}
          ${ajustado ? `<p class="aviso-inline">Houve cancelamentos depois do fechamento: o esperado ajustado é <strong>${dinheiro(atual.esperado)}</strong> (original ${dinheiro(fechamento.esperado)}).</p>` : ''}
          ${htmlResumo(ajustado ? atual : fechamento.resumo)}
        </section>`;
    } else {
      blocoFechamento = `<section class="cartao"><h2>Fechamento</h2><p class="sub">Caixa fechado às ${hora(fechamento.em)}. Os valores ficam protegidos pelo PIN.</p>
        <div class="acoes"><button type="button" class="btn" id="ver-totais">${icones.cadeado} Ver fechamento</button></div></section>`;
    }
  }
  let blocoResumo = '';
  if (aberto) {
    blocoResumo = verTotais
      ? `<section class="cartao"><div class="cab-cartao"><h2>Resumo até agora</h2>${comPin ? `<button type="button" class="btn texto" id="ocultar-totais">${icones.cadeado} Ocultar</button>` : ''}</div>${htmlResumo(await resumoCaixa(caixa))}</section>`
      : `<section class="cartao"><h2>Resumo até agora</h2><p class="sub">Totais do dia protegidos pelo PIN.</p>
          <div class="acoes"><button type="button" class="btn" id="ver-totais">${icones.cadeado} Ver resumo</button></div></section>`;
  }

  el.innerHTML = `
    ${voltar ? `<a class="voltar" href="#/caixa">${icones.voltar} Caixa</a>` : ''}
    <header class="cab">
      <div><h1>Caixa de ${esc(dia(caixa.data))}</h1>
        <p class="sub">${evento ? esc(evento.nome) + ' · ' : ''}Aberto às ${hora(caixa.abertoEm)} com ${dinheiro(caixa.trocoInicial)} de troco</p></div>
      <span class="etiqueta grande ${aberto ? 'marca' : ''}">${aberto ? 'Aberto' : 'Fechado'}</span>
    </header>
    ${atrasado ? `<div class="cartao alerta-cancelada"><strong>Este caixa ficou aberto</strong>
      <p>Feche o caixa de ${esc(diaCurto(caixa.data))} (conte o dinheiro da gaveta) para poder abrir o de hoje e voltar a vender.</p></div>` : ''}
    ${aberto ? `<div class="acoes-caixa">
      <button type="button" class="btn" id="reforco">${icones.mais} Reforço</button>
      <button type="button" class="btn" id="retirada">− Retirada</button>
      <button type="button" class="btn primario" id="fechar">Fechar caixa</button>
    </div>` : ehHoje ? `<div class="acoes-caixa"><button type="button" class="btn" id="reabrir">Reabrir caixa</button></div>` : ''}
    <div class="caixa-colunas">
      <section class="cartao">
        <h2>Movimentos</h2>
        <ul class="lista-movimentos">${linhasMov}</ul>
        <p class="sub nota-mov">Vendas, trocas e devoluções ficam na tela Vendas.</p>
      </section>
      <div class="caixa-lado">${blocoResumo}${blocoFechamento}</div>
    </div>
    ${voltar || !evento ? '' : await htmlAnteriores(evento, caixa)}`;

  // Recarrega a tela mantendo (ou não) os totais à mostra
  const recarregar = (mostrar = mostrarTotais) => render(el, voltar ? { id: caixa.id, mostrarTotais: mostrar } : { mostrarTotais: mostrar });
  const pin = (titulo) => pedirPin({ titulo, texto: 'Digite o PIN.' });
  const $ = (s) => el.querySelector(s);

  $('#reforco')?.addEventListener('click', async () => { if (await pedirMovimento(caixa, 'reforco')) { aviso('Reforço registrado.'); recarregar(); } });
  $('#retirada')?.addEventListener('click', async () => { if (await pedirMovimento(caixa, 'retirada')) { aviso('Retirada registrada.'); recarregar(); } });
  $('#ver-totais')?.addEventListener('click', async () => { if (await pin('Totais do caixa')) recarregar(true); });
  $('#ocultar-totais')?.addEventListener('click', () => recarregar(false));
  $('#fechar')?.addEventListener('click', async () => {
    // Sem o PIN: fechamento às cegas (só o dinheiro contado). Com o PIN: vendo o esperado e a diferença.
    if (!verTotais) {
      const atual = await db.caixas.get(caixa.id);
      const r = await pedirFechamentoCego(atual, await resumoCaixa(atual));
      if (r && r !== 'pin') {
        const f = (r.fechamentos || []).at(-1);
        recarregar(false);
        if (ehCaixa() && driveConfigurado()) { aviso(`Caixa fechado com ${dinheiro(f ? f.contado : 0)} contados.`); lembrarDeSincronizar(); }
        else aviso(`Caixa fechado com ${dinheiro(f ? f.contado : 0)} contados.`, { acao: 'Fazer backup', aoClicar: () => { location.hash = '#/backup'; } });
        return;
      }
      if (r !== 'pin' || !(await pin('Fechar o caixa'))) return;
    }
    const atualizado = await db.caixas.get(caixa.id);
    if (await pedirFechamento(atualizado, await resumoCaixa(atualizado))) {
      recarregar(true);
      if (ehCaixa() && driveConfigurado()) { aviso('Caixa fechado.'); lembrarDeSincronizar(); }
      else aviso('Caixa fechado. Bom momento para um backup.', { acao: 'Fazer backup', aoClicar: () => { location.hash = '#/backup'; } });
    }
    else recarregar(true);
  });
  $('#reabrir')?.addEventListener('click', async () => {
    if (!mostrarTotais && !(await pin('Reabrir o caixa'))) return;
    const ok = await confirmar({ titulo: 'Reabrir o caixa de hoje?', texto: 'Fica registrado que o caixa foi reaberto. Depois, feche de novo com a nova contagem.', botao: 'Reabrir' });
    if (!ok) return;
    await reabrirCaixa(caixa.id);
    aviso('Caixa reaberto.');
    recarregar();
  });
  el.querySelectorAll('[data-cancelar]').forEach((b) => b.addEventListener('click', async () => {
    const ok = await confirmar({ titulo: 'Cancelar este movimento?', texto: 'Use quando o valor foi lançado errado. O movimento fica na lista, riscado.', botao: 'Cancelar movimento', cancelar: 'Voltar', perigo: true });
    if (!ok) return;
    await cancelarMovimento(b.dataset.cancelar);
    recarregar();
  }));
}
