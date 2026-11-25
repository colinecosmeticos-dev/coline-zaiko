// =========================================================
// Custos do evento (Eventos → evento → Custos do evento;
// #/eventos/<id>/custos). v0.35.0
//   Valor do evento: R$ fixo, % das vendas ou os dois.
//   Estrutura: quantidade, item, dimensões e valor unitário (em branco = incluso); total da linha ao lado.
//   Equipe: nome, diária e os dias do evento em que trabalhou (total = diária × dias).
// Resumo ao lado, com quanto vender para cobrir os custos fixos (pela margem
// do último evento com vendas). Pede o PIN. Grava ao tocar em Salvar.
// Os custos entram no Fechamento do evento (Resultado final).
// =========================================================
import { db, novoId, listarProdutosCompletos } from '../db.js';
import { esc, dinheiro, icones, aviso, campoDinheiro, campoPercentual, lerCentavos, escreverCentavos, saida, percentual } from '../ui.js';
import { temPin, pedirPin } from '../pin.js';
import { diasDoEvento, custosVazios, calcularCustosEvento, vendaParaCobrir, totalItem } from '../fechamento/custos-evento.js';
import { calcularPainel } from '../painel/calculo.js';
import { custosDoCadastro, completarCustos } from '../painel/custos.js';

const diaCurto = (iso) => new Date(iso + 'T12:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit' }).replace('.', '');

// Margem do último outro evento com vendas: (faturamento − custo − taxas) / faturamento
async function margemDeReferencia(eventoAtual) {
  const eventos = (await db.eventos.toArray()).filter((e) => e.id !== eventoAtual.id).sort((a, b) => (b.dataFim || '').localeCompare(a.dataFim || ''));
  const custos = custosDoCadastro(await listarProdutosCompletos());
  for (const e of eventos) {
    const vendas = (await db.vendas.where('eventoId').equals(e.id).toArray()).filter((r) => !r.posEvento);
    if (!vendas.length) continue;
    const p = calcularPainel(completarCustos(vendas, custos).registros);
    if (p.faturamento > 0) return { evento: e, margem: (p.faturamento - p.custo - p.taxas) / p.faturamento };
  }
  return null;
}

