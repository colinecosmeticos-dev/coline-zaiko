// =========================================================
// Google Drive: enviar e receber o pacote (catálogo) e as vendas com um toque.
//
// Permissão usada: "drive.file" — o app só enxerga os arquivos que ELE
// MESMO criou no Drive. Não vê, não baixa e não sincroniza mais nada
// da conta. Os arquivos ficam numa pasta "Coline Zaiko".
//
// O login é feito pelo próprio Google (janela do Google). O app não
// guarda senha nenhuma; recebe só uma autorização que vale cerca de 1 hora.
// =========================================================

// ID do cliente OAuth criado no Google Cloud (é público por natureza: não é senha).
// Enquanto estiver vazio, a seção do Drive mostra "ainda não configurado".
export const CLIENT_ID = '561803433802-l9v9c7atmu8rfsb9o1tol48epoms2uqp.apps.googleusercontent.com';

const ESCOPO = 'https://www.googleapis.com/auth/drive.file';
const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const NOME_PASTA = 'Coline Zaiko';

let clienteToken = null;
let token = null;
let expiraEm = 0;
let carregando = null;

export const driveConfigurado = () => !!CLIENT_ID;

// Carrega a biblioteca de login do Google (só quando a tela precisa)
export function prepararDrive() {
  if (!CLIENT_ID) return Promise.reject(new Error('Drive não configurado.'));
  if (carregando) return carregando;
  carregando = new Promise((resolver, rejeitar) => {
    if (window.google?.accounts?.oauth2) return resolver();
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => resolver();
    s.onerror = () => { carregando = null; rejeitar(new Error('Sem conexão com o Google. Confira a internet.')); };
    document.head.append(s);
  }).then(() => {
    clienteToken = google.accounts.oauth2.initTokenClient({ client_id: CLIENT_ID, scope: ESCOPO, callback: () => {} });
  });
  return carregando;
}

// Pede a autorização ao Google. Precisa ser chamado direto do toque no botão
// (senão o navegador bloqueia a janela do Google).
export function autorizar() {
  if (token && Date.now() < expiraEm - 60000) return Promise.resolve(token);
  return new Promise((resolver, rejeitar) => {
    if (!clienteToken) return rejeitar(new Error('O Google ainda está carregando. Tente de novo em instantes.'));
    clienteToken.callback = (r) => {
      if (r.error) return rejeitar(new Error('O Google não autorizou o acesso ao Drive.'));
      token = r.access_token;
      expiraEm = Date.now() + (Number(r.expires_in) || 3600) * 1000;
      resolver(token);
    };
    clienteToken.error_callback = (e) => rejeitar(new Error(e && e.type === 'popup_closed' ? 'Janela do Google fechada antes de concluir.' : 'Não foi possível abrir o login do Google.'));
    clienteToken.requestAccessToken({ prompt: '' });
  });
}

async function chamar(url, opcoes = {}) {
  const resposta = await fetch(url, { ...opcoes, headers: { ...(opcoes.headers || {}), Authorization: `Bearer ${token}` } });
  if (resposta.status === 401) { token = null; throw new Error('A autorização do Google expirou. Toque de novo.'); }
  if (!resposta.ok) throw new Error(`O Drive respondeu com erro (${resposta.status}).`);
  return resposta;
}

const consulta = (q, campos, extra = '') =>
  chamar(`${API}/files?q=${encodeURIComponent(q)}&fields=${encodeURIComponent(`files(${campos})`)}&spaces=drive${extra}`).then((r) => r.json()).then((j) => j.files || []);

async function pastaDoApp() {
  const achadas = await consulta(`appProperties has { key='zaiko' and value='pasta' } and trashed = false`, 'id');
  if (achadas.length) return achadas[0].id;
  const r = await chamar(`${API}/files?fields=id`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: NOME_PASTA, mimeType: 'application/vnd.google-apps.folder', appProperties: { zaiko: 'pasta' } })
  });
  return (await r.json()).id;
}

const pacotesNoDrive = () => consulta(
  `appProperties has { key='zaiko' and value='pacote' } and trashed = false`,
  'id,name,createdTime,size,appProperties', '&orderBy=createdTime desc');

// ---------- Enviar ----------
// Envia o pacote e apaga os pacotes antigos, para o Drive não acumular arquivos.
// Devolve quantos antigos foram apagados.
export async function enviarPacote(arquivo, aparelho) {
  await autorizar();
  const pasta = await pastaDoApp();
  const metadados = {
    name: arquivo.name, parents: [pasta], mimeType: 'text/plain',
    appProperties: { zaiko: 'pacote', aparelho: aparelho ? aparelho.sigla : '', nomeAparelho: aparelho ? aparelho.nome : '' }
  };
  const corpo = new FormData();
  corpo.append('metadata', new Blob([JSON.stringify(metadados)], { type: 'application/json' }));
  corpo.append('file', arquivo);
  const novo = await (await chamar(`${UPLOAD}/files?uploadType=multipart&fields=id`, { method: 'POST', body: corpo })).json();

  const antigos = (await pacotesNoDrive()).filter((f) => f.id !== novo.id);
  await Promise.all(antigos.map((f) => chamar(`${API}/files/${f.id}`, { method: 'DELETE' }).catch(() => null)));
  return antigos.length;
}

