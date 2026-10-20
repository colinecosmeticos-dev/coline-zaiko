// =========================================================
// Janela de cobrança.
// Botões das formas de pagamento (na ordem cadastrada). Escolhida a
// forma, o valor já vem preenchido com o que falta. No dinheiro, o app
// calcula o troco; no crédito, escolhe parcelas e quem paga os juros.
// Para dividir o pagamento, informe um valor menor e escolha outra forma
// para o restante.
// =========================================================
import { listarFormasPagamento, PARCELAS_MAX, adicionarSaida } from '../db.js';
import { esc, dinheiro, abrirJanela, campoDinheiro, lerCentavos, escreverCentavos, icones, confirmar as perguntar } from '../ui.js';
import { som } from '../sons.js';
import { carrinho, calcularItem, calcularTotais, limparCarrinho, guardarCarrinho } from './carrinho.js';
import { gravarRegistro, registroDoCarrinho, FORMAS_REEMBOLSO } from './registro.js';

// Cédulas brasileiras: cada toque soma o valor da nota ao recebido
const CEDULAS = [200, 500, 1000, 2000, 5000, 10000, 20000];
// Moedas mais usadas no troco
const MOEDAS = [100, 50, 25];
const rotuloValor = (v) => '+' + (v % 100 ? (v / 100).toFixed(2).replace('.', ',') : v / 100);

// Resumo curto da venda para conferir antes de receber
function resumoVenda() {
  const t = calcularTotais();
  const descontoItens = carrinho.itens.reduce((s, i) => s + calcularItem(i).desconto, 0);
  const brindes = carrinho.itens.filter((i) => i.brinde).reduce((s, i) => s + i.quantidade, 0);
  const partes = [`${t.quantidade} ${t.quantidade === 1 ? 'item' : 'itens'}`];
  if (descontoItens + t.descontoVenda) partes.push(`desconto ${dinheiro(descontoItens + t.descontoVenda)}`);
  if (brindes) partes.push(`${brindes} ${brindes === 1 ? 'brinde' : 'brindes'}`);
  if (t.credito) partes.push(`crédito da troca ${dinheiro(t.credito)}`);
  const linhas = carrinho.itens.map((i) => {
    const c = calcularItem(i);
    return `<li><span class="qtd num">${i.quantidade}×</span>
      <span class="nome">${esc(i.nome)}${i.variacaoNome ? ` <span class="sub">${esc(i.variacaoNome)}</span>` : ''}</span>
      <span class="num">${i.brinde ? '<span class="etiqueta marca">Brinde</span>' : `${c.desconto ? `<s class="sub">${dinheiro(c.bruto)}</s> ` : ''}${dinheiro(c.total)}`}</span></li>`;
  }).join('');
  const descontoVenda = t.descontoVenda ? `<li class="linha-desconto"><span class="nome">Desconto na venda</span><span class="num">− ${dinheiro(t.descontoVenda)}</span></li>` : '';
  const credito = t.credito ? `<li class="linha-desconto"><span class="nome">Crédito da troca (${esc(carrinho.troca.origemNumero)})</span><span class="num">− ${dinheiro(t.credito)}</span></li>` : '';
  return { texto: partes.join(' · '), lista: linhas + descontoVenda + credito };
}

// Botão "Nova venda" da tela final: só funciona depois de um instante. O leitor de
// código manda um Enter no fim de cada leitura; sem isso, ler o próximo produto logo
// depois de finalizar fechava a tela antes de alguém ver o troco (v0.25.0).
export function ligarBotaoNova(d) {
  const b = d.querySelector('#nova');
  b.disabled = true;
  b.addEventListener('click', () => d.close());
  setTimeout(() => { if (b.isConnected) { b.disabled = false; b.focus(); } }, 1200);
}

