// =========================================================
// Tela Preços e custos (Produtos → Preços e custos; #/produtos/precos). v0.32.0
// Todos os produtos numa lista, com preço, custo e lucro por unidade, para
// conferir e editar ali mesmo. Variação com campo vazio = igual ao produto.
// Protegida pelo PIN (por causa do custo), que vale só nesta tela.
// As mudanças ficam num rascunho até "Salvar alterações" (como os preços do
// evento). Filtro "Sem custo" mostra os itens que ainda não têm custo.
// =========================================================
import { db, listarProdutosCompletos } from '../db.js';
import { esc, dinheiro, icones, aviso, confirmar, campoDinheiro, lerCentavos, escreverCentavos, saida } from '../ui.js';
import { temPin, pedirPin } from '../pin.js';

export async function render(el, { consulta } = {}) {
  const voltar = `<a class="voltar" href="#/produtos">${icones.voltar} Produtos</a>`;
  if (await temPin() && !(await pedirPin({ titulo: 'Preços e custos', texto: 'Digite o PIN para ver e editar os custos.' }))) {
    el.innerHTML = `${voltar}<header class="cab"><h1>Preços e custos</h1></header>
      <div class="cartao vazio"><h2>Protegido pelo PIN</h2><p>Os custos só aparecem depois do PIN.</p><button type="button" class="btn primario" id="liberar">Digitar o PIN</button></div>`;
    el.querySelector('#liberar').addEventListener('click', () => render(el, { consulta }));
    return;
  }

  const produtos = (await listarProdutosCompletos()).filter((p) => p.variacoes.length)
    .sort((a, b) => Number(b.ativo) - Number(a.ativo) || a.nome.localeCompare(b.nome, 'pt-BR'));
  const prodPorId = new Map(produtos.map((p) => [p.id, p]));
  const varPorId = new Map();
  for (const p of produtos) for (const v of p.variacoes) varPorId.set(v.id, { p, v });

  // Chave: "p|<id>|preco", "v|<id>|custo"... valor em centavos ou null
  const salvoDe = (k) => {
    const [t, id, campo] = k.split('|');
    const obj = t === 'p' ? prodPorId.get(id) : varPorId.get(id).v;
    return obj[campo] ?? null;
  };
  const rascunho = new Map();
  const valor = (k) => (rascunho.has(k) ? rascunho.get(k) : salvoDe(k));
  const alterados = () => [...rascunho.keys()].filter((k) => rascunho.get(k) !== salvoDe(k));
  const precoDe = (p, v) => valor(`v|${v.id}|preco`) ?? valor(`p|${p.id}|preco`);
  const custoDe = (p, v) => valor(`v|${v.id}|custo`) ?? valor(`p|${p.id}|custo`);
  const semCusto = () => produtos.filter((p) => p.variacoes.some((v) => custoDe(p, v) == null));
  // Mostra fileira por variação quando há mais de uma, ou quando a única tem preço/custo próprio
  const comFileiras = (p) => p.variacoes.length > 1 || p.variacoes.some((v) => v.nome || v.preco != null || v.custo != null);

  let filtro = consulta && consulta.get('semcusto') ? 'semcusto' : 'todos';
  let busca = '';

  el.innerHTML = `
    ${voltar}
    <header class="cab"><div><h1>Preços e custos</h1>
      <p class="sub">Confira e edite preço e custo de todos os produtos. Variação com campo vazio usa o valor do produto. Toque em Salvar para gravar.</p></div></header>
    <section class="cartao">
      <div class="segmentos" role="radiogroup" aria-label="Filtro">
        <label><input type="radio" name="filtro" value="todos" ${filtro === 'todos' ? 'checked' : ''}><span>Todos</span></label>
        <label><input type="radio" name="filtro" value="semcusto" ${filtro === 'semcusto' ? 'checked' : ''}><span id="rot-semcusto">Sem custo</span></label>
      </div>
      <label class="busca" style="margin-top:12px"><span class="oculto">Buscar produto</span>${icones.busca}
        <input class="entrada" id="busca" type="search" placeholder="Buscar produto" autocomplete="off"></label>
      <p class="sub nota-mov">O custo entra no lucro do Fechamento e do Painel. Itens já vendidos sem custo passam a usar o custo daqui. Depois de mudar preços, publique a base para os caixas.</p>
    </section>
    <div id="lista"></div>
    <div class="barra-rascunho" id="barra" hidden>
      <div class="br-texto"><strong id="br-qtd"></strong><span class="sub">ainda não salvo</span></div>
      <div class="br-botoes"><button type="button" class="btn" id="desfazer">Desfazer</button><button type="button" class="btn primario" id="salvar">Salvar alterações</button></div>
    </div>`;
  const $ = (s) => el.querySelector(s);

  const lucroTexto = (preco, custo) => {
    if (preco == null) return '<span class="falta">sem preço</span>';
    if (custo == null) return '<span class="falta">sem custo</span>';
    const l = preco - custo;
    return `<span class="${l < 0 ? 'falta' : 'confere'}">lucro ${dinheiro(l)} · ${preco ? Math.round((l / preco) * 100) : 0}%</span>`;
  };
  const campo = (k, rotulo, dica) => `<label class="pc-campo"><span class="rotulo-m">${rotulo}</span><input class="entrada num" data-k="${esc(k)}" inputmode="numeric" aria-label="${esc(dica)}"></label>`;

  function desenhar() {
    const t = busca.toLowerCase();
    $('#rot-semcusto').textContent = `Sem custo (${semCusto().length})`;
    const lista = (filtro === 'semcusto' ? semCusto() : produtos)
      .filter((p) => !t || p.nome.toLowerCase().includes(t) || p.variacoes.some((v) => (v.nome || v.linha || '').toLowerCase().includes(t)));
    $('#lista').innerHTML = lista.length ? lista.map((p) => {
      const linhas = comFileiras(p);
      const v0 = p.variacoes[0];
      return `
      <section class="cartao pc-produto">
        <div class="pc-linha pc-base" data-p="${esc(p.id)}">
          <span class="pc-nome"><strong>${esc(p.nome)}</strong>${p.ativo ? '' : ' <span class="etiqueta">fora da venda</span>'}
            <span class="sub">${linhas ? 'Valor do produto (vale para as variações sem valor próprio)' : ''}</span></span>
          ${campo(`p|${p.id}|preco`, 'Preço', `Preço de ${p.nome}`)}
          ${campo(`p|${p.id}|custo`, 'Custo', `Custo de ${p.nome}`)}
          <span class="pc-lucro num" data-lucro>${linhas ? '' : lucroTexto(precoDe(p, v0), custoDe(p, v0))}</span>
        </div>
        ${linhas ? p.variacoes.map((v) => `
        <div class="pc-linha pc-var" data-v="${esc(v.id)}">
          <span class="pc-nome">${esc(v.nome || v.linha || 'Único')}</span>
          ${campo(`v|${v.id}|preco`, 'Preço', `Preço de ${p.nome} ${v.nome || v.linha || ''}`)}
          ${campo(`v|${v.id}|custo`, 'Custo', `Custo de ${p.nome} ${v.nome || v.linha || ''}`)}
          <span class="pc-lucro num" data-lucro>${lucroTexto(precoDe(p, v), custoDe(p, v))}</span>
        </div>`).join('') : ''}
      </section>`;
    }).join('') : `<div class="cartao"><p class="sub">${filtro === 'semcusto' ? 'Todos os itens têm custo.' : 'Nenhum produto encontrado.'}</p></div>`;

    el.querySelectorAll('[data-k]').forEach((inp) => {
      const k = inp.dataset.k;
      const [t, id] = k.split('|');
      campoDinheiro(inp, { permitirZero: true });
      escreverCentavos(inp, valor(k));
      if (t === 'v') {
        const { p } = varPorId.get(id);
        const campoNome = k.endsWith('preco') ? 'preco' : 'custo';
        const doProduto = valor(`p|${p.id}|${campoNome}`);
        inp.placeholder = doProduto == null ? '—' : `= ${dinheiro(doProduto)}`;
      } else inp.placeholder = k.endsWith('preco') ? 'R$ 0,00' : 'sem custo';
      inp.closest('.pc-linha').classList.toggle('alterado', rascunho.has(k) && rascunho.get(k) !== salvoDe(k));
      inp.addEventListener('input', () => {
        const n = (inp.value || '').trim() === '' ? null : lerCentavos(inp);
        if (n === salvoDe(k)) rascunho.delete(k); else rascunho.set(k, n);
        atualizar(inp);
      });
    });
    atualizarBarra();
  }

  // Atualiza o lucro do produto mexido (sem redesenhar: o teclado não fecha)
  function atualizar(inp) {
    const sec = inp.closest('.pc-produto');
    const pid = sec.querySelector('[data-p]').dataset.p;
    const p = prodPorId.get(pid);
    sec.querySelectorAll('.pc-linha').forEach((linha) => {
      const ks = [...linha.querySelectorAll('[data-k]')].map((x) => x.dataset.k);
      linha.classList.toggle('alterado', ks.some((k) => rascunho.has(k) && rascunho.get(k) !== salvoDe(k)));
    });
    if (!comFileiras(p)) sec.querySelector('[data-lucro]').innerHTML = lucroTexto(precoDe(p, p.variacoes[0]), custoDe(p, p.variacoes[0]));
    sec.querySelectorAll('[data-v]').forEach((linha) => {
      const { v } = varPorId.get(linha.dataset.v);
      linha.querySelector('[data-lucro]').innerHTML = lucroTexto(precoDe(p, v), custoDe(p, v));
      linha.querySelectorAll('[data-k]').forEach((x) => {
        const campoNome = x.dataset.k.endsWith('preco') ? 'preco' : 'custo';
        const doProduto = valor(`p|${p.id}|${campoNome}`);
        x.placeholder = doProduto == null ? '—' : `= ${dinheiro(doProduto)}`;
      });
    });
    $('#rot-semcusto').textContent = `Sem custo (${semCusto().length})`;
    atualizarBarra();
  }

  function atualizarBarra() {
    const n = alterados().length;
    $('#barra').hidden = !n;
    $('#br-qtd').textContent = `${n} ${n === 1 ? 'alteração' : 'alterações'}`;
  }

  el.querySelectorAll('input[name="filtro"]').forEach((r) => r.addEventListener('change', () => { filtro = r.value; desenhar(); }));
  $('#busca').addEventListener('input', (e) => { busca = e.target.value.trim(); desenhar(); });
  $('#desfazer').addEventListener('click', async () => {
    if (!(await confirmar({ titulo: 'Desfazer as alterações?', texto: 'Preços e custos voltam ao que estava salvo.', botao: 'Desfazer', perigo: true }))) return;
    rascunho.clear(); desenhar();
  });
  $('#salvar').addEventListener('click', async () => {
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    const lista = alterados();
    // Produto precisa ter preço
    const semPreco = lista.find((k) => k.startsWith('p|') && k.endsWith('|preco') && rascunho.get(k) == null);
    if (semPreco) { aviso(`${prodPorId.get(semPreco.split('|')[1]).nome}: informe o preço.`, { tipo: 'erro' }); return; }
    const agora = new Date().toISOString();
    await db.transaction('rw', db.produtos, db.variacoes, async () => {
      for (const k of lista) {
        const [t, id, campoNome] = k.split('|');
        const n = rascunho.get(k);
        if (t === 'p') { await db.produtos.update(id, { [campoNome]: n, atualizadoEm: agora }); prodPorId.get(id)[campoNome] = n; }
        else { await db.variacoes.update(id, { [campoNome]: n }); varPorId.get(id).v[campoNome] = n; await db.produtos.update(varPorId.get(id).p.id, { atualizadoEm: agora }); }
      }
    });
    rascunho.clear();
    desenhar();
    aviso(`${lista.length} ${lista.length === 1 ? 'alteração salva' : 'alterações salvas'}. Se mudou preço, publique a base para os caixas.`);
  });

  saida.pendente = () => alterados().length > 0;
  desenhar();
  return () => { saida.pendente = null; };
}
