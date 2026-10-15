// =========================================================
// Leitor de código de barras Bluetooth.
// O leitor funciona como um teclado: "digita" o código muito rápido
// e aperta Enter no final. Aqui separamos isso da digitação humana
// pela velocidade (um leitor digita cada caractere em poucos milissegundos).
//
// Uso:  const parar = ouvirLeitor((codigo) => { ... });
//       parar();  // quando sair da tela
// Só escuta quando nenhum campo de texto está selecionado — dentro de
// um campo, o próprio campo recebe o código.
// =========================================================

const INTERVALO_MAX = 60;   // ms entre caracteres para contar como leitor
const TAMANHO_MIN = 4;      // códigos menores que isso são ignorados

export function ouvirLeitor(aoLer) {
  let buffer = '';
  let ultimo = 0;

  function aoTeclar(e) {
    const alvo = e.target;
    const emCampo = alvo && (alvo.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(alvo.tagName));
    if (emCampo || e.ctrlKey || e.altKey || e.metaKey) return;

    const agora = performance.now();
    if (agora - ultimo > INTERVALO_MAX * 3) buffer = '';
    ultimo = agora;

    if (e.key === 'Enter') {
      if (buffer.length >= TAMANHO_MIN) {
        e.preventDefault();
        const codigo = buffer;
        buffer = '';
        aoLer(codigo);
      }
      buffer = '';
      return;
    }
    if (e.key.length === 1) buffer += e.key;
  }

  document.addEventListener('keydown', aoTeclar);
  return () => document.removeEventListener('keydown', aoTeclar);
}