// Tela final (venda, troca ou devolução concluída)
export function telaConcluida(registro, { valorDevolver = 0 } = {}) {
  const titulo = registro.tipo === 'troca' ? `Troca ${esc(registro.numero)} concluída`
    : registro.tipo === 'devolucao' ? `Devolução ${esc(registro.numero)} concluída` : `Venda ${esc(registro.numero)} concluída`;
  const destaque = registro.troco ? [(registro.pagamentos || []).some((p) => p.trocoEmDinheiro) ? 'Troco em dinheiro' : 'Troco', registro.troco]
    : valorDevolver ? [`Devolver ao cliente${registro.reembolsos[0] ? ` (${esc(registro.reembolsos[0].nome)})` : ''}`, valorDevolver] : null;
  return `
    <div class="venda-concluida">
      <div class="marca-ok" aria-hidden="true">✓</div>
      <h2>${titulo}</h2>
      ${registro.tipo === 'devolucao' ? '' : `<p class="num">${registro.total < 0 ? 'Diferença ' + dinheiro(-registro.total) : dinheiro(registro.total)}</p>`}
      ${destaque ? `<div class="troco-final"><span>${destaque[0]}</span><strong class="num">${dinheiro(destaque[1])}</strong></div>` : ''}
      <button type="button" class="btn primario btn-confirmar" id="nova">${registro.tipo === 'devolucao' ? 'Pronto' : 'Nova venda'}</button>
    </div>`;
}

// Escolha de como devolver um valor ao cliente. Nada vem marcado: quem opera
// precisa escolher (evita devolver pela forma errada num toque apressado).
// pagoCom: texto de como o cliente pagou, para ajudar na escolha.
export function htmlFormasReembolso(pagoCom) {
  return `<div class="opcoes" role="radiogroup" aria-label="Como devolver">
    ${FORMAS_REEMBOLSO.map((f) => `<label><input type="radio" name="reembolso" value="${f.tipo}"><span>${esc(f.nome)}</span></label>`).join('')}
  </div>
  ${pagoCom ? `<span class="dica">O cliente pagou com: ${esc(pagoCom)}</span>` : ''}`;
}

// Texto de como uma venda foi paga (ex.: "Pix QR Code + Crédito 3x")
export function textoPagamento(venda) {
  return [...new Set((venda.pagamentos || []).map((p) => p.formaNome + (p.parcelas > 1 ? ` ${p.parcelas}x` : '')))].join(' + ');
}

// Troca em que o crédito cobre tudo: diferença zero ou a devolver ao cliente
export function finalizarTrocaSemCobranca({ evento, caixa, pagoCom = '' }) {
  return new Promise((resolver) => {
    const { total } = calcularTotais();
    const devolver = -total;
    let concluida = false;
    const d = abrirJanela(`
      <div class="cobrar">
        <header class="cobrar-topo">
          <div><span class="sub">${devolver ? 'Diferença a devolver' : 'Troca sem diferença'}</span><strong class="num cobrar-total">${dinheiro(devolver)}</strong></div>
          <span></span>
          <button type="button" class="btn-icone" id="fechar" aria-label="Voltar ao carrinho">${icones.fechar}</button>
        </header>
        ${devolver ? `<div class="campo"><span class="rotulo">Como devolver a diferença</span>${htmlFormasReembolso(pagoCom)}</div>` : '<p>O crédito dos itens devolvidos cobre os itens novos.</p>'}
        <button type="button" class="btn primario btn-confirmar" id="finalizar" ${devolver ? 'disabled' : ''}>${devolver ? 'Escolha como devolver' : 'Finalizar troca'}</button>
      </div>`, { classe: 'janela-cobrar janela-estreita', aoFechar: () => resolver(concluida) });
    d.querySelector('#fechar').addEventListener('click', () => d.close());
    d.querySelectorAll('input[name="reembolso"]').forEach((r) => r.addEventListener('change', () => {
      d.querySelector('#finalizar').disabled = false;
      d.querySelector('#finalizar').textContent = `Devolver ${dinheiro(devolver)} e finalizar`;
    }));
    d.querySelector('#finalizar').addEventListener('click', async () => {
      const escolhida = d.querySelector('input[name="reembolso"]:checked');
      if (devolver && !escolhida) return;
      d.querySelector('#finalizar').disabled = true;
      const forma = devolver ? FORMAS_REEMBOLSO.find((f) => f.tipo === escolhida.value) : null;
      const registro = await gravarRegistro(registroDoCarrinho({ evento, caixa, reembolsos: forma ? [{ ...forma, valor: devolver }] : [] }));
      limparCarrinho();
      concluida = { registro, devolver };
      som.venda();
      d.querySelector('.cobrar').innerHTML = telaConcluida(registro, { valorDevolver: devolver });
      ligarBotaoNova(d);
    });
  });
}

