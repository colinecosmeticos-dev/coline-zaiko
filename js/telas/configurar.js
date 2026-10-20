// =========================================================
// Assistente de configuração (#/configurar).
// Aparece na primeira vez que o app abre num aparelho novo:
//   1. modo do aparelho (Caixa ou Gestão; Gestão pede o PIN, se houver);
//   2. nome e sigla do aparelho;
//   3. Caixa: sincronizar (recebe catálogo e evento pelo Drive) ou pacote;
//      Gestão: receber o pacote ou começar do zero.
// Aberto pelo QR Code da Gestão (v0.24.0): o modo indicado já vem escolhido
// e o assistente começa no passo 2 (dá para voltar e trocar).
// =========================================================
import { lerAparelho, gravarAparelho } from '../db.js';
import { esc, aviso, icones } from '../ui.js';
import { temPin, pedirPin } from '../pin.js';
import { modoAtual, definirModo } from '../modo.js';
import { driveConfigurado, prepararDrive } from '../drive.js';
import { iniciarSincronizacao } from './sincronizar.js';

const CHAVE_INDICADO = 'zaiko-modo-indicado';
const lerIndicado = () => { try { return localStorage.getItem(CHAVE_INDICADO); } catch (e) { return null; } };
const esquecerIndicado = () => { try { localStorage.removeItem(CHAVE_INDICADO); } catch (e) { /* ok */ } };

