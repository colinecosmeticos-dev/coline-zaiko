// =========================================================
// Tela Sincronizar (#/sincronizar): o lugar de tudo o que vai e vem
// entre os aparelhos (v0.26.0; antes parte ficava no Mais).
//   Caixa:  situação (base recebida, último envio, o que falta enviar)
//           e o botão "Sincronizar agora".
//   Gestão: "Publicar base" para os caixas e "Buscar vendas dos caixas".
//   Os dois: "Sem internet: por arquivo" (pacote e vendas) e, na Gestão,
//   "Instalar em outro aparelho" (QR Code).
// O ícone Sincronizar do menu fica com um ponto amarelo:
//   Caixa:  vendas sem enviar ou nunca sincronizado;
//   Gestão: alterações na base ainda não publicadas (evento novo, preços...).
// =========================================================
import { lerConfig, lerEventoAtivo } from '../db.js';
import { esc, aviso, abrirJanela, icones } from '../ui.js';
import { driveConfigurado, prepararDrive, autorizar } from '../drive.js';
import { ehCaixa } from '../modo.js';
import { pendencias, sincronizarCaixa, situacaoBase, publicarBase, buscarVendasDosCaixas } from '../sincronizar.js';

const quando = (iso) => {
  if (!iso) return '';
  const d = new Date(iso), hoje = new Date();
  const h = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return d.toDateString() === hoje.toDateString() ? `hoje às ${h}` : `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} às ${h}`;
};
const textoPendente = (p) => {
  const partes = [];
  if (p.vendas) partes.push(`${p.vendas} ${p.vendas === 1 ? 'venda' : 'vendas'}`);
  if (p.outros) partes.push(`${p.outros} ${p.outros === 1 ? 'registro de caixa' : 'registros de caixa'}`);
  return partes.join(' e ');
};
const semInternet = (erro) => /conex|internet|carregando|Failed to fetch|NetworkError/i.test(String(erro && erro.message));
const mensagemErro = (erro, caixa = true) => (semInternet(erro)
  ? (caixa ? 'Sem internet agora. As vendas continuam guardadas neste aparelho: sincronize quando tiver sinal.' : 'Sem internet agora. Tente de novo quando tiver conexão.')
  : erro.message || String(erro));

// ---------- Indicador no menu ----------
export async function atualizarIndicador() {
  const link = document.querySelector('.nav a[data-rota="sincronizar"]');
  if (!link) return;
  if (!ehCaixa()) {
    // Gestão: ponto amarelo quando há alterações não publicadas para os caixas
    if (!driveConfigurado()) { link.classList.remove('pendente'); return; }
    try {
      const { publicada, alterada } = await situacaoBase();
      link.classList.toggle('pendente', alterada);
      link.title = alterada ? (publicada ? 'Há alterações não publicadas para os caixas' : 'Base ainda não publicada') : 'Base dos caixas em dia';
    } catch (e) { /* ok */ }
    return;
  }
  try {
    const p = await pendencias();
    const pendente = !p.ultimo || p.vendas + p.outros > 0;
    link.classList.toggle('pendente', pendente);
    link.title = pendente ? (p.ultimo ? `${textoPendente(p)} sem enviar` : 'Ainda não sincronizado') : 'Tudo enviado';
  } catch (e) { /* ok */ }
}

// ---------- Caixa: sincronizar com janela de andamento ----------
// Chamar DIRETO no toque do botão (o Google exige um toque para autorizar).
export function iniciarSincronizacao() {
  let pedido;
  try { pedido = autorizar(); } catch (e) { pedido = Promise.reject(e); }
  return new Promise((resolver) => {
    let resultado = null;
    const d = abrirJanela(`
      <div class="sinc-janela">
        <h2>Sincronizando</h2>
        <p class="sinc-passo" id="passo">Entrando no Google…</p>
        <div class="sinc-barra" aria-hidden="true"><span></span></div>
        <div class="acoes"><button type="button" class="btn" id="fechar" hidden>Fechar</button></div>
      </div>`, { classe: 'janela-sinc', aoFechar: () => resolver(resultado) });
    const $ = (s) => d.querySelector(s);
    $('#fechar').addEventListener('click', () => d.close());
    // Não deixa fechar no meio (Esc) para não parecer que acabou
    d.addEventListener('cancel', (e) => { if ($('#fechar').hidden) e.preventDefault(); });
    (async () => {
      try {
        await pedido;
        resultado = await sincronizarCaixa((t) => { $('#passo').textContent = t; });
        const linhas = [
          resultado.baseNova ? `Base nova recebida${resultado.baseNova !== '—' ? ` (nº ${resultado.baseNova})` : ''}: catálogo, preços e formas de pagamento atualizados.` : 'Base: já estava em dia.',
          resultado.eventoTrocado ? `Evento em uso agora: ${esc(resultado.eventoTrocado)}.` : '',
          resultado.avisoEvento ? `<strong>${esc(resultado.avisoEvento)}</strong>` : '',
          resultado.enviados ? 'Vendas e caixas enviados para a Gestão.' : 'Nenhuma venda para enviar.',
          'Backup do aparelho salvo no Drive.'
        ].filter(Boolean);
        d.querySelector('.sinc-janela').innerHTML = `
          <div class="marca-ok" aria-hidden="true">✓</div>
          <h2>Sincronizado</h2>
          <ul class="sinc-resumo">${linhas.map((l) => `<li>${l}</li>`).join('')}</ul>
          <div class="acoes"><button type="button" class="btn primario" id="ok">Pronto</button></div>`;
        d.querySelector('#ok').addEventListener('click', () => d.close());
        d.querySelector('#ok').focus();
      } catch (erro) {
        console.error(erro);
        d.querySelector('.sinc-janela').innerHTML = `
          <h2>Não deu para sincronizar</h2>
          <p>${esc(mensagemErro(erro))}</p>
          <div class="acoes"><button type="button" class="btn primario" id="ok">Entendi</button></div>`;
        d.querySelector('#ok').addEventListener('click', () => d.close());
      } finally {
        atualizarIndicador();
      }
    })();
  });
}