export function abrirCobranca({ evento, caixa }) {
  return new Promise(async (resolver) => {
    const formas = (await listarFormasPagamento()).filter((f) => f.ativo);
    const { total } = calcularTotais();
    // Pagamentos já lançados ficam no carrinho (gravados no aparelho): sair da
    // cobrança ou o app fechar não os perde
    const pagamentos = carrinho.pagamentos;
    let forma = null;      // forma escolhida no momento
    let concluida = false;
    const resumo = resumoVenda();

    const d = abrirJanela(`
      <div class="cobrar">
        <header class="cobrar-topo">
          <div><span class="sub">${carrinho.troca ? 'Diferença a pagar' : 'Total da venda'}</span><strong class="num cobrar-total">${dinheiro(total)}</strong></div>
          <div class="cobrar-situacao num" id="situacao"></div>
          <button type="button" class="btn-icone" id="fechar" aria-label="Voltar ao carrinho">${icones.fechar}</button>
        </header>
        <div class="cobrar-resumo">
          <button type="button" class="btn texto" id="ver-itens" aria-expanded="false">${resumo.texto} <span id="ver-itens-rotulo">· Ver itens</span></button>
          <ul class="resumo-itens" id="resumo-itens" hidden>${resumo.lista}</ul>
        </div>
        <div class="cobrar-corpo">
          <div class="grade-formas" id="formas">
            ${formas.map((f) => `<button type="button" class="btn botao-forma" data-forma="${esc(f.id)}">${esc(f.nome)}</button>`).join('')}
            ${carrinho.troca ? '' : '<button type="button" class="btn texto botao-sem-cobrar" id="sem-cobrar">Sem cobrar: brinde ou avaria</button>'}
          </div>
          <div class="cobrar-detalhe">
            <ul class="lista-pagamentos" id="pagamentos"></ul>
            <p class="dica-forma sub" id="dica-forma">Escolha a forma de pagamento.</p>
            <div class="painel-forma" id="painel" hidden></div>
            <button type="button" class="btn primario btn-finalizar" id="finalizar" hidden>${carrinho.troca ? 'Finalizar troca' : 'Finalizar venda'}</button>
          </div>
        </div>
      </div>`, { classe: 'janela-cobrar', aoFechar: () => resolver(concluida) });

    const $ = (s) => d.querySelector(s);
    const pago = () => pagamentos.reduce((s, p) => s + p.valor, 0);
    const falta = () => Math.max(total - pago(), 0);
    // Pagamentos lançados que passam do total (a venda mudou depois de lançar)
    const excesso = () => Math.max(pago() - total, 0);
    const trocoTotal = () => pagamentos.reduce((s, p) => s + (p.troco || 0), 0);

    function desenharSituacao() {
      $('#situacao').innerHTML = pagamentos.length
        ? `<span>Pago ${dinheiro(pago())}</span><strong>${excesso() ? `Passou ${dinheiro(excesso())}` : falta() ? `Falta ${dinheiro(falta())}` : trocoTotal() ? `Troco ${dinheiro(trocoTotal())}` : 'Pago'}</strong>`
        : '';
      $('#pagamentos').innerHTML = pagamentos.map((p, i) => `
        <li><span>${esc(p.formaNome)}${p.parcelas > 1 ? ` em ${p.parcelas}x` : ''}${p.troco ? ` <span class="sub">(recebido ${dinheiro(p.recebido)}, troco ${dinheiro(p.troco)})</span>` : ''}</span>
          <span class="num">${dinheiro(p.valor)}</span>
          <button type="button" class="btn-icone" data-remover="${i}" aria-label="Remover pagamento">${icones.fechar}</button></li>`).join('');
      d.querySelectorAll('.botao-forma').forEach((b) => { b.disabled = !falta(); });
      $('#finalizar').hidden = !!falta() || !pagamentos.length || !!excesso();
      $('#dica-forma').hidden = (!falta() && !excesso()) || !!forma;
      $('#dica-forma').textContent = excesso() ? `Os pagamentos lançados passam do total em ${dinheiro(excesso())} (a venda mudou). Remova um pagamento (X) e lance de novo.`
        : pagamentos.length ? `Escolha a forma para os ${dinheiro(falta())} que faltam.` : 'Escolha a forma de pagamento.';
      if (!falta()) $('#painel').hidden = true;
      if ($('#sem-cobrar')) $('#sem-cobrar').hidden = !!pagamentos.length;
    }

    $('#pagamentos').addEventListener('click', (e) => {
      const b = e.target.closest('[data-remover]');
      if (!b) return;
      pagamentos.splice(Number(b.dataset.remover), 1);
      guardarCarrinho();
      desenharSituacao();
    });

    // ---------- Painel da forma escolhida ----------
    function escolher(f) {
      forma = f;
      $('#sem-cobrar')?.classList.remove('ativo');
      d.querySelectorAll('.botao-forma').forEach((b) => b.classList.toggle('ativo', b.dataset.forma === f.id));
      const painel = $('#painel');
      painel.hidden = false;
      $('#dica-forma').hidden = true;
      const restante = falta();
      const ehDinheiro = f.tipo === 'dinheiro';
      const ehCredito = f.tipo === 'credito';
      painel.innerHTML = `
        <div class="campo">
          <label for="valor-pag">${ehDinheiro ? 'Valor recebido' : 'Valor'}</label>
          <input class="entrada entrada-grande" id="valor-pag">
        </div>
        ${ehDinheiro ? `
          <p class="troco num" id="troco" aria-live="polite"></p>
          <div class="cedulas">${CEDULAS.map((v) => `<button type="button" class="btn" data-cedula="${v}">${rotuloValor(v)}</button>`).join('')}</div>
          <div class="moedas-acoes">
            <div class="moedas">${MOEDAS.map((v) => `<button type="button" class="btn moeda" data-cedula="${v}" aria-label="Moeda de ${dinheiro(v)}">${rotuloValor(v)}</button>`).join('')}</div>
            <div class="acoes-recebido">
              <button type="button" class="btn" id="exato">Exato · ${dinheiro(restante)}</button>
              <button type="button" class="btn" id="limpar-recebido">Limpar</button>
            </div>
          </div>` : ''}
        ${ehCredito ? `
          <div class="campo"><span class="rotulo">Parcelas</span>
            <div class="segmentos" role="radiogroup" aria-label="Parcelas">
              ${Array.from({ length: PARCELAS_MAX }, (_, k) => k + 1).map((n) => `<label><input type="radio" name="parcelas" value="${n}" ${n === 1 ? 'checked' : ''}><span>${n}x</span></label>`).join('')}
            </div></div>
          <div class="campo" id="campo-juros" hidden><span class="rotulo">Juros do parcelado pagos por</span>
            <div class="segmentos" role="radiogroup" aria-label="Quem paga os juros">
              <label><input type="radio" name="juros" value="vendedor" checked><span>Vendedor</span></label>
              <label><input type="radio" name="juros" value="cliente"><span>Cliente</span></label>
            </div></div>` : ''}
        <button type="button" class="btn primario btn-confirmar" id="confirmar"></button>`;

      const campo = $('#valor-pag');
      campoDinheiro(campo);
      escreverCentavos(campo, restante);
      // O valor exato vem sugerido; o primeiro toque numa cédula começa a contagem do zero
      let sugerido = ehDinheiro;

      function atualizar() {
        const v = lerCentavos(campo) || 0;
        if (ehDinheiro) {
          const troco = v - restante;
          const t = $('#troco');
          // Textos de ajuda ficam à esquerda; valores (troco/falta) à direita, alinhados com o campo
          const dica = sugerido || !v;
          t.className = 'troco num' + (dica ? ' dica' : troco < 0 ? ' falta' : troco === 0 ? ' zerado' : '');
          t.textContent = sugerido ? 'Valor exato. Toque nas cédulas e moedas para somar o que o cliente entregou.'
            : !v ? 'Toque nas cédulas e moedas ou digite o valor recebido.'
            : troco > 0 ? `Troco ${dinheiro(troco)}`
            : troco < 0 ? `Faltam ${dinheiro(-troco)}` : 'Sem troco';
        }
        const cobre = v >= restante;
        $('#confirmar').textContent = cobre && v > 0 ? (carrinho.troca ? 'Finalizar troca' : 'Finalizar venda') : `Adicionar ${dinheiro(v)}`;
        // Fora do dinheiro, valor maior que o que falta: avisa já no campo
        if (!ehDinheiro) {
          let a = $('#aviso-maior');
          if (!a) { a = document.createElement('p'); a.id = 'aviso-maior'; a.className = 'aviso-maior'; campo.closest('.campo').after(a); }
          a.textContent = v > restante ? `Passa ${dinheiro(v - restante)} do que falta: o app vai perguntar se é troco em dinheiro.` : '';
          a.hidden = !(v > restante);
        }
        $('#confirmar').disabled = !v;
      }
      campo.addEventListener('input', () => { sugerido = false; atualizar(); });
      painel.querySelectorAll('[data-cedula]').forEach((b) => b.addEventListener('click', () => {
        const base = sugerido ? 0 : (lerCentavos(campo) || 0);
        escreverCentavos(campo, base + Number(b.dataset.cedula));
        sugerido = false;
        atualizar();
      }));
      if (ehDinheiro) {
        $('#exato').addEventListener('click', () => { escreverCentavos(campo, restante); sugerido = true; atualizar(); });
        $('#limpar-recebido').addEventListener('click', () => { escreverCentavos(campo, null); sugerido = false; atualizar(); });
      }
      painel.querySelectorAll('input[name="parcelas"]').forEach((r) => r.addEventListener('change', () => {
        $('#campo-juros').hidden = Number(r.value) === 1 || !r.checked;
      }));
      $('#confirmar').addEventListener('click', () => confirmar());
      atualizar();
      // Em tela de toque, não abre o teclado sozinho (ele cobriria os atalhos e o botão)
      if (!ehDinheiro || !matchMedia('(pointer: fine)').matches) $('#confirmar').focus(); else campo.focus();
    }

    // Confirma o pagamento da forma escolhida. Pix, cartão etc. com valor MAIOR que o
    // que falta (v0.26.0): pergunta se é para corrigir ou dar a diferença de troco em
    // dinheiro. Com troco: valor = o que falta (conta na venda), recebido = o valor
    // passado na maquininha, troco = a diferença, que sai do dinheiro do caixa.
    let confirmando = false;
    async function confirmar() {
      if (confirmando) return;
      const restante = falta();
      const v = lerCentavos($('#valor-pag')) || 0;
      if (!v) return;
      const p = { formaId: forma.id, formaNome: forma.nome, tipo: forma.tipo, parcelas: 1, jurosPor: null, taxa: forma.taxa ?? null };
      if (forma.tipo === 'dinheiro') {
        p.valor = Math.min(v, restante);
        p.recebido = v;
        p.troco = Math.max(v - restante, 0);
        p.taxa = 0;
      } else if (v > restante) {
        confirmando = true;
        const darTroco = await perguntar({
          titulo: `${forma.nome} de ${dinheiro(v)} é maior que o que falta (${dinheiro(restante)})`,
          texto: `Se o cliente já pagou ${dinheiro(v)}, dê ${dinheiro(v - restante)} de troco em dinheiro: o caixa desconta esse valor do dinheiro esperado. Se o valor foi digitado errado, corrija.`,
          botao: `Dar ${dinheiro(v - restante)} de troco em dinheiro`, cancelar: 'Corrigir o valor'
        });
        confirmando = false;
        if (!darTroco) { const c = $('#valor-pag'); if (c) { escreverCentavos(c, restante); c.focus(); c.dispatchEvent(new Event('input')); } return; }
        p.valor = restante;
        p.recebido = v;
        p.troco = v - restante;
        p.trocoEmDinheiro = true;
      } else {
        p.valor = v;
      }
      if (forma.tipo === 'credito') {
        p.parcelas = Number(d.querySelector('input[name="parcelas"]:checked').value);
        p.jurosPor = p.parcelas > 1 ? d.querySelector('input[name="juros"]:checked').value : null;
        const taxas = forma.taxasCredito || {};
        // Juros pagos pelo cliente: usa a taxa à vista (decisão registrada na especificação)
        p.taxa = (p.jurosPor === 'cliente' ? taxas[1] : taxas[p.parcelas]) ?? null;
      }
      pagamentos.push(p);
      guardarCarrinho();
      forma = null;
      d.querySelectorAll('.botao-forma').forEach((b) => b.classList.remove('ativo'));
      $('#painel').hidden = true;
      desenharSituacao();
      if (!falta()) finalizar();
    }

    $('#ver-itens').addEventListener('click', () => {
      const lista = $('#resumo-itens');
      lista.hidden = !lista.hidden;
      $('#ver-itens').setAttribute('aria-expanded', String(!lista.hidden));
      $('#ver-itens-rotulo').textContent = lista.hidden ? '· Ver itens' : '· Esconder itens';
    });
    d.querySelectorAll('[data-forma]').forEach((b) => b.addEventListener('click', () => escolher(formas.find((f) => f.id === b.dataset.forma))));
    // Sair da cobrança com pagamento lançado: pergunta antes (os pagamentos ficam guardados)
    async function sair() {
      if (!pagamentos.length || concluida) { d.close(); return; }
      const formasPagas = [...new Set(pagamentos.map((p) => p.formaNome))].join(' e ');
      const ok = await perguntar({
        titulo: 'Sair da cobrança?',
        texto: `Já foram lançados ${dinheiro(pago())} (${formasPagas}). Eles ficam guardados nesta venda: ao tocar em Cobrar de novo, continuam lá.`,
        botao: 'Sair e manter os pagamentos', cancelar: 'Continuar cobrando'
      });
      if (ok) d.close();
    }
    $('#fechar').addEventListener('click', sair);
    d.addEventListener('cancel', (e) => { if (pagamentos.length && !concluida) { e.preventDefault(); sair(); } });
    $('#finalizar').addEventListener('click', finalizar);

    // ---------- Sem cobrar: brinde/doação ou avaria (saída sem venda) ----------
    // Os itens do carrinho saem do estoque sem entrar no faturamento,
    // como os brindes e avarias da tela Estoque.
    $('#sem-cobrar')?.addEventListener('click', () => {
      forma = null;
      d.querySelectorAll('.botao-forma').forEach((b) => b.classList.remove('ativo'));
      $('#sem-cobrar').classList.add('ativo');
      $('#dica-forma').hidden = true;
      $('#finalizar').hidden = true;
      const pecas = carrinho.itens.reduce((s, i) => s + i.quantidade, 0);
      const painel = $('#painel');
      painel.hidden = false;
      painel.innerHTML = `
        <div class="campo"><span class="rotulo">Tipo de saída</span>
          <div class="opcoes" role="radiogroup" aria-label="Tipo de saída">
            <label><input type="radio" name="tipo-saida" value="brinde"><span>Brinde ou doação</span></label>
            <label><input type="radio" name="tipo-saida" value="avaria"><span>Avaria (defeito)</span></label>
          </div></div>
        <div class="campo"><label for="motivo-saida">Motivo</label>
          <input class="entrada" id="motivo-saida" maxlength="140" autocomplete="off" placeholder="Ex.: sorteio do evento, frasco vazando"></div>
        <p class="sub">${pecas} ${pecas === 1 ? 'peça sai' : 'peças saem'} do estoque sem cobrar. Não entra no faturamento.</p>
        <button type="button" class="btn primario btn-finalizar" id="registrar-saida" disabled>Escolha o tipo e o motivo</button>`;
      const tipoSaida = () => painel.querySelector('input[name="tipo-saida"]:checked');
      const conferir = () => {
        const ok = tipoSaida() && $('#motivo-saida').value.trim();
        $('#registrar-saida').disabled = !ok;
        $('#registrar-saida').textContent = ok ? `Registrar ${tipoSaida().value === 'avaria' ? 'avaria' : 'brinde'}` : 'Escolha o tipo e o motivo';
      };
      painel.querySelectorAll('input[name="tipo-saida"]').forEach((x) => x.addEventListener('change', () => { conferir(); $('#motivo-saida').focus(); }));
      $('#motivo-saida').addEventListener('input', conferir);
      $('#registrar-saida').addEventListener('click', async () => {
        if (gravando || $('#registrar-saida').disabled) return;
        gravando = true;
        const tipo = tipoSaida().value, motivo = $('#motivo-saida').value.trim();
        for (const i of carrinho.itens) {
          await adicionarSaida({
            eventoId: evento.id, tipo, quantidade: i.quantidade, motivo,
            variacaoId: i.variacaoId, produtoId: i.produtoId, nome: i.nome, variacaoNome: i.variacaoNome || '',
            categoriaNome: i.categoriaNome || '', tipoNome: i.tipoNome || '', linhaNome: i.linhaNome || '',
            custoUnit: i.custoUnit ?? null
          });
        }
        limparCarrinho();
        concluida = { saida: { tipo, pecas, motivo } };
        som.venda();
        d.querySelector('.cobrar').innerHTML = `
          <div class="venda-concluida">
            <div class="marca-ok" aria-hidden="true">✓</div>
            <h2>${tipo === 'avaria' ? 'Avaria registrada' : 'Brinde registrado'}</h2>
            <p>${pecas} ${pecas === 1 ? 'peça' : 'peças'} · ${esc(motivo)}</p>
            <button type="button" class="btn primario btn-confirmar" id="nova">Nova venda</button>
          </div>`;
        ligarBotaoNova(d);
      });
    });

    // ---------- Gravar a venda ----------
    let gravando = false;
    async function finalizar() {
      if (gravando || falta() || excesso()) return;
      gravando = true;
      const venda = await gravarRegistro(registroDoCarrinho({ evento, caixa, pagamentos: [...pagamentos], troco: trocoTotal() }));
      limparCarrinho();
      concluida = { registro: venda };
      som.venda();
      d.querySelector('.cobrar').innerHTML = telaConcluida(venda);
      ligarBotaoNova(d);
    }

    desenharSituacao();
    // Uma forma só ativa: já abre direto nela
    if (formas.length === 1) escolher(formas[0]);
  });
}
