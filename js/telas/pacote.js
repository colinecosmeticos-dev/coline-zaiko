// =========================================================
// Tela Preparar outros aparelhos (Mais → Preparar outros aparelhos).
// No aparelho principal: gerar o pacote e compartilhar.
// Nos outros: importar o pacote recebido.
// =========================================================
import { gerarPacote, lerPacote, importarPacote } from '../pacote.js';
import { lerConfig, lerAparelho } from '../db.js';
import { driveConfigurado, prepararDrive, autorizar, enviarPacote, ultimoPacote, baixarPacote } from '../drive.js';
import { aviso, confirmar, icones, esc } from '../ui.js';

const qtd = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
const dataHora = (iso) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export async function render(el) {
  const ultimo = await lerConfig('ultimoPacoteImportado');

  el.innerHTML = `
    <a class="voltar" href="#/mais">${icones.voltar} Mais</a>
    <header class="cab"><div>
      <h1>Preparar outros aparelhos</h1>
      <p class="sub">Leva catálogo, fotos, formas de pagamento e taxas, categorias de retirada, PIN e eventos de um aparelho para outro.</p>
    </div></header>

    <section class="cartao">
      <h2>Pelo Google Drive <span class="etiqueta">com internet</span></h2>
      ${driveConfigurado() ? `
        <p class="sub">Um toque para enviar, um toque para receber. O app só enxerga a pasta "Coline Zaiko" que ele mesmo cria no Drive; o pacote antigo é apagado a cada envio.</p>
        <div class="acoes">
          <button type="button" class="btn primario" id="drive-enviar">${icones.compartilhar} Enviar para o Drive</button>
          <button type="button" class="btn" id="drive-receber">${icones.baixar} Receber do Drive</button>
        </div>
        <p class="sub" id="drive-status" style="margin-top:12px" hidden></p>`
      : '<p class="sub">O Drive ainda não foi ligado ao app. Enquanto isso, use o arquivo (abaixo).</p>'}
    </section>

    <section class="cartao">
      <h2>Por arquivo <span class="etiqueta">sem internet</span></h2>
      <p class="sub"><strong>Enviar:</strong> no tablet, "Gerar e compartilhar" abre o Quick Share, Bluetooth ou WhatsApp. No computador, use "Baixar arquivo" e depois envie o arquivo da pasta Downloads.</p>
      <div class="acoes">
        <button type="button" class="btn" id="gerar">${icones.compartilhar} Gerar e compartilhar</button>
        <button type="button" class="btn" id="baixar">${icones.baixar} Baixar arquivo</button>
      </div>
      <p class="sub" id="resultado-gerar" style="margin-top:12px" hidden></p>
      <p class="sub" style="margin-top:16px"><strong>Receber:</strong> escolha o arquivo do pacote (normalmente na pasta Downloads).</p>
      <div class="acoes"><button type="button" class="btn" id="importar">${icones.baixar} Importar pacote</button></div>
      <!-- Sem filtro de tipo: alguns apps (como o Google Drive) informam o tipo do arquivo
           de um jeito diferente e o arquivo aparecia apagado na lista. O app confere o conteúdo. -->
      <input type="file" id="arquivo-pacote" hidden>
    </section>

    ${ultimo ? `<p class="sub" style="margin-top:12px">Último pacote importado neste aparelho: gerado ${ultimo.geradoPor ? `no ${esc(ultimo.geradoPor.nome)} ` : ''}em ${dataHora(ultimo.geradoEm)}.</p>` : ''}`;

  const resumoTexto = (resumo, kb) => `${qtd(resumo.produtos, 'produto', 'produtos')}, ${qtd(resumo.itens, 'item vendável', 'itens vendáveis')} e ${qtd(resumo.eventos, 'evento', 'eventos')}${kb ? ` (${kb.toLocaleString('pt-BR')} KB)` : ''}`;

  // Confirma e importa um pacote (arquivo ou Drive)
  async function confirmarEImportar(arquivo) {
    const { pacote, resumo } = await lerPacote(arquivo);
    const origem = resumo.geradoPor ? `do ${resumo.geradoPor.nome} (${resumo.geradoPor.sigla})` : '';
    const ok = await confirmar({
      titulo: 'Importar este pacote?',
      texto: `Pacote ${origem} gerado em ${dataHora(resumo.geradoEm)}: ${resumoTexto(resumo)}. O catálogo deste aparelho será substituído.${resumo.comPin ? ' O PIN também passa a valer aqui.' : ''}`,
      botao: 'Importar'
    });
    if (!ok) return false;
    await importarPacote(pacote);
    aviso('Pacote importado.');
    location.hash = '#/inicio';
    return true;
  }

  // ---------- Drive ----------
  if (driveConfigurado()) {
    const status = el.querySelector('#drive-status');
    const mostrar = (texto) => { status.hidden = false; status.textContent = texto; };
    const botoes = [el.querySelector('#drive-enviar'), el.querySelector('#drive-receber')];
    const ocupado = (sim) => botoes.forEach((b) => { b.disabled = sim; });
    prepararDrive().catch((e) => mostrar(e.message));

    el.querySelector('#drive-enviar').addEventListener('click', async () => {
      const pedido = autorizar();   // abre o Google no mesmo toque
      ocupado(true);
      try {
        await pedido;
        mostrar('Gerando o pacote…');
        const { arquivo, resumo } = await gerarPacote();
        mostrar('Enviando para o Drive…');
        const apagados = await enviarPacote(arquivo, await lerAparelho());
        mostrar(`Enviado: ${resumoTexto(resumo, Math.max(1, Math.round(arquivo.size / 1024)))}.${apagados ? ` ${qtd(apagados, 'pacote antigo apagado', 'pacotes antigos apagados')}.` : ''}`);
        aviso('Pacote enviado para o Drive.');
      } catch (erro) {
        console.error(erro);
        mostrar(erro.message);
        aviso(erro.message, { tipo: 'erro' });
      } finally { ocupado(false); }
    });

    el.querySelector('#drive-receber').addEventListener('click', async () => {
      const pedido = autorizar();
      ocupado(true);
      try {
        await pedido;
        mostrar('Procurando o pacote no Drive…');
        const info = await ultimoPacote();
        if (!info) { mostrar('Nenhum pacote no Drive ainda. Envie primeiro do aparelho principal.'); return; }
        mostrar('Baixando o pacote…');
        const arquivo = await baixarPacote(info);
        status.hidden = true;
        await confirmarEImportar(arquivo);
      } catch (erro) {
        console.error(erro);
        mostrar(erro.message);
        aviso(erro.message, { tipo: 'erro' });
      } finally { ocupado(false); }
    });
  }

  // ---------- Baixar (computador) ----------
  el.querySelector('#baixar').addEventListener('click', async () => {
    try {
      const { arquivo } = await gerarPacote();
      baixar(arquivo);
      aviso('Pacote salvo na pasta Downloads.');
    } catch (erro) { aviso('Não foi possível gerar o pacote: ' + erro.message, { tipo: 'erro' }); }
  });

  // ---------- Gerar ----------
  el.querySelector('#gerar').addEventListener('click', async (e) => {
    const botao = e.currentTarget;
    botao.disabled = true;
    try {
      const { arquivo, resumo } = await gerarPacote();
      const kb = Math.max(1, Math.round(arquivo.size / 1024));
      const info = el.querySelector('#resultado-gerar');
      info.hidden = false;
      info.textContent = `Pacote com ${qtd(resumo.produtos, 'produto', 'produtos')}, ${qtd(resumo.itens, 'item vendável', 'itens vendáveis')} e ${qtd(resumo.eventos, 'evento', 'eventos')} (${kb.toLocaleString('pt-BR')} KB).`;

      // Abre a tela de compartilhar do Android; se não der, baixa o arquivo
      if (navigator.canShare && navigator.canShare({ files: [arquivo] })) {
        try {
          await navigator.share({ files: [arquivo], title: 'Pacote Coline Zaiko' });
        } catch (erro) {
          if (erro.name !== 'AbortError') baixar(arquivo);
        }
      } else {
        baixar(arquivo);
        aviso('Pacote salvo na pasta Downloads.');
      }
    } catch (erro) {
      console.error(erro);
      aviso('Não foi possível gerar o pacote: ' + erro.message, { tipo: 'erro' });
    } finally {
      botao.disabled = false;
    }
  });

  // ---------- Importar ----------
  const campo = el.querySelector('#arquivo-pacote');
  el.querySelector('#importar').addEventListener('click', () => campo.click());
  campo.addEventListener('change', async () => {
    const arquivo = campo.files[0];
    campo.value = '';
    if (!arquivo) return;
    try {
      await confirmarEImportar(arquivo);
    } catch (erro) {
      console.error(erro);
      aviso(erro.message || 'Não foi possível importar o pacote.', { tipo: 'erro' });
    }
  });
}

function baixar(arquivo) {
  const url = URL.createObjectURL(arquivo);
  const a = document.createElement('a');
  a.href = url;
  a.download = arquivo.name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
