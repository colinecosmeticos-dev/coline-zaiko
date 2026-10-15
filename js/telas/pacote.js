// =========================================================
// Tela Preparar outros aparelhos (Mais → Preparar outros aparelhos).
// No aparelho principal: gerar o pacote e compartilhar.
// Nos outros: importar o pacote recebido.
// =========================================================
import { gerarPacote, lerPacote, importarPacote } from '../pacote.js';
import { lerConfig } from '../db.js';
import { aviso, confirmar, icones, esc } from '../ui.js';

const qtd = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
const dataHora = (iso) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export async function render(el) {
  const ultimo = await lerConfig('ultimoPacoteImportado');

  el.innerHTML = `
    <a class="voltar" href="#/mais">${icones.voltar} Mais</a>
    <header class="cab"><div>
      <h1>Preparar outros aparelhos</h1>
      <p class="sub">Leva catálogo, fotos, formas de pagamento e taxas, categorias de retirada, PIN do dono e eventos de um aparelho para outro.</p>
    </div></header>

    <section class="cartao">
      <h2>Enviar deste aparelho</h2>
      <p class="sub">Use no aparelho principal, onde você cadastra os produtos e cria os eventos.</p>
      <div class="acoes"><button type="button" class="btn primario" id="gerar">${icones.compartilhar} Gerar e compartilhar pacote</button></div>
      <p class="sub" id="resultado-gerar" style="margin-top:12px" hidden></p>
    </section>

    <section class="cartao">
      <h2>Receber neste aparelho</h2>
      <p class="sub">Escolha o arquivo do pacote recebido. O catálogo deste aparelho será substituído pelo do pacote; eventos e categorias são somados.</p>
      <div class="acoes"><button type="button" class="btn" id="importar">${icones.baixar} Importar pacote</button></div>
      <!-- Sem filtro de tipo: alguns apps (como o Google Drive) informam o tipo do arquivo
           de um jeito diferente e o arquivo aparecia apagado na lista. O app confere o conteúdo. -->
      <input type="file" id="arquivo-pacote" hidden>
      ${ultimo ? `<p class="sub" style="margin-top:12px">Último pacote importado: gerado ${ultimo.geradoPor ? `no ${esc(ultimo.geradoPor.nome)} ` : ''}em ${dataHora(ultimo.geradoEm)}.</p>` : ''}
    </section>

    <section class="cartao">
      <h2>Como passar o arquivo</h2>
      <p class="sub">Sem internet: Quick Share (Compartilhamento por proximidade) ou Bluetooth, de tablet para tablet. Com internet: WhatsApp ou Google Drive. Depois, no outro aparelho, toque em Importar pacote e escolha o arquivo (normalmente na pasta Downloads).</p>
    </section>`;

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
      const { pacote, resumo } = await lerPacote(arquivo);
      const origem = resumo.geradoPor ? `do ${resumo.geradoPor.nome} (${resumo.geradoPor.sigla})` : '';
      const ok = await confirmar({
        titulo: 'Importar este pacote?',
        texto: `Pacote ${origem} gerado em ${dataHora(resumo.geradoEm)}: ${qtd(resumo.produtos, 'produto', 'produtos')}, ${qtd(resumo.itens, 'item vendável', 'itens vendáveis')} e ${qtd(resumo.eventos, 'evento', 'eventos')}. O catálogo deste aparelho será substituído.${resumo.comPin ? ' O PIN do dono também passa a valer aqui.' : ''}`,
        botao: 'Importar'
      });
      if (!ok) return;
      await importarPacote(pacote);
      aviso('Pacote importado.');
      location.hash = '#/inicio';
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
