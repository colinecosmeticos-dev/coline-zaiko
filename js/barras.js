// =========================================================
// Desenha um código de barras EAN-13 em SVG (o formato dos códigos
// de fábrica e dos códigos internos "20..." do app).
// 95 "módulos" (faixas finas): guarda 101, 6 dígitos da esquerda,
// guarda central 01010, 6 dígitos da direita, guarda final 101.
// =========================================================
import { digitoEAN13 } from './codigos.js';

const L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
const R = L.map((p) => [...p].map((b) => (b === '1' ? '0' : '1')).join(''));
const G = R.map((p) => [...p].reverse().join(''));
// Qual tabela (L ou G) usar em cada dígito da esquerda, conforme o 1º dígito
const PARIDADE = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];

export function ehEAN13(codigo) {
  return /^\d{13}$/.test(codigo) && digitoEAN13(codigo) === Number(codigo[12]);
}

export function svgEAN13(codigo) {
  if (!ehEAN13(codigo)) return '';
  const d = [...codigo].map(Number);
  let bits = '101';
  for (let i = 1; i <= 6; i++) bits += (PARIDADE[d[0]][i - 1] === 'L' ? L : G)[d[i]];
  bits += '01010';
  for (let i = 7; i <= 12; i++) bits += R[d[i]];
  bits += '101';

  const margemE = 11, margemD = 7, alto = 56, guarda = 62;
  // posições das barras de guarda (ficam mais compridas)
  const ehGuarda = (i) => i < 3 || (i >= 45 && i < 50) || i >= 92;
  let barras = '';
  for (let i = 0; i < bits.length; i++) {
    if (bits[i] !== '1') continue;
    let fim = i;
    while (fim + 1 < bits.length && bits[fim + 1] === '1' && ehGuarda(fim + 1) === ehGuarda(i)) fim++;
    barras += `<rect x="${margemE + i}" y="0" width="${fim - i + 1}" height="${ehGuarda(i) ? guarda : alto}"/>`;
    i = fim;
  }
  const texto = (x, t) => `<text x="${x}" y="70" text-anchor="middle">${t}</text>`;
  return `<svg class="ean13" viewBox="0 0 ${margemE + 95 + margemD} 72" role="img" aria-label="Código ${codigo}" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="#fff"/>
    <g fill="#000">${barras}</g>
    <g fill="#000" font-family="Arial, Helvetica, sans-serif" font-size="10">
      ${texto(5, d[0])}${texto(margemE + 3 + 21, codigo.slice(1, 7))}${texto(margemE + 50 + 21, codigo.slice(7))}
    </g></svg>`;
}
