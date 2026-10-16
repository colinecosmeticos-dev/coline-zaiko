// =========================================================
// Tela Backup (Mais → Backup).
// Fazer: cópia completa do aparelho no Drive (guarda as 3 últimas de
// cada aparelho) ou baixada como arquivo.
// Restaurar: substitui TUDO neste aparelho pelo backup (pede o PIN e,
// antes, baixa uma cópia do que existe hoje, por segurança).
// =========================================================
import { db, lerAparelho } from '../db.js';
import { esc, icones, aviso, abrirJanela } from '../ui.js';
import { pedirPin } from '../pin.js';
import { gerarBackup, lerBackup, restaurarBackup, registrarBackupFeito, lerUltimoBackup, mudouDesdeUltimoBackup } from '../backup.js';
import { driveConfigurado, prepararDrive, autorizar, enviarBackup, listarBackups, baixarArquivo } from '../drive.js';

const dataHora = (iso) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const qtd = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
const textoResumo = (r) => `${qtd(r.produtos, 'produto', 'produtos')}, ${qtd(r.eventos, 'evento', 'eventos')}, ${qtd(r.vendas, 'venda', 'vendas')} e ${qtd(r.caixas, 'caixa', 'caixas')}`;

export async function render(el) {
  const aparelho = await lerAparelho();
  const ultimo = await lerUltimoBackup();
  const mudou = await mudouDesdeUltimoBackup();
  const comDrive = driveConfigurado();

  el.innerHTML = `
    <a class="voltar" href="#/mais">${icones.voltar} Mais</a>
    <header class="cab"><div><h1>Backup</h1>
      <p class="sub">Cópia completa deste aparelho: catálogo com fotos, eventos, vendas, caixas, estoque, formas de pagamento e configurações.</p></div></header>

    <div class="cartao ${mudou ? 'alerta-backup' : ''}">
      <strong>${ultimo ? `Último backup: ${dataHora(ultimo.em)} (${ultimo.onde === 'drive' ? 'no Drive' : 'arquivo baixado'})` : 'Nenhum backup feito neste aparelho ainda.'}</strong>
      <p class="sub" style="margin-top:4px">${!ultimo ? 'Faça o primeiro agora e, depois, no fim de cada dia de evento.' : mudou ? 'Há vendas ou cadastros novos desde então. Faça um backup, de preferência no fim de cada dia de evento.' : 'Nada novo desde o último backup.'}</p>
    </div>

    <section class="cartao">
      <h2>Fazer backup</h2>
      <p class="sub">${comDrive ? 'No Drive ficam as 3 cópias mais recentes de cada aparelho, na pasta "Coline Zaiko".' : 'O arquivo vai para a pasta Downloads. Guarde-o fora do aparelho (Drive, computador).'}</p>
      <div class="acoes">
        ${comDrive ? `<button type="button" class="btn primario" id="backup-drive">${icones.compartilhar} Fazer backup no Drive</button>` : ''}
        <button type="button" class="btn ${comDrive ? '' : 'primario'}" id="backup-baixar">${icones.baixar} Baixar arquivo de backup</button>
      </div>
      <p class="sub" id="status" style="margin-top:12px" hidden></p>
    </section>

    <section class="cartao">
      <h2>Restaurar</h2>
      <p class="sub">Substitui <strong>tudo</strong> o que está neste aparelho pelo conteúdo do backup${aparelho ? ` (este aparelho é o ${esc(aparelho.nome)}, ${esc(aparelho.sigla)})` : ''}. Use para recuperar um aparelho ou passar tudo para um novo. Antes, o app baixa uma cópia do que existe hoje.</p>
      <div class="acoes">
        ${comDrive ? `<button type="button" class="btn" id="restaurar-drive">${icones.baixar} Restaurar do Drive</button>` : ''}
        <button type="button" class="btn" id="restaurar-arquivo">${icones.baixar} Restaurar de arquivo</button>
      </div>
      <input type="file" id="arquivo-backup" hidden>
    </section>`;

  const $ = (s) => el.querySelector(s);
  const status = $('#status');
  const mostrar = (t) => { status.hidden = false; status.textContent = t; };
  const falhou = (e) => { console.error(e); mostrar(e.message); aviso(e.message, { tipo: 'erro' }); };

  // ---------- Fazer ----------
  $('#backup-baixar').addEventListener('click', async () => {
    try {
      const { arquivo, resumo } = await gerarBackup();
      baixar(arquivo);
      await registrarBackupFeito('arquivo');
      aviso(`Backup baixado: ${textoResumo(resumo)}.`);
      render(el);
    } catch (e) { falhou(e); }
  });

  // ---------- Restaurar ----------
  async function restaurar(arquivo) {
    const { dados, resumo } = await lerBackup(arquivo);
    if (!(await pedirPin({ titulo: 'Restaurar backup', texto: 'Digite o PIN.' }))) return;
    const outro = resumo.aparelho && aparelho && resumo.aparelho.id !== aparelho.id;
    const temDados = (await db.vendas.count()) > 0 || (await db.produtos.count()) > 0;
    const ok = await confirmarRestauracao(resumo, outro, temDados);
    if (!ok) return;
    // Cópia de segurança do que existe hoje
    if (temDados) {
      const { arquivo: atual } = await gerarBackup();
      baixar(new File([atual], atual.name.replace('backup-', 'backup-antes-de-restaurar-'), { type: 'text/plain' }));
    }
    await restaurarBackup(dados);
    aviso('Backup restaurado.');
    setTimeout(() => { location.hash = '#/inicio'; location.reload(); }, 800);
  }

  const campo = $('#arquivo-backup');
  $('#restaurar-arquivo').addEventListener('click', () => campo.click());
  campo.addEventListener('change', async () => {
    const arquivo = campo.files[0];
    campo.value = '';
    if (arquivo) try { await restaurar(arquivo); } catch (e) { falhou(e); }
  });

  // ---------- Drive ----------
  if (comDrive) {
    prepararDrive().catch((e) => mostrar(e.message));
    $('#backup-drive').addEventListener('click', async (e) => {
      const botao = e.currentTarget;
      const pedido = autorizar();
      botao.disabled = true;
      try {
        await pedido;
        mostrar('Preparando o backup…');
        const { arquivo, resumo } = await gerarBackup();
        mostrar(`Enviando (${Math.max(1, Math.round(arquivo.size / 1024)).toLocaleString('pt-BR')} KB)…`);
        await enviarBackup(arquivo, aparelho);
        await registrarBackupFeito('drive');
        aviso(`Backup salvo no Drive: ${textoResumo(resumo)}.`);
        render(el);
      } catch (erro) { falhou(erro); botao.disabled = false; }
    });
    $('#restaurar-drive').addEventListener('click', async (e) => {
      const botao = e.currentTarget;
      const pedido = autorizar();
      botao.disabled = true;
      try {
        await pedido;
        const lista = await listarBackups();
        if (!lista.length) { mostrar('Nenhum backup no Drive ainda.'); return; }
        const info = await escolherBackup(lista);
        if (!info) return;
        mostrar('Baixando o backup…');
        await restaurar(await baixarArquivo(info));
      } catch (erro) { falhou(erro); } finally { if (el.contains(botao)) botao.disabled = false; }
    });
  }
}