export async function render(el, { id, liberado = false }) {
  const evento = await db.eventos.get(id);
  if (!evento) { location.replace('#/eventos'); return; }
  const voltar = `<a class="voltar" href="#/eventos/${encodeURIComponent(id)}">${icones.voltar} ${esc(evento.nome)}</a>`;
  if (!liberado && await temPin() && !(await pedirPin({ titulo: 'Custos do evento', texto: 'Digite o PIN.' }))) {
    el.innerHTML = `${voltar}<header class="cab"><h1>Custos do evento</h1></header>
      <div class="cartao vazio"><h2>Protegido pelo PIN</h2><p>Os custos e os valores da equipe só aparecem depois do PIN.</p><button type="button" class="btn primario" id="liberar">Digitar o PIN</button></div>`;
    el.querySelector('#liberar').addEventListener('click', () => render(el, { id }));
    return;
  }

  const dias = diasDoEvento(evento);
  const salvo = JSON.stringify(evento.custos || custosVazios());
  const c = JSON.parse(salvo);   // rascunho
  const ref = await margemDeReferencia(evento);
  const alterado = () => JSON.stringify(c) !== salvo;

  el.innerHTML = `
    ${voltar}
    <header class="cab"><div><h1>Custos do evento</h1>
      <p class="sub">O que ${esc(evento.nome)} custa além dos produtos. Entra no Fechamento do evento, no Resultado final.</p></div></header>
    <div class="custos-evento">
      <div class="ce-principal">
        <section class="cartao">
          <h2>Valor do evento</h2>
          <div class="segmentos" role="radiogroup" aria-label="Como o evento cobra" style="margin-top:8px">
            <label><input type="radio" name="modo" value="fixo" ${c.modo === 'fixo' ? 'checked' : ''}><span>R$ fixo</span></label>
            <label><input type="radio" name="modo" value="pct" ${c.modo === 'pct' ? 'checked' : ''}><span>% das vendas</span></label>
            <label><input type="radio" name="modo" value="ambos" ${c.modo === 'ambos' ? 'checked' : ''}><span>R$ + %</span></label>
          </div>
          <div class="ce-valores">
            <label class="campo" id="campo-fixo"><span class="rotulo">Valor fixo</span><input class="entrada" id="valor-fixo"></label>
            <label class="campo" id="campo-pct"><span class="rotulo">Comissão sobre as vendas</span><input class="entrada" id="comissao"></label>
          </div>
          <p class="sub">A comissão é calculada no fechamento, sobre o faturamento do evento.</p>
        </section>

        <section class="cartao">
          <h2>Estrutura</h2>
          <div class="ce-tabela ce-estrutura">
            <span class="rot">Qtd.</span><span class="rot">Item</span><span class="rot">Dimensões</span><span class="rot dir">Valor un.</span><span class="rot dir">Total</span><span></span>
            <div class="ce-linhas" id="estrutura"></div>
          </div>
          <button type="button" class="btn texto" id="mais-estrutura">${icones.mais} Adicionar item</button>
          <p class="sub">Informe o valor de cada unidade; o total da linha é quantidade × valor. Em branco = incluso no valor do evento.</p>
        </section>

        <section class="cartao">
          <h2>Equipe</h2>
          <div class="ce-tabela ce-equipe">
            <span class="rot">Nome</span><span class="rot">Diária</span><span class="rot">Dias trabalhados</span><span class="rot dir">Total</span><span></span>
            <div class="ce-linhas" id="equipe"></div>
          </div>
          <button type="button" class="btn texto" id="mais-equipe">${icones.mais} Adicionar pessoa</button>
        </section>
      </div>

      <aside class="cartao ce-resumo" id="resumo"></aside>
    </div>
    <div class="barra-rascunho" id="barra" hidden>
      <div class="br-texto"><strong>Alterações não salvas</strong></div>
      <div class="br-botoes"><button type="button" class="btn" id="desfazer">Desfazer</button><button type="button" class="btn primario" id="salvar">Salvar</button></div>
    </div>`;
  const $ = (s) => el.querySelector(s);

  // ---------- Valor do evento ----------
  campoDinheiro($('#valor-fixo')); $('#valor-fixo').placeholder = 'R$ 0,00';
  campoPercentual($('#comissao')); $('#comissao').placeholder = '0,00 %';
  escreverCentavos($('#valor-fixo'), c.valorFixo);
  escreverCentavos($('#comissao'), c.comissaoPct);
  const mostrarModo = () => { $('#campo-fixo').hidden = c.modo === 'pct'; $('#campo-pct').hidden = c.modo === 'fixo'; };
  el.querySelectorAll('input[name="modo"]').forEach((r) => r.addEventListener('change', () => { c.modo = r.value; mostrarModo(); atualizar(); }));
  $('#valor-fixo').addEventListener('input', () => { c.valorFixo = lerCentavos($('#valor-fixo')); atualizar(); });
  $('#comissao').addEventListener('input', () => { c.comissaoPct = lerCentavos($('#comissao')); atualizar(); });
  mostrarModo();

  // ---------- Estrutura ----------
  function desenharEstrutura() {
    $('#estrutura').innerHTML = c.estrutura.map((x) => `
      <div class="ce-linha" data-id="${esc(x.id)}">
        <input class="entrada num dir" data-campo="qtd" inputmode="numeric" value="${x.qtd ?? ''}" aria-label="Quantidade">
        <input class="entrada" data-campo="item" value="${esc(x.item || '')}" placeholder="Ex.: Mesa" aria-label="Item">
        <input class="entrada" data-campo="dimensoes" value="${esc(x.dimensoes || '')}" placeholder="Ex.: 1,80 × 0,90 m" aria-label="Dimensões">
        <input class="entrada dir" data-campo="valor" aria-label="Valor unitário">
        <strong class="num dir ce-total-item" data-total>${x.valor == null ? '<span class="sub">incluso</span>' : dinheiro(totalItem(x))}</strong>
        <button type="button" class="btn-icone" data-remover aria-label="Remover item">${icones.lixo}</button>
      </div>`).join('') || '<p class="sub">Nenhum item. Ex.: 2 mesas 1,80 × 0,90 m, 1 tenda 3 × 3 m.</p>';
    el.querySelectorAll('#estrutura .ce-linha').forEach((linha) => {
      const x = c.estrutura.find((i) => i.id === linha.dataset.id);
      const v = linha.querySelector('[data-campo="valor"]');
      campoDinheiro(v); v.placeholder = 'incluso'; escreverCentavos(v, x.valor);
      linha.addEventListener('input', (e) => {
        const campo = e.target.dataset.campo;
        if (campo === 'qtd') x.qtd = parseInt(e.target.value.replace(/\D/g, ''), 10) || null;
        else if (campo === 'valor') x.valor = lerCentavos(v);
        else x[campo] = e.target.value;
        linha.querySelector('[data-total]').innerHTML = x.valor == null ? '<span class="sub">incluso</span>' : dinheiro(totalItem(x));
        atualizar();
      });
      linha.querySelector('[data-remover]').addEventListener('click', () => { c.estrutura = c.estrutura.filter((i) => i !== x); desenharEstrutura(); atualizar(); });
    });
  }
  $('#mais-estrutura').addEventListener('click', () => {
    c.estrutura.push({ id: novoId(), qtd: 1, item: '', dimensoes: '', valor: null });
    desenharEstrutura(); atualizar();
    el.querySelector('#estrutura .ce-linha:last-child [data-campo="item"]')?.focus();
  });

  // ---------- Equipe ----------
  function desenharEquipe() {
    const t = calcularCustosEvento(c);
    $('#equipe').innerHTML = c.equipe.map((p, k) => `
      <div class="ce-linha" data-id="${esc(p.id)}">
        <input class="entrada" data-campo="nome" value="${esc(p.nome || '')}" placeholder="Nome" aria-label="Nome">
        <input class="entrada dir" data-campo="diaria" aria-label="Diária">
        <span class="ce-dias">${dias.map((d) => `<button type="button" class="chip ce-dia" data-dia="${d}" aria-pressed="${(p.dias || []).includes(d)}">${esc(diaCurto(d))}</button>`).join('')}</span>
        <strong class="num dir" data-total>${dinheiro(t.pessoas[k].total)}</strong>
        <button type="button" class="btn-icone" data-remover aria-label="Remover pessoa">${icones.lixo}</button>
      </div>`).join('') || '<p class="sub">Ninguém na equipe ainda.</p>';
    el.querySelectorAll('#equipe .ce-linha').forEach((linha) => {
      const p = c.equipe.find((i) => i.id === linha.dataset.id);
      const diaria = linha.querySelector('[data-campo="diaria"]');
      campoDinheiro(diaria); diaria.placeholder = 'R$ 0,00'; escreverCentavos(diaria, p.diaria);
      const total = () => { linha.querySelector('[data-total]').textContent = dinheiro((p.diaria || 0) * (p.dias || []).length); atualizar(); };
      linha.querySelector('[data-campo="nome"]').addEventListener('input', (e) => { p.nome = e.target.value; atualizar(); });
      diaria.addEventListener('input', () => { p.diaria = lerCentavos(diaria); total(); });
      linha.querySelectorAll('[data-dia]').forEach((b) => b.addEventListener('click', () => {
        const d = b.dataset.dia;
        p.dias = (p.dias || []).includes(d) ? p.dias.filter((x) => x !== d) : [...(p.dias || []), d].sort();
        b.setAttribute('aria-pressed', String(p.dias.includes(d)));
        total();
      }));
      linha.querySelector('[data-remover]').addEventListener('click', () => { c.equipe = c.equipe.filter((i) => i !== p); desenharEquipe(); atualizar(); });
    });
  }
  $('#mais-equipe').addEventListener('click', () => {
    c.equipe.push({ id: novoId(), nome: '', diaria: null, dias: [...dias] });
    desenharEquipe(); atualizar();
    el.querySelector('#equipe .ce-linha:last-child [data-campo="nome"]')?.focus();
  });

  // ---------- Resumo ----------
  function atualizar() {
    const t = calcularCustosEvento(c);
    const cobrir = ref ? vendaParaCobrir(t.fixos, ref.margem, t.comissaoPct) : null;
    $('#resumo').innerHTML = `
      <h2>Resumo dos custos</h2>
      <div class="contas">
        ${c.modo !== 'pct' ? `<div><span>Valor do evento</span><span class="num">${dinheiro(t.valorFixo)}</span></div>` : ''}
        ${c.modo !== 'fixo' ? `<div><span>Comissão</span><span class="num">${t.comissaoPct ? `${percentual(t.comissaoPct)} das vendas` : '—'}</span></div>` : ''}
        <div><span>Estrutura</span><span class="num">${dinheiro(t.estrutura)}</span></div>
        <div><span>Equipe <span class="sub">(${t.pessoas.length} ${t.pessoas.length === 1 ? 'pessoa' : 'pessoas'}, ${t.diarias} ${t.diarias === 1 ? 'diária' : 'diárias'})</span></span><span class="num">${dinheiro(t.equipe)}</span></div>
        <div class="total"><span>Custos fixos</span><strong class="num">${dinheiro(t.fixos)}</strong></div>
      </div>
      ${t.comissaoPct ? `<p class="sub">+ ${percentual(t.comissaoPct)} do que for vendido.</p>` : ''}
      ${cobrir ? `<p class="ce-cobrir">Para cobrir os custos fixos, é preciso vender cerca de <strong class="num">${dinheiro(cobrir)}</strong>.<br><span class="sub">Estimativa pela margem de ${esc(ref.evento.nome)} (${Math.round(ref.margem * 100)}% depois do custo dos produtos e das taxas).</span></p>`
        : t.fixos && !ref ? '<p class="sub">Depois do primeiro evento com vendas, aparece aqui quanto é preciso vender para cobrir os custos.</p>' : ''}`;
    $('#barra').hidden = !alterado();
  }

  $('#desfazer').addEventListener('click', () => { saida.pendente = null; render(el, { id, liberado: true }); });
  $('#salvar').addEventListener('click', async () => {
    // Linhas vazias saem
    c.estrutura = c.estrutura.filter((x) => (x.item || '').trim() || x.valor);
    c.equipe = c.equipe.filter((p) => (p.nome || '').trim() || p.diaria);
    await db.eventos.update(id, { custos: c });
    aviso('Custos do evento salvos.');
    saida.pendente = null;
    render(el, { id, liberado: true });
  });

  desenharEstrutura();
  desenharEquipe();
  atualizar();
  saida.pendente = alterado;
  return () => { saida.pendente = null; };
}
