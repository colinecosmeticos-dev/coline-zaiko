// =========================================================
// Câmera dentro do próprio app.
// Em vez de abrir o app de câmera do Android (que em alguns tablets
// esconde o botão de confirmar a foto), mostramos a imagem da câmera
// aqui mesmo, com uma moldura quadrada. Ao tocar no botão redondo,
// o app guarda exatamente o que está dentro da moldura.
//
// Uso:  const foto = await abrirCamera();   // Blob, ou null se cancelou
// Lança erro se o navegador não tiver câmera ou a permissão for negada.
// =========================================================
import { icones } from './ui.js';

export function cameraDisponivel() {
  return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
}

export function abrirCamera() {
  return new Promise(async (resolver, rejeitar) => {
    let fluxo = null;
    let lado = 'environment'; // traseira; 'user' = frontal
    let terminou = false;

    const tela = document.createElement('div');
    tela.className = 'camera';
    tela.setAttribute('role', 'dialog');
    tela.setAttribute('aria-label', 'Câmera');
    tela.innerHTML = `
      <video playsinline muted autoplay></video>
      <div class="camera-moldura" aria-hidden="true"></div>
      <p class="camera-dica">Enquadre o produto dentro do quadrado</p>
      <div class="camera-barra">
        <button type="button" class="camera-botao" data-acao="fechar" aria-label="Fechar câmera">${icones.fechar}</button>
        <button type="button" class="camera-disparo" data-acao="foto" aria-label="Tirar foto"></button>
        <button type="button" class="camera-botao" data-acao="trocar" aria-label="Trocar câmera" hidden>${icones.trocar}</button>
      </div>`;
    const video = tela.querySelector('video');
    const moldura = tela.querySelector('.camera-moldura');

    function encerrar(resultado) {
      if (terminou) return;
      terminou = true;
      if (fluxo) fluxo.getTracks().forEach((t) => t.stop());
      document.removeEventListener('keydown', aoTeclar);
      window.removeEventListener('hashchange', aoNavegar);
      tela.remove();
      resolver(resultado);
    }
    const aoTeclar = (e) => { if (e.key === 'Escape') encerrar(null); };
    const aoNavegar = () => encerrar(null); // gesto de voltar do Android

    async function ligar() {
      if (fluxo) fluxo.getTracks().forEach((t) => t.stop());
      fluxo = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: lado }, width: { ideal: 1920 }, height: { ideal: 1080 } }
      });
      video.srcObject = fluxo;
      video.classList.toggle('espelhado', lado === 'user');
      await video.play().catch(() => {});
    }

    // Recorta do vídeo exatamente a área que aparece dentro da moldura
    function capturar() {
      const vw = video.videoWidth, vh = video.videoHeight;
      if (!vw || !vh) return;
      const rv = video.getBoundingClientRect();
      const rm = moldura.getBoundingClientRect();
      // O vídeo preenche a tela cortando as sobras (object-fit: cover)
      const escala = Math.max(rv.width / vw, rv.height / vh);
      const sobraX = (vw * escala - rv.width) / 2;
      const sobraY = (vh * escala - rv.height) / 2;
      let sx = (rm.left - rv.left + sobraX) / escala;
      const sy = (rm.top - rv.top + sobraY) / escala;
      const ladoPx = rm.width / escala;
      if (lado === 'user') sx = vw - sx - ladoPx; // frontal aparece espelhada

      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = Math.round(ladoPx);
      canvas.getContext('2d').drawImage(video, sx, sy, ladoPx, ladoPx, 0, 0, canvas.width, canvas.height);
      tela.classList.add('flash');
      canvas.toBlob((blob) => encerrar(blob), 'image/jpeg', 0.92);
    }

    tela.addEventListener('click', async (e) => {
      const acao = e.target.closest('[data-acao]');
      if (!acao) return;
      if (acao.dataset.acao === 'fechar') encerrar(null);
      if (acao.dataset.acao === 'foto') capturar();
      if (acao.dataset.acao === 'trocar') {
        lado = lado === 'environment' ? 'user' : 'environment';
        try { await ligar(); } catch (erro) { console.error(erro); }
      }
    });
    document.addEventListener('keydown', aoTeclar);
    window.addEventListener('hashchange', aoNavegar);
    document.body.append(tela);

    try {
      await ligar();
    } catch (erro) {
      terminou = true;
      tela.remove();
      document.removeEventListener('keydown', aoTeclar);
      window.removeEventListener('hashchange', aoNavegar);
      rejeitar(erro);
      return;
    }

    // Só mostra "Trocar câmera" se o aparelho tiver mais de uma
    try {
      const dispositivos = await navigator.mediaDevices.enumerateDevices();
      if (dispositivos.filter((d) => d.kind === 'videoinput').length > 1) {
        tela.querySelector('[data-acao="trocar"]').hidden = false;
      }
    } catch (e) { /* sem lista de câmeras: mantém só uma */ }
    tela.querySelector('[data-acao="foto"]').focus();
  });
}
