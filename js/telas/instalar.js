// =========================================================
// Tela Instalar em outro aparelho (#/instalar, só na Gestão).
// Mostra um QR Code com o endereço do app. Lido pela câmera do
// tablet novo, abre o app já indicando o modo (Caixa, por padrão):
// o assistente de configuração pula a escolha do modo.
// O endereço leva ?config=caixa (ou gestao); o app guarda a indicação
// (js/app.js) e o assistente usa (js/telas/configurar.js).
// O QR Code é desenhado no próprio aparelho (js/lib/qrcode.mjs), sem internet.
// =========================================================
import qrcode from '../lib/qrcode.mjs';
import { esc, icones, aviso } from '../ui.js';
import { driveConfigurado } from '../drive.js';
import { situacaoBase } from '../sincronizar.js';

const enderecoApp = (modo) => {
  const url = new URL('./', location.href);   // pasta do app (sem index.html, sem #)
  url.search = `config=${modo}`;
  url.hash = '';
  return url.toString();
};

function desenharQR(texto) {
  const qr = qrcode(0, 'M');   // tamanho automático, correção média
  qr.addData(texto);
  qr.make();
  return qr.createSvgTag({ cellSize: 6, margin: 4, scalable: true, alt: 'QR Code do app' });
}

export async function render(el) {
  let modo = 'caixa';
  const drive = driveConfigurado();
  const base = drive ? await situacaoBase() : null;

  el.innerHTML = `
    <a class="voltar" href="#/mais">${icones.voltar} Mais</a>
    <header class="cab"><div><h1>Instalar em outro aparelho</h1>
      <p class="sub">Aponte a câmera do tablet novo para o QR Code. O app abre já pronto para ser configurado.</p></div></header>

    ${drive && (!base.publicada || base.alterada) ? `
    <section class="cartao aviso-instalar">
      <strong>${base.publicada ? 'Há alterações não publicadas' : 'A base ainda não foi publicada'}</strong>
      <p class="sub">O aparelho novo recebe o catálogo e o evento pela base. Publique antes de configurar.</p>
      <div class="acoes" style="justify-content:flex-start"><a class="btn primario" href="#/sincronizar">Publicar base</a></div>
    </section>` : ''}

    <div class="instalar">
      <section class="cartao instalar-qr">
        <div class="segmentos" role="radiogroup" aria-label="Modo do aparelho novo">
          <label><input type="radio" name="modo" value="caixa" checked><span>Caixa</span></label>
          <label><input type="radio" name="modo" value="gestao"><span>Gestão</span></label>
        </div>
        <div class="qr" id="qr"></div>
        <p class="sub endereco num" id="endereco"></p>
        <div class="acoes" style="justify-content:center;flex-wrap:wrap">
          <button type="button" class="btn" id="copiar">Copiar link</button>
          ${navigator.share ? `<button type="button" class="btn" id="compartilhar">${icones.compartilhar} Enviar link</button>` : ''}
        </div>
      </section>

      <section class="cartao">
        <h2>No aparelho novo</h2>
        <ol class="passos-instalar">
          <li><strong>Abra a câmera</strong> e aponte para o QR Code. Toque no link que aparece (abre no Chrome).</li>
          <li><strong>Instale o app:</strong> no Chrome, toque em <strong>Instalar</strong> no aviso que aparece embaixo, ou no menu <strong>⋮</strong> → <strong>Instalar app</strong> (em alguns aparelhos, <strong>Adicionar à tela inicial</strong>).</li>
          <li><strong>Abra o Zaiko</strong> pelo ícone novo na tela inicial.</li>
          <li id="passo-modo"><strong>Dê nome e sigla</strong> ao aparelho (ex.: Vaio TL10 e VAIO). O modo Caixa já vem escolhido.</li>
          <li>${drive ? '<strong>Toque em Sincronizar agora</strong> e entre com a conta Google da empresa: o aparelho recebe o catálogo, as formas de pagamento e o evento.' : '<strong>Receba o catálogo e o evento</strong> pelo pacote (Mais → Preparar outros aparelhos, aqui na Gestão).'}</li>
        </ol>
        <p class="sub">Sem câmera que leia QR Code? Digite o endereço que aparece embaixo do código no Chrome do aparelho novo.</p>
      </section>
    </div>`;

  const $ = (s) => el.querySelector(s);
  function atualizar() {
    const url = enderecoApp(modo);
    $('#qr').innerHTML = desenharQR(url);
    $('#endereco').textContent = url;
    $('#passo-modo').innerHTML = modo === 'caixa'
      ? '<strong>Dê nome e sigla</strong> ao aparelho (ex.: Vaio TL10 e VAIO). O modo Caixa já vem escolhido.'
      : '<strong>Escolha Gestão</strong> e dê nome e sigla ao aparelho. Se houver PIN, ele é pedido.';
  }
  el.querySelectorAll('input[name="modo"]').forEach((r) => r.addEventListener('change', () => { modo = r.value; atualizar(); }));
  $('#copiar').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(enderecoApp(modo)); aviso('Link copiado.'); }
    catch (e) { aviso('Não foi possível copiar. Selecione o endereço embaixo do código.', { tipo: 'erro' }); }
  });
  $('#compartilhar')?.addEventListener('click', async () => {
    try { await navigator.share({ title: 'Coline Zaiko', text: 'Abra no tablet para instalar o Zaiko', url: enderecoApp(modo) }); }
    catch (e) { /* cancelou */ }
  });
  atualizar();
}