// ---------- Receber ----------
// Procura o pacote mais recente. Devolve null se não houver nenhum.
export async function ultimoPacote() {
  await autorizar();
  const [f] = await pacotesNoDrive();
  if (!f) return null;
  return { id: f.id, nome: f.name, criadoEm: f.createdTime, aparelho: f.appProperties?.nomeAparelho || f.appProperties?.aparelho || '' };
}
// ---------- Vendas de cada aparelho ----------
// Um arquivo por aparelho e por evento: cada envio substitui o anterior daquele aparelho.
export async function enviarVendas(arquivo, { aparelho, eventoId, nomeEvento }) {
  await autorizar();
  const pasta = await pastaDoApp();
  const metadados = {
    name: arquivo.name, parents: [pasta], mimeType: 'text/plain',
    appProperties: { zaiko: 'vendas', aparelho: aparelho.sigla, nomeAparelho: aparelho.nome, evento: eventoId, nomeEvento: (nomeEvento || '').slice(0, 60) }
  };
  const corpo = new FormData();
  corpo.append('metadata', new Blob([JSON.stringify(metadados)], { type: 'application/json' }));
  corpo.append('file', arquivo);
  const novo = await (await chamar(`${UPLOAD}/files?uploadType=multipart&fields=id`, { method: 'POST', body: corpo })).json();
  const antigos = (await arquivosDeVendas(eventoId)).filter((f) => f.id !== novo.id && f.appProperties?.aparelho === aparelho.sigla);
  await Promise.all(antigos.map((f) => chamar(`${API}/files/${f.id}`, { method: 'DELETE' }).catch(() => null)));
}
const arquivosDeVendas = (eventoId) => consulta(
  `appProperties has { key='zaiko' and value='vendas' } and appProperties has { key='evento' and value='${eventoId.replace(/'/g, '')}' } and trashed = false`,
  'id,name,createdTime,appProperties', '&orderBy=createdTime desc');
// Lista os arquivos de vendas do evento (um por aparelho, o mais recente de cada)
export async function listarVendasNoDrive(eventoId) {
  await autorizar();
  const vistos = new Set();
  return (await arquivosDeVendas(eventoId))
    .filter((f) => { const k = f.appProperties?.aparelho; if (vistos.has(k)) return false; vistos.add(k); return true; })
    .map((f) => ({ id: f.id, nome: f.name, criadoEm: f.createdTime, sigla: f.appProperties?.aparelho || '', aparelho: f.appProperties?.nomeAparelho || '' }));
}

// ---------- Planilha do fechamento ----------
// Envia o .xlsx e o próprio Google converte em Google Planilhas.
// Fica uma planilha por evento: a nova substitui a anterior. Devolve o link para abrir.
export async function enviarPlanilha(arquivo, { eventoId, titulo }) {
  await autorizar();
  const pasta = await pastaDoApp();
  const metadados = {
    name: titulo, parents: [pasta], mimeType: 'application/vnd.google-apps.spreadsheet',
    appProperties: { zaiko: 'planilha', evento: eventoId }
  };
  const corpo = new FormData();
  corpo.append('metadata', new Blob([JSON.stringify(metadados)], { type: 'application/json' }));
  corpo.append('file', arquivo);
  const novo = await (await chamar(`${UPLOAD}/files?uploadType=multipart&fields=id,webViewLink`, { method: 'POST', body: corpo })).json();
  const antigas = (await consulta(
    `appProperties has { key='zaiko' and value='planilha' } and appProperties has { key='evento' and value='${eventoId.replace(/'/g, '')}' } and trashed = false`, 'id'))
    .filter((f) => f.id !== novo.id);
  await Promise.all(antigas.map((f) => chamar(`${API}/files/${f.id}`, { method: 'DELETE' }).catch(() => null)));
  return novo.webViewLink || `https://docs.google.com/spreadsheets/d/${novo.id}/edit`;
}

// ---------- Backup ----------
// Guarda as 3 cópias mais recentes de cada aparelho; as mais antigas são apagadas.
const BACKUPS_POR_APARELHO = 3;
const backupsNoDrive = () => consulta(`appProperties has { key='zaiko' and value='backup' } and trashed = false`,
  'id,name,createdTime,size,appProperties', '&orderBy=createdTime desc');
export async function enviarBackup(arquivo, aparelho) {
  await autorizar();
  const pasta = await pastaDoApp();
  const sigla = aparelho ? aparelho.sigla : '?';
  const metadados = { name: arquivo.name, parents: [pasta], mimeType: 'text/plain', appProperties: { zaiko: 'backup', aparelho: sigla, nomeAparelho: aparelho ? aparelho.nome : '' } };
  const corpo = new FormData();
  corpo.append('metadata', new Blob([JSON.stringify(metadados)], { type: 'application/json' }));
  corpo.append('file', arquivo);
  await chamar(`${UPLOAD}/files?uploadType=multipart&fields=id`, { method: 'POST', body: corpo });
  const destes = (await backupsNoDrive()).filter((f) => f.appProperties?.aparelho === sigla);
  await Promise.all(destes.slice(BACKUPS_POR_APARELHO).map((f) => chamar(`${API}/files/${f.id}`, { method: 'DELETE' }).catch(() => null)));
}
export async function listarBackups() {
  await autorizar();
  return (await backupsNoDrive()).map((f) => ({ id: f.id, nome: f.name, criadoEm: f.createdTime, tamanho: Number(f.size) || 0, sigla: f.appProperties?.aparelho || '', aparelho: f.appProperties?.nomeAparelho || '' }));
}

export async function baixarPacote(info) {
  await autorizar();
  const texto = await (await chamar(`${API}/files/${info.id}?alt=media`)).text();
  return new File([texto], info.nome, { type: 'text/plain' });
}
export const baixarArquivo = baixarPacote;
