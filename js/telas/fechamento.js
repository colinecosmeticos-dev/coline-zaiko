// =========================================================
// Tela Fechamento do evento (Mais → Fechamento do evento), com PIN.
// Junta tudo o que está neste aparelho sobre o evento em uso (no
// principal, depois de juntar as vendas dos outros aparelhos):
// resultado, formas de pagamento, dias, aparelhos, despesas, caixas,
// estoque e exportação em planilha. Aqui também se encerra o evento.
// =========================================================
import { custosDoCadastro, completarCustos, completarCustosSaidas } from '../painel/custos.js';
import { db, lerEventoAtivo, listarProdutosCompletos, lerLevado, lerContado } from '../db.js';
import { esc, dinheiro, icones, aviso, confirmar, periodo , percentual } from '../ui.js';
import { pedirPin, temPin } from '../pin.js';
import { calcularFechamento } from '../fechamento/calculo.js';
import { planilhaFechamento } from '../fechamento/planilha.js';
import { driveConfigurado, prepararDrive, autorizar, enviarPlanilha } from '../drive.js';
import { aparelhosDoEvento } from '../vendas-arquivo.js';

const dia = (iso) => new Date(iso + 'T12:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' }).replace('.', '');
const qtd = (n, um, varios) => `${n.toLocaleString('pt-BR')} ${n === 1 ? um : varios}`;
const dif = (v) => v == null ? '—' : v === 0 ? 'Confere' : `${v > 0 ? 'Sobra' : 'Falta'} ${dinheiro(Math.abs(v))}`;

