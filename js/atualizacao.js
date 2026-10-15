// =========================================================
// Atualizações do app — sempre com o seu controle.
// O navegador procura versão nova quando o app é aberto, e há o botão
// "Procurar atualização" nas Configurações. Quando acha, a versão nova
// fica ESPERANDO: só passa a valer quando você toca em "Atualizar agora"
// (ou quando o app é totalmente fechado e aberto de novo).
// Nada é trocado no meio do uso.
// =========================================================
let registro = null;

export function iniciarAtualizacoes() {
  if (!('serviceWorker' in navigator)) return;
  const tinhaControle = !!navigator.serviceWorker.controller;

  navigator.serviceWorker.register('sw.js').then((r) => {
    registro = r;
    if (r.waiting && tinhaControle) mostrarFaixa();
    r.addEventListener('updatefound', () => {
      const nova = r.installing;
      if (!nova) return;
      nova.addEventListener('statechange', () => {
        // "installed" com o app já em uso = versão nova esperando autorização
        if (nova.state === 'installed' && navigator.serviceWorker.controller) mostrarFaixa();
      });
    });
  }).catch((e) => console.error('Service worker:', e));

  // Depois de autorizada, a versão nova assume e o app recarrega
  let recarregando = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!tinhaControle || recarregando) return;
    recarregando = true;
    location.reload();
  });
}

// Botão "Procurar atualização". Devolve 'nova', 'atual' ou 'sem-internet'.
export async function procurar() {
  if (!registro) registro = await navigator.serviceWorker.getRegistration();
  if (!registro) return 'atual';
  if (!navigator.onLine) return 'sem-internet';
  await registro.update();
  return registro.installing || registro.waiting ? 'nova' : 'atual';
}

function aplicar() {
  if (registro && registro.waiting) registro.waiting.postMessage('atualizar');
}

function mostrarFaixa() {
  if (document.querySelector('.faixa-atualizacao')) return;
  const faixa = document.createElement('div');
  faixa.className = 'faixa-atualizacao';
  faixa.innerHTML = '<span>Versão nova do app disponível.</span>';
  const agora = document.createElement('button');
  agora.className = 'btn';
  agora.textContent = 'Atualizar agora';
  agora.onclick = () => { agora.disabled = true; aplicar(); };
  const depois = document.createElement('button');
  depois.className = 'btn texto';
  depois.style.color = 'inherit';
  depois.textContent = 'Depois';
  depois.onclick = () => faixa.remove();
  faixa.append(agora, depois);
  document.body.append(faixa);
}
