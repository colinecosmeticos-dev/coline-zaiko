// =========================================================
// Tela Vendas por arquivo (Sincronizar → Por arquivo). Antes: "Juntar vendas" no Mais.
// Nos outros aparelhos: enviar as vendas do evento em uso.
// No principal: receber as vendas de todos e conferir quem já mandou.
// =========================================================
import { ehCaixa } from '../modo.js';
import { lerAparelho, lerEventoAtivo } from '../db.js';
import { esc, icones, aviso, confirmar } from '../ui.js';
import { gerarArquivoVendas, lerArquivoVendas, importarVendas, aparelhosDoEvento } from '../vendas-arquivo.js';
import { driveConfigurado, prepararDrive, autorizar, enviarVendas, listarVendasNoDrive, baixarArquivo } from '../drive.js';

const qtd = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
const dataHora = (iso) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const textoResumo = (r) => [qtd(r.vendas, 'venda', 'vendas'), r.trocas && qtd(r.trocas, 'troca', 'trocas'), r.devolucoes && qtd(r.devolucoes, 'devolução', 'devoluções'), qtd(r.caixas, 'caixa', 'caixas')].filter(Boolean).join(', ');
const textoJuntado = (r) => {
  const n = r.vendas.novos + r.caixas.novos + r.movimentos.novos;
  const a = r.vendas.atualizados + r.caixas.atualizados + r.movimentos.atualizados;
  if (!n && !a) return 'nada novo (já estava tudo aqui)';
  return [n && qtd(n, 'lançamento novo', 'lançamentos novos'), a && qtd(a, 'atualizado (cancelamento ou fechamento)', 'atualizados (cancelamentos ou fechamentos)')].filter(Boolean).join(', ');
};

const PELO_DRIVE = false;

