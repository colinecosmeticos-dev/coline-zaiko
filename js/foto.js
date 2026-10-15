// =========================================================
// Fotos dos produtos.
// A foto da câmera tem vários megabytes. Aqui recortamos um quadrado
// do centro e reduzimos para 600×600, o que deixa cada foto com
// cerca de 30 a 60 KB. O banco fica leve e a tela de venda, rápida.
// =========================================================

const LADO = 600;

export async function prepararFoto(arquivo) {
  const imagem = await carregarImagem(arquivo);
  const largura = imagem.width, altura = imagem.height;
  const lado = Math.min(largura, altura);
  const sx = (largura - lado) / 2, sy = (altura - lado) / 2;
  const destino = Math.min(LADO, lado);

  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = destino;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(imagem, sx, sy, lado, lado, 0, 0, destino, destino);
  if (imagem.close) imagem.close();

  // WebP é menor; se o navegador não souber gerar WebP, usa JPEG
  let blob = await paraBlob(canvas, 'image/webp', 0.82);
  if (!blob || blob.type !== 'image/webp') blob = await paraBlob(canvas, 'image/jpeg', 0.85);
  return blob;
}

function paraBlob(canvas, tipo, qualidade) {
  return new Promise((ok) => canvas.toBlob(ok, tipo, qualidade));
}

async function carregarImagem(arquivo) {
  if (window.createImageBitmap) {
    try { return await createImageBitmap(arquivo, { imageOrientation: 'from-image' }); } catch (e) { /* tenta o outro jeito */ }
  }
  return new Promise((ok, falha) => {
    const url = URL.createObjectURL(arquivo);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); ok(img); };
    img.onerror = () => { URL.revokeObjectURL(url); falha(new Error('Imagem inválida')); };
    img.src = url;
  });
}
