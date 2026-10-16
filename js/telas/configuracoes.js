// Tela Configurações: tema, armazenamento e versão
import { temaSalvo, escolherTema } from '../tema.js';
import { VERSAO } from '../versao.js';
import { procurar } from '../atualizacao.js';
import { sonsLigados, ligarSons } from '../sons.js';
import { temPin, definirPin, removerPin, conferirPin, pinValido } from '../pin.js';
import { aviso, confirmar, icones } from '../ui.js';
import { definirModo } from '../modo.js';
import { lerAparelho, gravarAparelho, listarFormasPagamento, listarCategoriasRetirada } from '../db.js';

export async function render(el) {
  const tema = temaSalvo();
  const pinDefinido = await temPin();
  const aparelho = await lerAparelho();
  const formasAtivas = (await listarFormasPagamento()).filter((f) => f.ativo);
  const categoriasRet = (await listarCategoriasRetirada()).filter((c) => c.ativo !== false);
  const protegido = navigator.storage && navigator.storage.persisted ? await navigator.storage.persisted() : false;
  let usado = '';
  if (navigator.storage && navigator.storage.estimate) {
    const { usage } = await navigator.storage.estimate();
    usado = (usage / 1024 / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' MB';
  }

  el.innerHTML = `
    <a class="voltar" href="#/mais">${icones.voltar} Mais</a>
    <header class="cab"><h1>Configurações</h1></header>

    <section class="cartao" id="cartao-aparelho">
      <h2>Este aparelho</h2>
      <p class="sub">Identifica qual tablet fez cada venda. A sigla aparece no número da venda (ex.: VAIO-0042) e deve ser diferente em cada aparelho.</p>
      <form id="form-aparelho" class="grade-campos duas" style="margin-top:16px" novalidate>
        <div class="campo"><label for="ap-nome">Nome</label>
          <input class="entrada" id="ap-nome" maxlength="40" autocomplete="off" placeholder="Ex.: Vaio TL10" value="${aparelho ? escapar(aparelho.nome) : ''}"></div>
        <div class="campo"><label for="ap-sigla">Sigla (2 a 6 letras ou números)</label>
          <input class="entrada" id="ap-sigla" maxlength="6" autocomplete="off" autocapitalize="characters" placeholder="Ex.: VAIO" value="${aparelho ? escapar(aparelho.sigla) : ''}" style="text-transform:uppercase"></div>
        <div style="grid-column:1/-1;display:flex;justify-content:flex-end"><button type="submit" class="btn primario">Salvar aparelho</button></div>
      </form>
    </section>

    <ul class="lista lista-links" style="margin-top:16px">
      <li><a href="#/configuracoes/formas">
        <span><strong>Formas de pagamento e taxas</strong><br><span class="sub">${formasAtivas.map((f) => escapar(f.nome)).join(', ')}</span></span>
        <span class="seta" aria-hidden="true">›</span></a></li>
      <li><a href="#/configuracoes/retiradas">
        <span><strong>Categorias de retirada</strong><br><span class="sub">${categoriasRet.map((c) => escapar(c.nome)).join(', ')}</span></span>
        <span class="seta" aria-hidden="true">›</span></a></li>
    </ul>


    <section class="cartao">
      <h2>Modo deste aparelho: Gestão</h2>
      <p class="sub">No modo <strong>Caixa</strong>, o aparelho mostra só Vender, Vendas e Caixa, para a equipe de venda. Para voltar à Gestão, ${pinDefinido ? 'é preciso o PIN' : 'defina um PIN antes, ou qualquer pessoa poderá voltar'}.</p>
      <div class="acoes" style="justify-content:flex-start"><button type="button" class="btn" id="modo-caixa">Mudar para modo Caixa</button></div>
    </section>

    <section class="cartao">
      <h2>Tema</h2>
      <p class="sub">Automático segue o modo escuro do aparelho. Em tela LCD, o escuro não economiza bateria; em tela AMOLED, economiza.</p>
      <div class="segmentos" role="radiogroup" aria-label="Tema" style="margin-top:16px">
        ${[['auto', 'Automático'], ['claro', 'Claro'], ['escuro', 'Escuro']].map(([v, t]) => `
          <label><input type="radio" name="tema" value="${v}" ${tema === v ? 'checked' : ''}><span>${t}</span></label>`).join('')}
      </div>
    </section>

    <section class="cartao">
      <label class="interruptor">
        <span><strong>Sons do app</strong><br><span class="sub">Bipe ao adicionar item, ao concluir a venda e em código não encontrado. O leitor Bluetooth tem os próprios sons.</span></span>
        <input type="checkbox" id="sons" ${sonsLigados() ? 'checked' : ''}>
      </label>
    </section>

    <section class="cartao">
      <h2>PIN</h2>
      <p class="sub">Protege custo, lucro e o painel de vendas. Use de 4 a 6 números e anote em lugar seguro: o PIN não pode ser recuperado.</p>
      <dl style="margin-top:8px"><div class="par"><dt>Situação</dt><dd>${pinDefinido ? 'Definido' : 'Não definido'}</dd></div></dl>
      <form id="form-pin" class="grade-campos" style="margin-top:12px" novalidate>
        ${pinDefinido ? `
        <div class="campo"><label for="pin-atual">PIN atual</label>
          <input class="entrada entrada-pin" id="pin-atual" type="password" inputmode="numeric" maxlength="6" autocomplete="off"></div>` : ''}
        <div class="grade-campos duas">
          <div class="campo"><label for="pin-novo">${pinDefinido ? 'Novo PIN' : 'PIN'}</label>
            <input class="entrada entrada-pin" id="pin-novo" type="password" inputmode="numeric" maxlength="6" autocomplete="off"></div>
          <div class="campo"><label for="pin-confirma">Repita o PIN</label>
            <input class="entrada entrada-pin" id="pin-confirma" type="password" inputmode="numeric" maxlength="6" autocomplete="off"></div>
        </div>
        <div class="acoes" style="display:flex;gap:8px;flex-wrap:wrap">
          <button type="submit" class="btn primario">${pinDefinido ? 'Trocar PIN' : 'Definir PIN'}</button>
          ${pinDefinido ? '<button type="button" class="btn texto perigo" id="remover-pin">Remover PIN</button>' : ''}
        </div>
      </form>
    </section>

    <section class="cartao">
      <h2>Armazenamento</h2>
      <dl>
        <div class="par"><dt>Dados protegidos contra limpeza automática</dt><dd>${protegido ? 'Sim' : 'Não'}</dd></div>
        ${usado ? `<div class="par"><dt>Espaço usado pelo app</dt><dd class="num">${usado}</dd></div>` : ''}
      </dl>
      ${protegido ? '' : '<p class="sub" style="margin-top:8px">Instale o app na tela inicial para o navegador proteger os dados. Mesmo assim, faça backup ao fim de cada evento.</p>'}
    </section>

    <section class="cartao">
      <h2>Sobre</h2>
      <dl><div class="par"><dt>Versão do app</dt><dd class="num">${VERSAO}</dd></div></dl>
      <div class="acoes" style="margin-top:12px"><button type="button" class="btn" id="procurar-atualizacao">Procurar atualização</button></div>
      <p class="sub" id="status-atualizacao" style="margin-top:8px" hidden></p>
    </section>`;

  // ---------- Atualização ----------
  el.querySelector('#procurar-atualizacao').addEventListener('click', async (e) => {
    const botao = e.currentTarget;
    const status = el.querySelector('#status-atualizacao');
    botao.disabled = true;
    status.hidden = false;
    status.textContent = 'Procurando...';
    try {
      const r = await procurar();
      status.textContent = r === 'nova' ? 'Versão nova encontrada. Em instantes aparece no topo o botão Atualizar agora.'
        : r === 'sem-internet' ? 'Sem internet. Conecte e tente de novo.'
        : 'O app já está na versão mais recente publicada.';
    } catch (erro) {
      status.textContent = 'Não foi possível procurar agora. Tente de novo em instantes.';
    } finally {
      botao.disabled = false;
    }
  });

  // ---------- Este aparelho ----------
  el.querySelector('#modo-caixa').addEventListener('click', async () => {
    const ok = await confirmar({ titulo: 'Mudar para modo Caixa?', texto: `O aparelho passa a mostrar só Vender, Vendas e Caixa. Os dados não mudam. ${pinDefinido ? 'Para voltar, use Mais → Entrar no modo Gestão, com o PIN.' : 'Sem PIN, qualquer pessoa consegue voltar para a Gestão.'}`, botao: 'Mudar para Caixa' });
    if (!ok) return;
    await definirModo('caixa');
    aviso('Modo Caixa.');
    location.hash = '#/vender';
  });

  el.querySelector('#form-aparelho').addEventListener('submit', async (e) => {
    e.preventDefault();
    const nome = el.querySelector('#ap-nome').value.trim();
    const sigla = el.querySelector('#ap-sigla').value.trim().toUpperCase();
    el.querySelectorAll('#form-aparelho .msg-erro').forEach((m) => m.remove());
    const marcar = (input, texto) => { const m = document.createElement('span'); m.className = 'msg-erro'; m.textContent = texto; input.closest('.campo').append(m); input.focus(); };
    if (!nome) return marcar(el.querySelector('#ap-nome'), 'Informe um nome para o aparelho.');
    if (!/^[A-Z0-9]{2,6}$/.test(sigla)) return marcar(el.querySelector('#ap-sigla'), 'Use de 2 a 6 letras ou números, sem espaço.');
    await gravarAparelho({ nome, sigla });
    aviso('Aparelho salvo.');
    render(el);
  });

  const formPin = el.querySelector('#form-pin');
  const campo = (id) => el.querySelector('#' + id);
  function erro(input, texto) {
    formPin.querySelectorAll('.msg-erro').forEach((m) => m.remove());
    formPin.querySelectorAll('[aria-invalid]').forEach((i) => i.removeAttribute('aria-invalid'));
    input.setAttribute('aria-invalid', 'true');
    const m = document.createElement('span');
    m.className = 'msg-erro'; m.textContent = texto;
    input.closest('.campo').append(m);
    input.focus();
  }
  formPin.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (pinDefinido && !(await conferirPin(campo('pin-atual').value))) return erro(campo('pin-atual'), 'PIN atual incorreto.');
    const novo = campo('pin-novo').value;
    if (!pinValido(novo)) return erro(campo('pin-novo'), 'Use de 4 a 6 números.');
    if (novo !== campo('pin-confirma').value) return erro(campo('pin-confirma'), 'Os dois PINs não são iguais.');
    await definirPin(novo);
    aviso(pinDefinido ? 'PIN trocado.' : 'PIN definido.');
    render(el);
  });
  const botaoRemover = el.querySelector('#remover-pin');
  if (botaoRemover) botaoRemover.addEventListener('click', async () => {
    if (!(await conferirPin(campo('pin-atual').value))) return erro(campo('pin-atual'), 'Digite o PIN atual para remover.');
    const ok = await confirmar({ titulo: 'Remover o PIN?', texto: 'Custo, lucro e painel de vendas ficarão visíveis para qualquer pessoa.', botao: 'Remover', perigo: true });
    if (!ok) return;
    await removerPin();
    aviso('PIN removido.');
    render(el);
  });

  el.querySelector('#sons').addEventListener('change', (e) => ligarSons(e.target.checked));
  el.querySelectorAll('input[name="tema"]').forEach((r) => r.addEventListener('change', () => escolherTema(r.value)));
}

function escapar(t) { return String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
