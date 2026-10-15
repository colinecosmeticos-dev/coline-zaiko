// =========================================================
// Códigos de barras internos.
// Produtos sem código recebem um EAN-13 começando com "20".
// Pela regra internacional (GS1), os prefixos 20 a 29 são reservados
// para uso interno da loja: nunca coincidem com o código de um produto
// de fábrica. Assim o leitor Bluetooth lê a etiqueta impressa normalmente.
// =========================================================
import { buscarPorCodigo } from './db.js';

// Calcula o dígito verificador do EAN-13 a partir dos 12 primeiros dígitos
export function digitoEAN13(doze) {
  let soma = 0;
  for (let i = 0; i < 12; i++) soma += Number(doze[i]) * (i % 2 ? 3 : 1);
  return (10 - (soma % 10)) % 10;
}

export function ehCodigoInterno(codigo) {
  return /^20\d{11}$/.test(codigo) && digitoEAN13(codigo) === Number(codigo[12]);
}

// Gera um código interno novo que ainda não existe no banco
// nem na lista "reservados" (códigos já usados no formulário aberto).
export async function gerarCodigoInterno(reservados = new Set()) {
  for (let tentativa = 0; tentativa < 20; tentativa++) {
    let doze = '20';
    const aleatorio = crypto.getRandomValues(new Uint32Array(10));
    for (const n of aleatorio) doze += String(n % 10);
    const codigo = doze + digitoEAN13(doze);
    if (!reservados.has(codigo) && !(await buscarPorCodigo(codigo))) return codigo;
  }
  throw new Error('Não foi possível gerar um código interno.');
}

// Limpa o que veio do leitor ou do teclado (espaços nas pontas)
export function normalizarCodigo(texto) {
  return String(texto || '').trim();
}