export async function render(el) {
  const aparelho = await lerAparelho();
  const evento = await lerEventoAtivo();
  const voltar = `<a class="voltar" href="#/sincronizar">${icones.voltar} Sincronizar</a>`;
  if (!aparelho || !evento) {
    el.innerHTML = `${voltar}<header class="cab"><h1>Vendas por arquivo</h1></header>
      <div class="cartao vazio"><div class="simbolo" aria-hidden="true">在庫</div>
      <h2>${!aparelho ? 'Identifique este aparelho' : 'Escolha o evento'}</h2>
      <p>${!aparelho ? 'Dê nome e sigla ao aparelho em Configurações.' : 'As vendas são juntadas por evento.'}</p>
      <a class="btn primario" href="${!aparelho ? '#/configurar' : ehCaixa() ? '#/mais' : '#/eventos'}">${!aparelho ? 'Configurar aparelho' : 'Escolher o evento'}</a></div>`;
    return;
  }
  const aparelhos = await aparelhosDoEvento(evento);
  const proprio = aparelhos.find((a) => a.esteAparelho);

  el.innerHTML = `
    ${voltar}
    <header class="cab"><div>
      <h1>${ehCaixa() ? 'Enviar vendas por arquivo' : 'Vendas dos caixas por arquivo'}</h1>
      <p class="sub">${esc(evento.nome)} · sem internet: leva vendas, trocas, devoluções e caixas de cada aparelho para a Gestão, sem duplicar. Com internet, use Sincronizar.</p>
    </div></header>

    <section class="cartao">
      <h2>Enviar as vendas deste aparelho</h2>
      <p class="sub">${esc(aparelho.nome)} (${esc(aparelho.sigla)}): ${proprio ? `${qtd(proprio.vendas, 'venda', 'vendas')} e ${qtd(proprio.caixas, 'caixa', 'caixas')} neste evento` : 'nenhuma venda neste evento ainda'}. Pode enviar quantas vezes quiser: o envio novo substitui o anterior.</p>
      <div class="acoes">
        ${PELO_DRIVE ? `<button type="button" class="btn primario" id="drive-enviar">${icones.compartilhar} Enviar para o Drive</button>` : ''}
        <button type="button" class="btn" id="compartilhar">${icones.compartilhar} Compartilhar arquivo</button>
        <button type="button" class="btn" id="baixar">${icones.baixar} Baixar arquivo</button>
      </div>
    </section>

    <section class="cartao so-gestao">
      <h2>Receber no aparelho principal</h2>
      <p class="sub">Junta aqui as vendas enviadas pelos outros aparelhos neste evento.</p>
      <div class="acoes">
        ${PELO_DRIVE ? `<button type="button" class="btn primario" id="drive-receber">${icones.baixar} Receber do Drive</button>` : ''}
        <button type="button" class="btn" id="importar">${icones.baixar} Importar arquivo</button>
      </div>
      <input type="file" id="arquivo-vendas" hidden>
      <p class="sub" id="status" style="margin-top:12px" hidden></p>
    </section>

    <section class="cartao so-gestao">
      <h2>Aparelhos com vendas neste evento</h2>
      <p class="sub">Antes do fechamento, confira se todos os aparelhos que venderam aparecem aqui.</p>
      ${aparelhos.length ? `<ul class="lista lista-aparelhos">${aparelhos.map((a) => `
        <li><span><strong>${esc(a.nome)}</strong> <span class="etiqueta num">${esc(a.sigla)}</span>${a.esteAparelho ? ' <span class="etiqueta marca">este aparelho</span>' : ''}<br>
          <span class="sub">${qtd(a.vendas, 'venda', 'vendas')} · ${qtd(a.caixas, 'caixa', 'caixas')}${a.importado ? ` · último arquivo de ${dataHora(a.importado.geradoEm)}` : ''}</span></span></li>`).join('')}</ul>`
      : '<p class="sub" style="margin-top:8px">Nenhuma venda neste evento ainda.</p>'}
    </section>`;

  const $ = (s) => el.querySelector(s);
  const status = $('#status');
  const mostrar = (t) => { status.hidden = false; status.textContent = t; };
  const falhou = (erro) => { console.error(erro); mostrar(erro.message); aviso(erro.message, { tipo: 'erro' }); };

  // ---------- Enviar ----------
  $('#baixar').addEventListener('click', async () => {
    try { const { arquivo } = await gerarArquivoVendas(evento); baixar(arquivo); aviso('Arquivo salvo na pasta Downloads.'); } catch (e) { falhou(e); }
  });
  $('#compartilhar').addEventListener('click', async () => {
    try {
      const { arquivo } = await gerarArquivoVendas(evento);
      if (navigator.canShare && navigator.canShare({ files: [arquivo] })) {
        try { await navigator.share({ files: [arquivo], title: 'Vendas Coline Zaiko' }); } catch (e) { if (e.name !== 'AbortError') baixar(arquivo); }
      } else { baixar(arquivo); aviso('Arquivo salvo na pasta Downloads.'); }
    } catch (e) { falhou(e); }
  });

  // ---------- Importar arquivo ----------
  const campo = $('#arquivo-vendas');
  $('#importar').addEventListener('click', () => campo.click());
  campo.addEventListener('change', async () => {
    const arquivo = campo.files[0];
    campo.value = '';
    if (!arquivo) return;
    try {
      const { dados, resumo } = await lerArquivoVendas(arquivo);
      if (dados.evento.id !== evento.id) {
        const ok = await confirmar({ titulo: 'Arquivo de outro evento', texto: `Este arquivo é do evento "${dados.evento.nome}", e este aparelho está usando "${evento.nome}". Juntar mesmo assim? As vendas ficam no evento delas.`, botao: 'Juntar' });
        if (!ok) return;
      }
      const ok = await confirmar({ titulo: `Juntar as vendas do ${resumo.aparelho.nome}?`, texto: `Arquivo de ${dataHora(resumo.geradoEm)}: ${textoResumo(resumo)}.`, botao: 'Juntar' });
      if (!ok) return;
      const r = await importarVendas(dados);
      aviso(`${resumo.aparelho.sigla}: ${textoJuntado(r)}.`);
      render(el);
    } catch (e) { falhou(e); }
  });

  // ---------- Drive ----------
  // Desde a v0.26.0 o Drive fica na tela Sincronizar; esta tela é só por arquivo.
  if (PELO_DRIVE) {
    prepararDrive().catch((e) => mostrar(e.message));
    const botoes = [$('#drive-enviar'), $('#drive-receber')];
    const ocupado = (sim) => botoes.forEach((b) => { b.disabled = sim; });

    $('#drive-enviar').addEventListener('click', async () => {
      const pedido = autorizar();
      ocupado(true);
      try {
        await pedido;
        const { arquivo, resumo } = await gerarArquivoVendas(evento);
        await enviarVendas(arquivo, { aparelho, eventoId: evento.id, nomeEvento: evento.nome });
        aviso(`Vendas enviadas: ${textoResumo(resumo)}.`);
      } catch (e) { falhou(e); } finally { ocupado(false); }
    });

    $('#drive-receber').addEventListener('click', async () => {
      const pedido = autorizar();
      ocupado(true);
      try {
        await pedido;
        mostrar('Procurando as vendas no Drive…');
        const arquivos = (await listarVendasNoDrive(evento.id)).filter((f) => f.sigla !== aparelho.sigla);
        if (!arquivos.length) { mostrar('Nenhum outro aparelho enviou vendas deste evento ainda.'); return; }
        const linhas = [];
        for (const info of arquivos) {
          mostrar(`Juntando as vendas do ${info.aparelho || info.sigla}…`);
          const { dados } = await lerArquivoVendas(await baixarArquivo(info));
          linhas.push(`${info.sigla}: ${textoJuntado(await importarVendas(dados))}`);
        }
        aviso('Vendas juntadas.');
        await render(el);
        el.querySelector('#status').hidden = false;
        el.querySelector('#status').textContent = linhas.join(' · ');
      } catch (e) { falhou(e); } finally { if (el.contains(botoes[0])) ocupado(false); }
    });
  }
}

function baixar(arquivo) {
  const url = URL.createObjectURL(arquivo);
  const a = document.createElement('a');
  a.href = url; a.download = arquivo.name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