export async function render(el, { mostrar = false } = {}) {
  const evento = await lerEventoAtivo();
  const voltar = `<a class="voltar" href="#/mais">${icones.voltar} Mais</a>`;
  if (!evento) {
    el.innerHTML = `${voltar}<header class="cab"><h1>Fechamento do evento</h1></header>
      <div class="cartao vazio"><div class="simbolo" aria-hidden="true"><span class="logo-app"></span></div><h2>Escolha o evento</h2><p>O fechamento é feito por evento.</p><a class="btn primario" href="#/eventos">Ir para Eventos</a></div>`;
    return;
  }
  const comPin = await temPin();
  if (comPin && !mostrar) {
    el.innerHTML = `${voltar}<header class="cab"><div><h1>Fechamento do evento</h1><p class="sub">${esc(evento.nome)}</p></div></header>
      <div class="cartao vazio"><div class="simbolo" aria-hidden="true">${icones.cadeado}</div><h2>Protegido pelo PIN</h2>
      <p>Resultado, lucro e despesas do evento. Ao sair da tela, volta a ficar trancado.</p>
      <button type="button" class="btn primario" id="abrir">Ver fechamento</button></div>`;
    el.querySelector('#abrir').addEventListener('click', async () => { if (await pedirPin({ titulo: 'Fechamento do evento', texto: 'Digite o PIN.' })) render(el, { mostrar: true }); });
    return;
  }

  const [registrosGravados, caixas, movimentos, saidasGravadas, produtos, levado, aparelhos, contado] = await Promise.all([
    db.vendas.where('eventoId').equals(evento.id).toArray(),
    db.caixas.where('eventoId').equals(evento.id).toArray(),
    db.movimentos.where('eventoId').equals(evento.id).toArray(),
    db.saidas.where('eventoId').equals(evento.id).toArray(),
    listarProdutosCompletos(), lerLevado(evento.id), aparelhosDoEvento(evento), lerContado(evento.id)
  ]);
  // Itens vendidos sem custo usam o custo atual do cadastro (v0.32.0)
  const custos = custosDoCadastro(produtos);
  const { registros, unidades: custoDoCadastro } = completarCustos(registrosGravados, custos);
  const saidas = completarCustosSaidas(saidasGravadas, custos);
  const f = calcularFechamento({ registros, caixas, movimentos, saidas, produtos, levado, contado, perdas: evento.perdas || {}, custosEvento: evento.custos || null });
  const ce = f.custosEvento;
  const ct = f.estoque.contagem;
  const g = f.geral;
  const encerrado = evento.status === 'encerrado';
  const linha = (rotulo, valor, sinal = '', classe = '') => `<div class="${classe}"><span>${rotulo}</span><span class="num">${sinal}${dinheiro(valor)}</span></div>`;
  const total = (rotulo, valor) => `<div class="total"><span>${rotulo}</span><strong class="num">${dinheiro(valor)}</strong></div>`;

  el.innerHTML = `
    ${voltar}
    <header class="cab">
      <div><h1>Fechamento do evento</h1><p class="sub">${esc(evento.nome)} · ${esc(periodo(evento.dataInicio, evento.dataFim))}</p></div>
      ${comPin ? `<button type="button" class="btn" id="ocultar">${icones.cadeado} Ocultar</button>` : ''}
    </header>

    ${encerrado ? `<div class="cartao alerta-encerrado"><strong>Evento encerrado${evento.encerradoEm ? ` em ${new Date(evento.encerradoEm).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}` : ''}</strong>
      <p>Novas vendas estão bloqueadas. Trocas e devoluções feitas agora ficam como registro pós-evento e não mudam estes números.</p></div>` : ''}

    <section class="cartao conferencia">
      <h2>Conferência antes de fechar</h2>
      <ul class="lista-checagem">
        <li class="${aparelhos.length ? 'ok' : 'atencao'}">${aparelhos.length ? `Vendas de ${aparelhos.map((a) => `<strong>${esc(a.nome)}</strong> (${a.vendas})`).join(', ')}.` : 'Nenhuma venda neste evento.'} Algum outro aparelho vendeu? <a href="#/sincronizar">Buscar vendas dos caixas</a> · <a href="#/juntar">por arquivo</a></li>
        <li class="${f.caixasAbertos.length ? 'atencao' : 'ok'}">${f.caixasAbertos.length ? `${qtd(f.caixasAbertos.length, 'caixa ainda aberto', 'caixas ainda abertos')}: ${f.caixasAbertos.map((c) => `${esc(c.aparelho?.sigla || '')} ${dia(c.data)}`).join(', ')}. Feche no aparelho e junte de novo.` : 'Todos os caixas estão fechados.'}</li>
        ${f.caixasForaDasDatas.length ? `<li class="atencao">${qtd(f.caixasForaDasDatas.length, 'caixa aberto', 'caixas abertos')} fora das datas do evento: ${f.caixasForaDasDatas.map((c) => `${esc(c.aparelho?.sigla || '')} ${dia(c.data)}`).join(', ')}. Confira se essas vendas são mesmo deste evento.</li>` : ''}
        <li class="${f.estoque.totais.levado ? 'ok' : 'atencao'}">${f.estoque.totais.levado ? `Estoque levado registrado (${qtd(f.estoque.totais.levado, 'peça', 'peças')}).` : 'Estoque levado não registrado: a sobra não pode ser calculada.'} <a href="#/eventos/${encodeURIComponent(evento.id)}/estoque">Estoque</a></li>
        <li class="${ct.itensContados ? 'ok' : 'atencao'}">${ct.itensContados ? `Contagem final: ${ct.itensContados} de ${ct.itensTotal} itens contados.` : 'Contagem final do estoque não feita.'} <a href="#/eventos/${encodeURIComponent(evento.id)}/estoque">Contar</a></li>
        ${f.vendasDepois ? `<li class="ok">${qtd(f.vendasDepois, 'venda registrada depois', 'vendas registradas depois')} (de outro dia, já contadas no dia em que aconteceram).</li>` : ''}
        ${g.itensSemCusto ? `<li class="atencao">${qtd(g.itensSemCusto, 'item vendido sem custo', 'itens vendidos sem custo')} cadastrado: o lucro aparece maior do que é. <a href="#/produtos/precos?semcusto=1">Cadastrar custos</a></li>` : ''}
        ${custoDoCadastro ? `<li class="ok">${qtd(custoDoCadastro, 'item vendido', 'itens vendidos')} sem custo na hora da venda: usado o custo atual do cadastro. <a href="#/produtos/precos">Preços e custos</a></li>` : ''}
        ${g.pagamentosSemTaxa ? `<li class="atencao">${qtd(g.pagamentosSemTaxa, 'pagamento sem', 'pagamentos sem')} taxa informada: as taxas aparecem menores do que são.</li>` : ''}
      </ul>
    </section>

    <div class="kpis">
      <div class="kpi destaque"><span>${ce.tem ? 'Resultado final' : 'Resultado do evento'}</span><strong class="num">${dinheiro(f.resultadoFinal)}</strong>${ce.tem && f.margemFinal != null ? `<span class="sub">${Math.round(f.margemFinal * 100)}% do faturamento</span>` : ''}</div>
      <div class="kpi"><span>Faturamento</span><strong class="num">${dinheiro(g.faturamento)}</strong></div>
      <div class="kpi"><span>Vendas</span><strong class="num">${g.quantidadeVendas.toLocaleString('pt-BR')}</strong></div>
      <div class="kpi"><span>Ticket médio</span><strong class="num">${dinheiro(g.ticketMedio)}</strong></div>
    </div>

    <div class="painel-grade">
      <section class="cartao">
        <h2>Resultado</h2>
        <div class="contas">
          ${linha('Faturamento', g.faturamento)}
          ${linha('Taxas da maquininha (estimadas)', g.taxas, '− ')}
          ${total('Faturamento líquido', f.faturamentoLiquido)}
          ${linha('Custo dos produtos', g.custo, '− ')}
          ${linha('Despesas do caixa', f.despesas, '− ')}
          ${total(ce.tem ? 'Resultado das vendas' : 'Resultado do evento', f.resultado)}
          ${ce.tem ? `
          ${ce.valorFixo ? linha('Valor do evento', ce.valorFixo, '− ') : ''}
          ${ce.comissaoPct ? linha(`Comissão (${percentual(ce.comissaoPct)} das vendas)`, ce.comissao, '− ') : ''}
          ${ce.estrutura ? linha('Estrutura', ce.estrutura, '− ') : ''}
          ${ce.equipe ? linha(`Equipe <span class="sub">(${ce.pessoas.length} ${ce.pessoas.length === 1 ? 'pessoa' : 'pessoas'}, ${ce.diarias} ${ce.diarias === 1 ? 'diária' : 'diárias'})</span>`, ce.equipe, '− ') : ''}
          ${total('Resultado final', f.resultadoFinal)}` : ''}
          ${f.contaBrindes ? linha('Brindes (custo)', f.perdaBrindes, '− ') : linha('Brindes (custo) <span class="sub">· fora da conta</span>', f.perdaBrindes, '', 'fora-conta')}
          ${f.contaAvarias ? linha('Avarias (custo)', f.perdaAvarias, '− ') : linha('Avarias (custo) <span class="sub">· fora da conta</span>', f.perdaAvarias, '', 'fora-conta')}
          ${total('Resultado depois das perdas', f.resultadoDepoisPerdas)}
        </div>
        <div class="opcoes-perdas">
          <label class="marcar-perda"><input type="checkbox" id="conta-brindes" ${f.contaBrindes ? 'checked' : ''} ${encerrado ? 'disabled' : ''}> Brindes entram como perda</label>
          <label class="marcar-perda"><input type="checkbox" id="conta-avarias" ${f.contaAvarias ? 'checked' : ''} ${encerrado ? 'disabled' : ''}> Avarias entram como perda</label>
          <p class="sub">Desmarcado: as peças continuam saindo do estoque, mas o custo não é descontado do resultado (ex.: avaria trocada com o fornecedor).</p>
        </div>
        <p class="sub nota-mov">Lucro bruto (faturamento − custo): ${dinheiro(g.lucroBruto)}. Descontos concedidos: ${dinheiro(g.descontos)}.${ce.equipe && f.equipePorVenda != null ? ` Equipe por venda: ${dinheiro(f.equipePorVenda)}.` : ''}</p>
        <p class="sub"><a href="#/eventos/${encodeURIComponent(evento.id)}/custos">${ce.tem ? 'Ver ou editar os custos do evento' : 'Informar os custos do evento (valor, estrutura e equipe)'}</a></p>
      </section>

      <section class="cartao">
        <h2>Por forma de pagamento</h2>
        <div class="contas">
          ${g.porForma.map((x) => linha(`${esc(x.nome)} <span class="sub">(${x.quantidade})</span>`, x.valor)).join('') || '<div><span class="sub">Nada recebido.</span></div>'}
          ${g.devolvido ? linha('Devolvido ao cliente', g.devolvido, '− ') : ''}
          ${total('Total', g.faturamento)}
        </div>
        <p class="sub nota-mov">Confira com o relatório da maquininha e o extrato da conta.</p>
      </section>

      <section class="cartao">
        <h2>Despesas e retiradas</h2>
        <div class="contas">
          ${f.categorias.length ? f.categorias.map((c) => linha(`${esc(c.nome)}${c.despesa ? '' : ' <span class="sub">(não é despesa)</span>'}`, c.valor)).join('') : '<div><span class="sub">Nenhuma retirada.</span></div>'}
          ${total('Despesas', f.despesas)}
        </div>
      </section>

      <section class="cartao">
        <h2>Caixas</h2>
        ${f.caixas.length ? `<table class="tabela-painel">
          <thead><tr><th>Dia</th><th>Aparelho</th><th class="num">Diferença</th></tr></thead>
          <tbody>${f.caixas.map((c) => `<tr><td>${esc(dia(c.data))}${c.foraDasDatas ? ' <span class="etiqueta">fora das datas</span>' : ''}${c.ajuste ? ' <span class="etiqueta">ajustado</span>' : ''}</td><td>${esc(c.aparelho?.sigla || '')}</td><td class="num ${c.diferenca < 0 ? 'negativo' : ''}">${c.aberto ? '<span class="etiqueta">aberto</span>' : dif(c.diferenca)}</td></tr>`).join('')}</tbody>
        </table><p class="sub nota-mov">${f.caixas.some((c) => !c.aberto) ? `Diferença total dos caixas fechados: ${dif(f.diferencaCaixas)}.` : 'Nenhum caixa fechado ainda.'}</p>` : '<p class="sub">Nenhum caixa.</p>'}
      </section>

      <section class="cartao">
        <h2>Por dia</h2>
        ${f.porDia.length ? `<table class="tabela-painel">
          <thead><tr><th>Dia</th><th class="num">Vendas</th><th class="num">Faturamento</th><th class="num">Despesas</th></tr></thead>
          <tbody>${f.porDia.map((d) => `<tr><td>${esc(dia(d.chave))}</td><td class="num">${d.vendas}</td><td class="num">${dinheiro(d.faturamento)}</td><td class="num">${dinheiro(d.despesas)}</td></tr>`).join('')}</tbody>
        </table>` : '<p class="sub">Nenhuma venda.</p>'}
      </section>

      <section class="cartao">
        <h2>Por aparelho</h2>
        ${f.porAparelho.length ? `<table class="tabela-painel">
          <thead><tr><th>Aparelho</th><th class="num">Vendas</th><th class="num">Ticket médio</th><th class="num">Faturamento</th></tr></thead>
          <tbody>${f.porAparelho.map((a) => `<tr><td>${esc(a.nome)}</td><td class="num">${a.vendas}</td><td class="num">${dinheiro(a.ticketMedio)}</td><td class="num">${dinheiro(a.faturamento)}</td></tr>`).join('')}</tbody>
        </table>` : '<p class="sub">Nenhuma venda.</p>'}
      </section>

      <section class="cartao">
        <h2>Mais vendidos</h2>
        ${g.maisVendidos.length ? `<table class="tabela-painel">
          <thead><tr><th>Produto</th><th class="num">Qtd.</th><th class="num">Valor</th></tr></thead>
          <tbody>${g.maisVendidos.slice(0, 10).map((x) => `<tr><td>${esc(x.nome)}${x.variacao ? ` <span class="sub">${esc(x.variacao)}</span>` : ''}</td><td class="num">${x.quantidade}</td><td class="num">${dinheiro(x.valor)}</td></tr>`).join('')}</tbody>
        </table>` : '<p class="sub">Nenhum produto vendido.</p>'}
      </section>

      <section class="cartao">
        <h2>Estoque</h2>
        <div class="contas">
          <div><span>Levado</span><span class="num">${qtd(f.estoque.totais.levado, 'peça', 'peças')}</span></div>
          <div><span>Itens vendidos (líquido)</span><span class="num">${g.itensVendidos}</span></div>
          <div><span>Vendido · brindes · avarias</span><span class="num">${f.estoque.totais.vendido} · ${f.estoque.totais.brindes} · ${f.estoque.totais.avarias}</span></div>
          <div><span>Voltaram (trocas e devoluções)</span><span class="num">${f.estoque.totais.voltaram}</span></div>
          <div class="total"><span>Sobra</span><strong class="num">${qtd(f.estoque.totais.sobra, 'peça', 'peças')}</strong></div>
        </div>
        ${ct.itensContados ? `<div class="contas" style="margin-top:8px">
          <div><span>Contado no fim (${ct.itensContados} ${ct.itensContados === 1 ? 'item' : 'itens'})</span><span class="num">${qtd(ct.pecasContadas, 'peça', 'peças')}</span></div>
          <div class="${ct.pecasFaltando ? 'linha-falta' : ''}"><span>Faltando</span><span class="num">${ct.pecasFaltando}${ct.valorFaltando ? ` · ${dinheiro(ct.valorFaltando)} ao custo` : ''}</span></div>
          ${ct.pecasSobrando ? `<div><span>Sobrando</span><span class="num">${ct.pecasSobrando}</span></div>` : ''}
        </div>` : ''}
        ${f.estoque.negativas ? `<p class="aviso-inline">${qtd(f.estoque.negativas, 'item com sobra negativa', 'itens com sobra negativa')}.</p>` : ''}
        <div class="acoes"><a class="btn" href="#/eventos/${encodeURIComponent(evento.id)}/estoque">Ver item por item</a></div>
      </section>
    </div>

    ${f.posEvento.length ? `<section class="cartao" style="margin-top:16px"><h2>Registros pós-evento</h2>
      <p class="sub">Trocas e devoluções depois do encerramento, só para histórico (fora dos números acima).</p>
      <ul class="lista-movimentos">${f.posEvento.map((r) => `<li class="mov"><span class="mov-hora num">${new Date(r.criadoEm).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}</span>
        <span class="mov-desc"><a href="#/vendas/${encodeURIComponent(r.id)}">${r.tipo === 'troca' ? 'Troca' : 'Devolução'} ${esc(r.numero)}</a> <span class="sub">da ${esc(r.origemNumero || '')}</span></span>
        <span class="num mov-valor">${r.total < 0 ? '− ' : ''}${dinheiro(Math.abs(r.tipo === 'devolucao' ? r.credito : r.total))}</span><span></span></li>`).join('')}</ul></section>` : ''}

    <section class="cartao" style="margin-top:16px">
      <h2>Planilhas</h2>
      <p class="sub">Uma planilha com as abas Resumo, Itens, Estoque e Caixas.${driveConfigurado() ? ' No Drive, ela vira um Google Planilhas na pasta "Coline Zaiko" (a nova substitui a anterior deste evento).' : ''}</p>
      <div class="acoes">
        ${driveConfigurado() ? `<button type="button" class="btn primario" id="planilha-drive">${icones.compartilhar} Salvar no Drive</button>` : ''}
        <button type="button" class="btn" id="planilha-baixar">${icones.baixar} Baixar no aparelho (.xlsx)</button>
      </div>
      <p class="sub" id="planilha-status" style="margin-top:12px" hidden></p>
    </section>

    <section class="cartao" style="margin-top:16px">
      <h2>${encerrado ? 'Reabrir o evento' : 'Encerrar o evento'}</h2>
      <p class="sub">${encerrado ? 'Volta a permitir vendas neste evento.' : 'Bloqueia novas vendas neste aparelho. Trocas e devoluções depois disso viram registro pós-evento, sem mudar o fechamento.'}</p>
      <div class="acoes"><button type="button" class="btn ${encerrado ? '' : 'primario'}" id="encerrar">${encerrado ? 'Reabrir evento' : 'Encerrar evento'}</button></div>
    </section>`;

  el.querySelector('#ocultar')?.addEventListener('click', () => render(el));
  // Brindes e avarias como perda (v0.34.0): grava no evento e redesenha
  ['brindes', 'avarias'].forEach((tipo) => el.querySelector(`#conta-${tipo}`)?.addEventListener('change', async (e) => {
    await db.eventos.update(evento.id, { perdas: { ...(evento.perdas || {}), [tipo]: e.target.checked } });
    render(el, { mostrar: true });
  }));
  el.querySelector('#planilha-baixar').addEventListener('click', () => baixar(planilhaFechamento(evento, f, registros, produtos)));
  if (driveConfigurado()) {
    const status = el.querySelector('#planilha-status');
    prepararDrive().catch((e) => { status.hidden = false; status.textContent = e.message; });
    el.querySelector('#planilha-drive').addEventListener('click', async (e) => {
      const botao = e.currentTarget;
      const pedido = autorizar();   // abre o Google no mesmo toque
      botao.disabled = true;
      try {
        await pedido;
        status.hidden = false; status.textContent = 'Enviando a planilha…';
        const link = await enviarPlanilha(planilhaFechamento(evento, f, registros, produtos), { eventoId: evento.id, titulo: `Fechamento — ${evento.nome}` });
        status.innerHTML = `Planilha salva no Drive. <a href="${esc(link)}" target="_blank" rel="noopener">Abrir no Google Planilhas</a>`;
        aviso('Planilha salva no Drive.');
      } catch (erro) {
        console.error(erro);
        status.hidden = false; status.textContent = erro.message;
        aviso(erro.message, { tipo: 'erro' });
      } finally { botao.disabled = false; }
    });
  }
  el.querySelector('#encerrar').addEventListener('click', async () => {
    const ok = encerrado
      ? await confirmar({ titulo: 'Reabrir o evento?', texto: 'As vendas voltam a ser permitidas neste evento.', botao: 'Reabrir' })
      : await confirmar({ titulo: 'Encerrar o evento?', texto: f.caixasAbertos.length ? `Atenção: ainda há ${qtd(f.caixasAbertos.length, 'caixa aberto', 'caixas abertos')}. Encerrar mesmo assim?` : 'Novas vendas ficam bloqueadas. Dá para reabrir depois, se precisar.', botao: 'Encerrar', perigo: true });
    if (!ok) return;
    await db.eventos.update(evento.id, encerrado ? { status: 'aberto', encerradoEm: null } : { status: 'encerrado', encerradoEm: new Date().toISOString() });
    aviso(encerrado ? 'Evento reaberto.' : 'Evento encerrado.');
    render(el, { mostrar: true });
  });
}

function baixar(arquivo) {
  const url = URL.createObjectURL(arquivo);
  const a = document.createElement('a');
  a.href = url; a.download = arquivo.name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  aviso(`${arquivo.name} salvo na pasta Downloads.`);
}
