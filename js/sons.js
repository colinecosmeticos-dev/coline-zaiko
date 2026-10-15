// =========================================================
// Sons do app (podem ser desligados em Configurações).
// Gerados na hora pelo próprio navegador: não há arquivos de áudio.
// =========================================================
const CHAVE = 'zaiko-sons';
let audio = null;

export function sonsLigados() {
  try { return localStorage.getItem(CHAVE) !== 'desligado'; } catch (e) { return true; }
}
export function ligarSons(ligado) {
  try { localStorage.setItem(CHAVE, ligado ? 'ligado' : 'desligado'); } catch (e) { /* sem armazenamento */ }
}

function tocar(notas) {
  if (!sonsLigados()) return;
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    let t = audio.currentTime;
    for (const [freq, dur] of notas) {
      const osc = audio.createOscillator();
      const vol = audio.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      vol.gain.setValueAtTime(0.18, t);
      vol.gain.exponentialRampToValueAtTime(0.001, t + dur);
      osc.connect(vol).connect(audio.destination);
      osc.start(t);
      osc.stop(t + dur);
      t += dur * 0.9;
    }
  } catch (e) { /* sem som neste aparelho */ }
}

export const som = {
  item: () => tocar([[1320, 0.07]]),
  erro: () => tocar([[220, 0.12], [180, 0.18]]),
  venda: () => tocar([[880, 0.1], [1320, 0.16]])
};
