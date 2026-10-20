// =========================================================
// Tela de criar / editar evento.  #/eventos/novo  e  #/eventos/<id>
// O evento não define quantos aparelhos vão vender: qualquer aparelho que
// tiver o evento e abrir o caixa participa. No fechamento, as vendas dos
// outros aparelhos são importadas e somadas.
// =========================================================
import { db, novoId, lerEventoAtivo, definirEventoAtivo, novoCodigoEvento, lerAparelho, lerLevado, lerContado } from '../db.js';
import { esc, aviso, confirmar, icones, hojeISO, diasEntre } from '../ui.js';

export async function render(el, { id }) {
  const editando = !!id;
  const ev = editando ? await db.eventos.get(id) : null;
  if (editando && !ev) {
    el.innerHTML = `<div class="cartao vazio"><h2>Evento não encontrado</h2><a class="btn" href="#/eventos">Voltar para Eventos</a></div>`;
    return;
  }
  const ativo = await lerEventoAtivo();
  const emUso = editando && ativo && ativo.id === id;
  // Estoque deste evento (v0.29.0: o estoque fica junto do evento)
  const [levado, contado] = editando ? await Promise.all([lerLevado(id), lerContado(id)]) : [new Map(), new Map()];
  const pecasLevadas = [...levado.values()].reduce((s, n) => s + n, 0);

  el.innerHTML = `
    <a class="voltar" href="#/eventos">${icones.voltar} Eventos</a>
    <header class="cab"><div>
      <h1>${editando ? esc(ev.nome) : 'Novo evento'}</h1>
      ${editando ? `<p class="sub">Código do evento: <strong class="num">${esc(ev.codigo)}</strong>. Confira se é o mesmo em todos os aparelhos.</p>` : ''}
    </div></header>

    ${editando ? `
    <section class="cartao faixa-uso ${emUso ? 'ativo' : ''}">
      <div>
        <h2>${emUso ? 'Em uso neste aparelho' : 'Não está em uso neste aparelho'}</h2>
        <p class="sub">${emUso ? 'As vendas deste aparelho entram neste evento.' : 'Escolha este evento para as vendas deste aparelho entrarem nele.'}</p>
      </div>
      <button type="button" class="btn ${emUso ? '' : 'primario'}" id="alternar-uso">${emUso ? 'Deixar de usar' : 'Usar neste aparelho'}</button>
    </section>
    <section class="cartao faixa-uso">
      <div>
        <h2>Preços deste evento</h2>
        <p class="sub">${Object.keys(ev.precos || {}).length ? `${Object.keys(ev.precos).length} ${Object.keys(ev.precos).length === 1 ? 'item com preço especial' : 'itens com preço especial'}.` : 'Todos os itens com o preço normal.'}</p>
      </div>
      <a class="btn" href="#/eventos/${encodeURIComponent(ev.id)}/precos">Preços do evento</a>
    </section>
    <section class="cartao faixa-uso">
      <div>
        <h2>Estoque deste evento</h2>
        <p class="sub">${pecasLevadas ? `Levado: ${pecasLevadas.toLocaleString('pt-BR')} ${pecasLevadas === 1 ? 'peça' : 'peças'} em ${levado.size} ${levado.size === 1 ? 'item' : 'itens'}` : 'Estoque levado ainda não registrado'}${contado.size ? ` · contagem final: ${contado.size} ${contado.size === 1 ? 'item contado' : 'itens contados'}` : ''}.</p>
      </div>
      <a class="btn ${pecasLevadas ? '' : 'primario'}" href="#/eventos/${encodeURIComponent(ev.id)}/estoque">Estoque do evento</a>
    </section>` : ''}

    <form class="form-produto" novalidate>
      <section class="cartao">
        <div class="grade-campos">
          <div class="campo">
            <label for="e-nome">Nome do evento</label>
            <input class="entrada" id="e-nome" maxlength="80" autocomplete="off" placeholder="Ex.: Feira Japonesa de Outubro" value="${esc(ev ? ev.nome : '')}">
          </div>
          <div class="campo">
            <label for="e-local">Local</label>
            <input class="entrada" id="e-local" maxlength="80" autocomplete="off" placeholder="Ex.: Bunkyo, São Paulo" value="${esc(ev ? ev.local || '' : '')}">
          </div>
          <div class="grade-campos duas">
            <div class="campo">
              <label for="e-inicio">Primeiro dia</label>
              <input class="entrada" id="e-inicio" type="date" value="${esc(ev ? ev.dataInicio : hojeISO())}">
            </div>
            <div class="campo">
              <label for="e-fim">Último dia</label>
              <input class="entrada" id="e-fim" type="date" value="${esc(ev ? ev.dataFim : hojeISO())}">
              <span class="dica" id="qtd-dias"></span>
            </div>
          </div>
        </div>
      </section>

      <div class="rodape-form">
        ${editando ? '<button type="button" class="btn texto perigo btn-excluir" id="excluir">Excluir</button>' : ''}
        <a class="btn" href="#/eventos">Cancelar</a>
        <button type="submit" class="btn primario">${editando ? 'Salvar evento' : 'Criar evento'}</button>
      </div>
    </form>`;

  const $ = (s) => el.querySelector(s);
  const form = el.querySelector('form');

  function atualizarDicas() {
    const ini = $('#e-inicio').value, fim = $('#e-fim').value;
    $('#qtd-dias').textContent = ini && fim && fim >= ini ? `${diasEntre(ini, fim)} ${diasEntre(ini, fim) === 1 ? 'dia' : 'dias'} de evento. O caixa abre e fecha a cada dia.` : '';
  }
  $('#e-inicio').addEventListener('change', () => {
    if (!$('#e-fim').value || $('#e-fim').value < $('#e-inicio').value) $('#e-fim').value = $('#e-inicio').value;
    atualizarDicas();
  });
  $('#e-fim').addEventListener('change', atualizarDicas);
  atualizarDicas();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    form.querySelectorAll('.msg-erro').forEach((m) => m.remove());
    form.querySelectorAll('[aria-invalid]').forEach((i) => i.removeAttribute('aria-invalid'));
    const erro = (input, texto) => {
      input.setAttribute('aria-invalid', 'true');
      const m = document.createElement('span'); m.className = 'msg-erro'; m.textContent = texto;
      input.closest('.campo').append(m);
    };
    const nome = $('#e-nome').value.trim();
    const ini = $('#e-inicio').value, fim = $('#e-fim').value;
    if (!nome) erro($('#e-nome'), 'Informe o nome do evento.');
    if (!ini) erro($('#e-inicio'), 'Informe o primeiro dia.');
    if (!fim) erro($('#e-fim'), 'Informe o último dia.');
    else if (ini && fim < ini) erro($('#e-fim'), 'O último dia não pode ser antes do primeiro.');
    const primeiro = form.querySelector('[aria-invalid="true"]');
    if (primeiro) { primeiro.focus(); return; }

    const aparelho = await lerAparelho();
    const registro = {
      id: id || novoId(),
      codigo: ev ? ev.codigo : novoCodigoEvento(),
      nome,
      local: $('#e-local').value.trim(),
      dataInicio: ini,
      dataFim: fim,
      status: ev ? ev.status : 'aberto',
      criadoPor: ev ? ev.criadoPor : (aparelho ? aparelho.sigla : ''),
      criadoEm: ev ? ev.criadoEm : new Date().toISOString(),
      atualizadoEm: new Date().toISOString()
    };
    await db.eventos.put(registro);

    // Evento novo: se nenhum estiver em uso, este passa a ser o do aparelho
    if (!editando && !ativo) {
      await definirEventoAtivo(registro.id);
      aviso('Evento criado e em uso neste aparelho.');
    } else {
      aviso(editando ? 'Evento salvo.' : 'Evento criado.');
    }
    location.hash = editando ? '#/eventos' : `#/eventos/${encodeURIComponent(registro.id)}`;
  });

  if (editando) {
    $('#alternar-uso').addEventListener('click', async () => {
      if (emUso) {
        await definirEventoAtivo(null);
        aviso('Nenhum evento em uso neste aparelho.');
      } else {
        if (ativo) {
          const ok = await confirmar({ titulo: 'Trocar de evento?', texto: `As próximas vendas deste aparelho vão para "${ev.nome}" em vez de "${ativo.nome}".`, botao: 'Trocar' });
          if (!ok) return;
        }
        await definirEventoAtivo(id);
        aviso('Evento em uso neste aparelho.');
      }
      render(el, { id });
    });
    $('#excluir').addEventListener('click', async () => {
      // Quando existirem vendas, a exclusão será bloqueada para eventos com vendas
      const ok = await confirmar({ titulo: `Excluir ${ev.nome}?`, texto: 'O evento será apagado deste aparelho.', botao: 'Excluir', perigo: true });
      if (!ok) return;
      await db.eventos.delete(id);
      if (emUso) await definirEventoAtivo(null);
      aviso('Evento excluído.');
      location.hash = '#/eventos';
    });
  }
}