// Lembrete depois de fechar o caixa (modo Caixa)
export function lembrarDeSincronizar() {
  return new Promise((resolver) => {
    const d = abrirJanela(`
      <h2>Sincronizar agora?</h2>
      <p>Manda as vendas do dia para a Gestão e salva o backup deste aparelho. Precisa de internet.</p>
      <div class="acoes">
        <button type="button" class="btn" id="depois">Depois</button>
        <button type="button" class="btn primario" id="agora">${icones.compartilhar} Sincronizar agora</button>
      </div>`, { aoFechar: () => resolver() });
    d.querySelector('#depois').addEventListener('click', () => { d.close(); aviso('Lembre de sincronizar quando tiver internet.'); });
    d.querySelector('#agora').addEventListener('click', () => { d.close(); iniciarSincronizacao(); });
  });
}

// ---------- Tela ----------
export async function render(el) {
  if (driveConfigurado()) prepararDrive().catch(() => {});
  if (!driveConfigurado()) {
    el.innerHTML = `<header class="cab"><h1>Sincronizar</h1><p class="sub">O Google Drive não está ligado ao app: use os arquivos.</p></header>${secaoArquivo()}${ehCaixa() ? '' : secaoInstalar()}`;
    return;
  }
  return ehCaixa() ? telaCaixa(el) : telaGestao(el);
}

// Sem internet: os mesmos dados por arquivo (Quick Share, Bluetooth, cabo)
function secaoArquivo() {
  const caixa = ehCaixa();
  const itens = caixa
    ? [['#/pacote', 'Receber catálogo e evento', 'Pacote preparado na Gestão'], ['#/juntar', 'Enviar vendas', 'Vendas e caixas deste aparelho, para a Gestão']]
    : [['#/pacote', 'Pacote para os caixas', 'Catálogo, preços, formas de pagamento, PIN e eventos'], ['#/juntar', 'Receber vendas dos caixas', 'Arquivos de vendas enviados pelos caixas']];
  return `
    <h2 class="titulo-secao">Sem internet: por arquivo</h2>
    <ul class="lista lista-links">${itens.map(([href, t, sub]) => `
      <li><a href="${href}"><span><strong>${t}</strong><br><span class="sub">${sub}</span></span><span class="seta" aria-hidden="true">›</span></a></li>`).join('')}
    </ul>`;
}
function secaoInstalar() {
  return `
    <h2 class="titulo-secao">Aparelho novo</h2>
    <ul class="lista lista-links">
      <li><a href="#/instalar"><span><strong>Instalar em outro aparelho</strong><br><span class="sub">QR Code que abre o app no tablet novo, já como Caixa</span></span><span class="seta" aria-hidden="true">›</span></a></li>
    </ul>`;
}