export async function render(el) {
  let passo = 1;
  let escolha = modoAtual();
  // Indicado pelo QR Code: Caixa pula a escolha; Gestão fica marcada no passo 1 (pede o PIN, se houver)
  const indicado = !escolha ? lerIndicado() : null;
  let veioDoQR = false;
  if (indicado === 'caixa') { escolha = 'caixa'; passo = 2; veioDoQR = true; }
  const aparelho = await lerAparelho();

  const cabecalho = (n, titulo, texto) => `
    <div class="assistente-passos" aria-label="Passo ${n} de 3">${[1, 2, 3].map((i) => `<span class="${i <= n ? 'feito' : ''}"></span>`).join('')}</div>
    <p class="sub">Passo ${n} de 3</p>
    <h1>${titulo}</h1>
    <p class="sub" style="margin-bottom:20px">${texto}</p>`;

  function desenhar() {
    if (passo === 1) {
      el.innerHTML = `<div class="assistente">
        <div class="simbolo-assistente" aria-hidden="true">在庫</div>
        ${cabecalho(1, 'Como este aparelho vai ser usado?', 'Dá para mudar depois.')}
        <div class="opcoes-modo">
          <button type="button" class="cartao-modo ${indicado === 'caixa' ? 'indicado' : ''}" data-modo="caixa">
            <strong>Caixa</strong>
            <span>Para quem vende no evento. Menu simples: Vender, Vendas e Caixa.</span>
          </button>
          <button type="button" class="cartao-modo ${indicado === 'gestao' ? 'indicado' : ''}" data-modo="gestao">
            <strong>Gestão</strong>
            <span>Para quem cuida de tudo: produtos, eventos, estoque, fechamento e relatórios. Também vende.</span>
          </button>
        </div>
      </div>`;
      el.querySelectorAll('[data-modo]').forEach((b) => b.addEventListener('click', async () => {
        if (b.dataset.modo === 'gestao' && (await temPin()) && !(await pedirPin({ titulo: 'Modo Gestão', texto: 'Digite o PIN.' }))) return;
        escolha = b.dataset.modo;
        passo = 2; desenhar();
      }));
      return;
    }

    if (passo === 2) {
      el.innerHTML = `<div class="assistente">
        ${cabecalho(2, 'Dê um nome a este aparelho', 'A sigla aparece no número de cada venda (ex.: VAIO-0042) e precisa ser diferente em cada aparelho.')}
        ${veioDoQR ? '<p class="etiqueta marca" style="margin-bottom:16px">Modo Caixa, indicado pelo QR Code</p>' : ''}
        <form id="form-aparelho" class="grade-campos" novalidate>
          <div class="campo"><label for="ap-nome">Nome</label>
            <input class="entrada" id="ap-nome" maxlength="40" autocomplete="off" placeholder="Ex.: Vaio TL10" value="${aparelho ? esc(aparelho.nome) : ''}"></div>
          <div class="campo"><label for="ap-sigla">Sigla (2 a 6 letras ou números)</label>
            <input class="entrada" id="ap-sigla" maxlength="6" autocomplete="off" autocapitalize="characters" placeholder="Ex.: VAIO" value="${aparelho ? esc(aparelho.sigla) : ''}" style="text-transform:uppercase"></div>
          <div class="acoes">
            <button type="button" class="btn" id="voltar">Voltar</button>
            <button type="submit" class="btn primario">Continuar</button>
          </div>
        </form>
      </div>`;
      el.querySelector('#voltar').addEventListener('click', () => { passo = 1; desenhar(); });
      el.querySelector('form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const nome = el.querySelector('#ap-nome').value.trim();
        const sigla = el.querySelector('#ap-sigla').value.trim().toUpperCase();
        el.querySelectorAll('.msg-erro').forEach((m) => m.remove());
        const marcar = (input, texto) => { const m = document.createElement('span'); m.className = 'msg-erro'; m.textContent = texto; input.closest('.campo').append(m); input.focus(); };
        if (!nome) return marcar(el.querySelector('#ap-nome'), 'Informe um nome para o aparelho.');
        if (!/^[A-Z0-9]{2,6}$/.test(sigla)) return marcar(el.querySelector('#ap-sigla'), 'Use de 2 a 6 letras ou números, sem espaço.');
        await gravarAparelho({ nome, sigla });
        await definirModo(escolha);
        esquecerIndicado();
        passo = 3; desenhar();
      });
      if (matchMedia('(pointer: fine)').matches) el.querySelector('#ap-nome').focus();
      return;
    }

    const caixa = escolha === 'caixa';
    // Caixa com Drive: sincronizar recebe tudo da Gestão (catálogo, formas de pagamento, evento)
    const peloDrive = caixa && driveConfigurado();
    el.innerHTML = `<div class="assistente">
      ${cabecalho(3, caixa ? 'Agora, o catálogo e o evento' : 'Pronto para começar', peloDrive
        ? 'Toque em Sincronizar agora e entre com a conta Google da empresa. O aparelho recebe os produtos, as formas de pagamento e o evento publicados na Gestão.'
        : caixa ? 'Receba o pacote preparado na Gestão: ele traz os produtos, as formas de pagamento e o evento.'
        : 'Se já existe outro aparelho em Gestão, receba o pacote dele. Se este é o primeiro, comece cadastrando os produtos.')}
      <div class="acoes" style="justify-content:flex-start;flex-wrap:wrap;align-items:center">
        ${peloDrive ? `<button type="button" class="btn primario" id="sincronizar">${icones.compartilhar} Sincronizar agora</button>
        <a class="btn" href="#/pacote">Sem internet: por arquivo</a>` : '<a class="btn primario" href="#/pacote">Receber catálogo e evento</a>'}
        <a class="btn texto" href="${caixa ? '#/vender' : '#/produtos'}">${caixa ? 'Fazer depois' : 'Começar do zero'}</a>
      </div>
    </div>`;
    if (peloDrive) {
      prepararDrive().catch(() => {});
      el.querySelector('#sincronizar').addEventListener('click', async () => {
        const r = await iniciarSincronizacao();   // chamado direto no toque (o Google exige)
        if (r && el.isConnected) location.hash = '#/vender';
      });
    }
    aviso(caixa ? 'Aparelho configurado como Caixa.' : 'Aparelho configurado como Gestão.');
  }
  desenhar();
}