function escolherBackup(lista) {
  return new Promise((resolver) => {
    let escolhido = null;
    const d = abrirJanela(`
      <h2>Escolha o backup</h2>
      <p>Os mais recentes de cada aparelho.</p>
      <ul class="lista lista-backups">${lista.map((b, i) => `
        <li><button type="button" class="item-backup" data-i="${i}">
          <span><strong>${esc(b.aparelho || b.sigla)}</strong> <span class="etiqueta num">${esc(b.sigla)}</span><br><span class="sub">${dataHora(b.criadoEm)} · ${Math.max(1, Math.round(b.tamanho / 1024)).toLocaleString('pt-BR')} KB</span></span>
          <span class="seta" aria-hidden="true">›</span></button></li>`).join('')}</ul>
      <div class="acoes"><button type="button" class="btn" id="voltar">Voltar</button></div>`, { aoFechar: () => resolver(escolhido) });
    d.querySelector('#voltar').addEventListener('click', () => d.close());
    d.querySelectorAll('[data-i]').forEach((b) => b.addEventListener('click', () => { escolhido = lista[Number(b.dataset.i)]; d.close(); }));
  });
}

function confirmarRestauracao(resumo, outroAparelho, temDados) {
  return new Promise((resolver) => {
    let ok = false;
    const d = abrirJanela(`
      <h2>Restaurar este backup?</h2>
      <p>Backup ${resumo.aparelho ? `do <strong>${esc(resumo.aparelho.nome)} (${esc(resumo.aparelho.sigla)})</strong> ` : ''}de ${dataHora(resumo.geradoEm)}: ${textoResumo(resumo)}.</p>
      <p class="aviso-inline"><strong>Tudo o que está neste aparelho será substituído.</strong>${temDados ? ' Uma cópia do que existe hoje será baixada antes, em Downloads.' : ''}${outroAparelho ? ` Este aparelho passará a ser o ${esc(resumo.aparelho.nome)} (${esc(resumo.aparelho.sigla)}): não use os dois ao mesmo tempo, ou os números das vendas vão se repetir.` : ''}</p>
      <div class="acoes"><button type="button" class="btn" id="nao">Cancelar</button><button type="button" class="btn primario perigo-cheio" id="sim">Restaurar</button></div>`, { aoFechar: () => resolver(ok) });
    d.querySelector('#nao').addEventListener('click', () => d.close());
    d.querySelector('#sim').addEventListener('click', () => { ok = true; d.close(); });
  });
}

function baixar(arquivo) {
  const url = URL.createObjectURL(arquivo);
  const a = document.createElement('a');
  a.href = url; a.download = arquivo.name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