async function telaCaixa(el) {
  const [p, recebida, evento, ultimaSinc] = await Promise.all([pendencias(), lerConfig('baseRecebida', null), lerEventoAtivo(), lerConfig('ultimaSincronizacao', null)]);
  const total = p.vendas + p.outros;
  el.innerHTML = `
    <header class="cab"><div><h1>Sincronizar</h1>
      <p class="sub">Recebe a base da Gestão, envia as vendas deste aparelho e salva o backup. Precisa de internet.</p></div></header>
    <section class="cartao sinc-estado ${!ultimaSinc || total ? 'pendente' : 'em-dia'}">
      <h2>${!ultimaSinc ? 'Ainda não sincronizado' : total ? `${textoPendente(p)} sem enviar` : 'Tudo enviado'}</h2>
      <ul class="sinc-lista">
        <li><span>Base da Gestão</span><strong>${recebida ? `${recebida.versao ? `nº ${recebida.versao}, ` : ''}publicada ${quando(recebida.publicadoEm)}` : 'não recebida'}</strong></li>
        <li><span>Evento em uso</span><strong>${evento ? esc(evento.nome) : 'nenhum'}</strong></li>
        <li><span>Última sincronização</span><strong>${ultimaSinc ? quando(ultimaSinc.em) : 'nunca'}</strong></li>
      </ul>
      <button type="button" class="btn primario btn-sinc" id="sincronizar">${icones.compartilhar} Sincronizar agora</button>
    </section>
    <p class="sub" style="margin-top:12px">Sem internet no evento? Venda normalmente: tudo fica guardado neste aparelho e vai na próxima sincronização.</p>
    ${secaoArquivo()}`;
  el.querySelector('#sincronizar').addEventListener('click', async () => {
    await iniciarSincronizacao();
    if (el.isConnected) telaCaixa(el);
  });
  atualizarIndicador();
}

async function telaGestao(el) {
  const [{ publicada, alterada }, evento, busca] = await Promise.all([situacaoBase(), lerEventoAtivo(), lerConfig('ultimaBuscaVendas', null)]);
  el.innerHTML = `
    <header class="cab"><div><h1>Sincronizar</h1>
      <p class="sub">A base leva aos caixas o catálogo, as fotos, os preços, as formas de pagamento, o PIN e o evento em uso deste aparelho. Os caixas recebem ao tocar em Sincronizar.</p></div></header>

    <section class="cartao sinc-estado ${alterada ? 'pendente' : 'em-dia'}">
      <h2>Base para os caixas</h2>
      <ul class="sinc-lista">
        <li><span>Publicada</span><strong>${publicada ? `nº ${publicada.versao}, ${quando(publicada.em)}` : 'nunca'}</strong></li>
        <li><span>Evento dos caixas</span><strong>${evento ? esc(evento.nome) : 'nenhum (escolha em Eventos)'}</strong></li>
        <li><span>Situação</span><strong>${!publicada ? 'Publique a primeira base' : alterada ? 'Há alterações não publicadas' : 'Em dia'}</strong></li>
      </ul>
      <button type="button" class="btn ${alterada ? 'primario' : ''} btn-sinc" id="publicar">${icones.compartilhar} Publicar base</button>
      <p class="sub" id="status-base" hidden></p>
    </section>

    <section class="cartao" style="margin-top:16px">
      <h2>Vendas dos caixas</h2>
      <p class="sub">Traz para este aparelho as vendas que os caixas enviaram${evento ? ` em ${esc(evento.nome)}` : ''}. Faça antes do Fechamento do evento.${busca ? ` Última busca: ${quando(busca.em)}.` : ''}</p>
      <div class="acoes" style="justify-content:flex-start">
        <button type="button" class="btn" id="buscar" ${evento ? '' : 'disabled'}>${icones.baixar} Buscar vendas dos caixas</button>
        <a class="btn texto" href="#/fechamento">Ir para o Fechamento</a>
      </div>
      <div id="status-vendas" class="sub" hidden></div>
    </section>
    ${secaoArquivo()}
    ${secaoInstalar()}`;
  const $ = (s) => el.querySelector(s);
  $('#publicar').addEventListener('click', async (e) => {
    const botao = e.currentTarget;
    const pedido = autorizar();
    botao.disabled = true;
    const status = $('#status-base'); status.hidden = false; status.textContent = 'Publicando…';
    try {
      await pedido;
      const r = await publicarBase();
      aviso(`Base nº ${r.versao} publicada.`);
      telaGestao(el);
      atualizarIndicador();
    } catch (erro) {
      console.error(erro);
      status.textContent = mensagemErro(erro, false);
      botao.disabled = false;
    }
  });
  $('#buscar').addEventListener('click', async (e) => {
    const botao = e.currentTarget;
    const pedido = autorizar();
    botao.disabled = true;
    const status = $('#status-vendas'); status.hidden = false; status.textContent = 'Buscando…';
    try {
      await pedido;
      const r = await buscarVendasDosCaixas();
      status.innerHTML = r.aparelhos.length
        ? `<ul class="sinc-resumo">${r.aparelhos.map((a) => `<li><strong>${esc(a.nome || a.sigla)}</strong> (${esc(a.sigla)}), enviado ${quando(a.enviadoEm)}: ${a.novas} ${a.novas === 1 ? 'venda nova' : 'vendas novas'}${a.atualizadas ? `, ${a.atualizadas} atualizadas` : ''}</li>`).join('')}</ul>`
        : 'Nenhum caixa enviou vendas deste evento ainda.';
      aviso(r.aparelhos.length ? 'Vendas dos caixas recebidas.' : 'Nada novo no Drive.');
    } catch (erro) {
      console.error(erro);
      status.textContent = mensagemErro(erro, false);
    } finally { botao.disabled = false; }
  });
}
