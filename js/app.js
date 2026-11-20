// Partida do app e navegação.
// Rotas (no #): /inicio /buscar /lista /diario /perfil são abas;
// /filme/ID /serie/ID /pessoa/ID (e /reviews/filme-ID, /ranking/pessoa-ID, /editar/favoritos, /editar/lista-ID, /frame/hoje) abrem por cima,
// na "ficha". O botão voltar do celular funciona.
import { carregarChaves } from './config.js';
import { $, $$, esc, esqueletoFicha, erroFicha, toast } from './ui.js';
import * as inicio from './telas/inicio.js';
import * as buscar from './telas/buscar.js';
import * as lista from './telas/lista.js';
import * as diario from './telas/diario.js';
import * as perfil from './telas/perfil.js';
import * as filme from './telas/filme.js';
import * as serie from './telas/serie.js';
import * as pessoa from './telas/pessoa.js';
import * as importar from './telas/importar.js';
import * as calendario from './telas/calendario.js';
import * as reviews from './telas/reviews.js';
import * as ranking from './telas/ranking.js';
import * as editar from './telas/editar.js';
import * as frame from './telas/frame.js';
import * as estrelas from './telas/estrelas.js';
import * as dados from './dados.js';
import * as social from './social.js';
import { simboloEscondido, esconderijoDeHoje } from './ovo.js';
import * as nuvem from './nuvem.js';

const ABAS = { inicio, buscar, lista, diario, perfil };
const NOMES = { inicio: 'Início', buscar: 'Buscar', lista: 'Quero ver', diario: 'Diário', perfil: 'Perfil' };
const FICHAS = { filme, serie, pessoa, importar, calendario, reviews, ranking, editar, frame, estrelas };

const view = $('#view');
const sheet = $('#sheet');
let abaNaTela = null;       // aba desenhada em #view
let onde = null;            // { tipo: 'aba' | 'ficha', hash }
let topo = 0;               // quantas telas o app já empilhou no histórico (para o botão voltar)
let vez = 0;                // invalida desenhos de fichas que ficaram para trás
const pilha = [];           // fichas abertas em sequência
const rolagem = new Map();  // hash -> posição da rolagem

function rota() {
  const [, nome = 'inicio', id] = (location.hash || '#/inicio').split('/');
  return { nome, id };
}

/* ---------- tela de entrada: sem login o app não abre (só o computador de teste tem a opção de seguir sem conta) ---------- */
const entrada = $('#entrada');
const COMPUTADOR_DE_TESTE = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
const voltandoDoGoogle = new URLSearchParams(location.search).has('code');
let semConta = false;
try { semConta = COMPUTADOR_DE_TESTE && sessionStorage.getItem('sessao:sem-conta') === '1'; } catch { /* sem armazenamento */ }
/** Este aparelho tem um login guardado? Dá para saber na hora, antes de falar com o servidor. */
const temLoginGuardado = () => { try { return Object.keys(localStorage).some((k) => /^sb-.+-auth-token$/.test(k)); } catch { return false; } };
// Com login guardado o app abre, mesmo que a sessão ainda não tenha sido conferida (internet lenta ou sem
// internet): mostra o que está no aparelho e o que for marcado fica na fila. Ao sair, ou quando o servidor
// recusa o login guardado, ele é apagado do aparelho e a tela de entrada aparece.
const precisaEntrar = () => !(nuvem.usuario() || semConta || temLoginGuardado());
let ligando = null; // a conferência do login guardado, para o botão esperar por ela
/** Mostra ou esconde a tela de entrada conforme o login. Devolve true quando o app está aberto. */
function porteiro() {
  if (!precisaEntrar()) {
    if (!entrada.hidden) { entrada.hidden = true; entrada.innerHTML = ''; document.body.classList.remove('fechado'); }
    return true;
  }
  const erro = nuvem.erroDeLogin();
  const entrando = voltandoDoGoogle && !nuvem.iniciou();
  entrada.innerHTML = `<div class="entrada-c">
    <img src="icones/icon-192.png" alt="" width="84" height="84">
    <h1>Sessão</h1>
    <p class="lema">O diário de filmes e séries de vocês dois.</p>
    ${erro ? `<p class="erro" role="alert">${esc(erro)} Tente com a outra conta Google.</p>` : ''}
    <button class="btn on-seen" data-entrada="google" ${entrando ? 'disabled' : ''}>${entrando ? 'Entrando…' : 'Entrar com o Google'}</button>
    <p class="note">Só as contas Google cadastradas entram. O app não pede nem guarda senha.</p>
    ${COMPUTADOR_DE_TESTE ? '<button class="texto" data-entrada="sem-conta">Continuar sem conta (só neste computador de teste)</button>' : ''}
  </div>`;
  if (entrada.hidden) {
    entrada.hidden = false;
    document.body.classList.add('fechado');
    document.body.style.overflow = '';
    window.scrollTo(0, 0);
  }
  return false;
}
entrada.onclick = async (e) => {
  const b = e.target.closest('button[data-entrada]');
  if (!b) return;
  if (b.dataset.entrada === 'sem-conta') {
    semConta = true;
    try { sessionStorage.setItem('sessao:sem-conta', '1'); } catch { /* vale só nesta visita */ }
    if (porteiro()) navegar();
    return;
  }
  b.disabled = true;
  b.textContent = 'Abrindo o Google…';
  try { sessionStorage.setItem('sessao:ir', location.hash); } catch { /* depois do login abre no Início */ }
  try {
    await ligando;
    if (!nuvem.disponivel()) { ligando = nuvem.iniciar(); await ligando; } // a primeira tentativa ficou sem internet: tenta de novo
    await nuvem.entrar();
  } catch { b.disabled = false; b.textContent = 'Entrar com o Google'; toast('Não deu para abrir o login. Confira a internet.'); }
};

async function navegar() {
  if (!entrada.hidden) return; // a tela de entrada está na frente; ao entrar, o app abre na rota pedida
  const r = rota();
  const hash = location.hash || '#/inicio';
  if (onde) rolagem.set(onde.hash, onde.tipo === 'ficha' ? sheet.scrollTop : window.scrollY);
  const minhaVez = ++vez;

  if (FICHAS[r.nome] && r.id) {
    const voltando = pilha[pilha.length - 2] === hash;
    if (voltando) pilha.pop();
    else if (pilha[pilha.length - 1] !== hash) pilha.push(hash);
    onde = { tipo: 'ficha', hash };
    sheet.hidden = false;
    document.body.style.overflow = 'hidden';
    sheet.onclick = null;
    sheet.onchange = null;
    sheet.oninput = null;
    sheet.onpointerup = null;
    sheet.ontouchend = null;
    sheet.onpointerdown = null;
    sheet.onkeydown = null;
    sheet.innerHTML = esqueletoFicha();
    sheet.scrollTop = 0;
    const ctx = { vivo: () => minhaVez === vez };
    try {
      await FICHAS[r.nome].abrir(sheet, r.id, ctx);
    } catch (erro) {
      console.error(erro);
      if (ctx.vivo()) sheet.innerHTML = erroFicha(erro);
    }
    if (ctx.vivo() && voltando) sheet.scrollTop = rolagem.get(hash) || 0;
    return;
  }

  const nome = ABAS[r.nome] ? r.nome : 'inicio';
  pilha.length = 0;
  sheet.hidden = true;
  sheet.innerHTML = '';
  document.body.style.overflow = '';
  const vindoDeFicha = onde?.tipo === 'ficha';
  onde = { tipo: 'aba', hash: `#/${nome}` };
  $$('.tabs a').forEach((a) => (a.dataset.tab === nome ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
  montarTitulo();
  $('#titulo-texto').textContent = NOMES[nome];
  view.dataset.aba = nome; // as abas conferem isto depois de esperar a internet, para não desenhar por cima de outra
  if (abaNaTela === nome && ABAS[nome].manter) {
    ABAS[nome].atualizar?.(view); // volta para a mesma aba: mantém o que estava, só atualiza o que mudou
  } else {
    abaNaTela = nome;
    view.onclick = null;
    view.oninput = null;
    view.onkeydown = null;
    view.onchange = null;
    ABAS[nome].render(view);
  }
  voltarPara(vindoDeFicha ? rolagem.get(onde.hash) || 0 : 0);
}

// Volta a tela para o ponto em que a pessoa estava. As abas que buscam na conta (Diário, Quero ver, Perfil)
// ainda estão vazias nesse instante, então tenta de novo por uns segundos, até o conteúdo chegar.
// Para assim que a pessoa mexe na tela.
let esperaRolagem = 0;
function voltarPara(y) {
  clearInterval(esperaRolagem);
  window.scrollTo(0, y);
  if (!y || window.scrollY >= y - 2) return;
  const minhaVez = vez;
  let tentativas = 0;
  const parar = () => { clearInterval(esperaRolagem); window.removeEventListener('touchstart', parar); window.removeEventListener('wheel', parar); window.removeEventListener('keydown', parar); };
  for (const evento of ['touchstart', 'wheel', 'keydown']) window.addEventListener(evento, parar, { passive: true });
  esperaRolagem = setInterval(() => {
    if (minhaVez !== vez || ++tentativas > 40) { parar(); return; }
    window.scrollTo(0, y);
    if (window.scrollY >= y - 2) parar();
  }, 100);
}

// ações comuns a todas as fichas
sheet.addEventListener('click', (e) => {
  const b = e.target.closest('[data-acao]');
  if (!b) return;
  if (b.dataset.acao === 'voltar') {
    if ((history.state?.sessaoI ?? 0) > 0) history.back();
    else location.hash = '#/inicio';
  } else if (b.dataset.acao === 'recarregar') {
    navegar();
  } else if (b.dataset.acao === 'abrir-texto') {
    b.previousElementSibling?.classList.remove('clamp');
    b.remove();
  }
});
// tocar na aba que já está aberta sobe a tela
$('.tabs').addEventListener('click', (e) => {
  const a = e.target.closest('a');
  if (a && a.getAttribute('href') === location.hash && sheet.hidden) window.scrollTo({ top: 0, behavior: 'smooth' });
});

// o título grande do topo muda com a aba; se hoje a simboloEscondido do easter egg estiver escondida no topo, ela fica ao lado dele
let lugarNoTitulo = null;
function montarTitulo() {
  const lugar = esconderijoDeHoje();
  if (lugar === lugarNoTitulo) return; // só refaz quando o dia vira e o esconderijo muda
  lugarNoTitulo = lugar;
  const texto = $('#titulo-texto')?.textContent || 'Início';
  $('#titulo').innerHTML = `<span id="titulo-texto"></span>${simboloEscondido('logo')}`;
  $('#titulo-texto').textContent = texto;
}
montarTitulo();

// Cada tela nova ganha um número no histórico. Assim o "voltar" sabe se há uma tela do app atrás
// (número maior que zero) ou se o app foi aberto direto aqui, e nesse caso vai para o Início.
function anotarPosicao(inicial = false) {
  const i = history.state?.sessaoI;
  if (i == null) history.replaceState({ ...(history.state || {}), sessaoI: inicial ? 0 : ++topo }, '');
  else topo = Math.max(topo, i);
}
window.addEventListener('hashchange', () => { anotarPosicao(); navegar(); });

// quem está logado aparece no topo; ao entrar ou sair, a tela atual é refeita
function mostrarLogin() {
  const u = nuvem.usuario();
  const chip = $('#chip');
  chip.textContent = u ? u.nome.trim()[0].toUpperCase() : 'Entrar';
  if (u?.foto) {
    const foto = new Image();
    foto.alt = '';
    foto.referrerPolicy = 'no-referrer';
    foto.onload = () => { if (nuvem.usuario()?.foto === u.foto) chip.replaceChildren(foto); };
    foto.src = u.foto;
  }
  chip.classList.toggle('on', Boolean(u));
  chip.setAttribute('aria-label', u ? `Perfil de ${u.nome}` : 'Entrar');
}
let quemEra = null;
let pronto = false; // vira true depois da primeira tela
nuvem.aoMudar(() => {
  mostrarLogin();
  const quemE = nuvem.usuario()?.id || null;
  const trocou = quemE !== quemEra;
  quemEra = quemE;
  if (!porteiro()) return;
  if (!onde) { if (pronto) navegar(); return; } // acabou de entrar pela tela de entrada: abre o app
  // refaz a tela aberta se alguém entrou ou saiu; o Perfil sempre, porque mostra o estado do login
  if (onde?.tipo === 'aba' && (trocou || abaNaTela === 'perfil')) { abaNaTela = null; navegar(); }
  else if (onde?.tipo === 'ficha' && trocou && pronto) navegar();
});

// quando os dados da conta chegam (login ou import), a aba aberta é refeita
let esperaRefazer = 0;
const refazerAba = () => { // junta os avisos que chegam em sequência (login, sincronização, dados do outro)
  clearTimeout(esperaRefazer);
  esperaRefazer = setTimeout(() => {
    // quem está digitando (busca, review) não perde o que escreveu: a tela se atualiza na próxima visita
    if (document.activeElement?.matches?.('input:not([type="range"]), textarea')) return;
    if (onde?.tipo === 'aba') { abaNaTela = null; navegar(); }
    // numa ficha, só refaz se a pessoa ainda está no topo (para não tirar a tela do lugar no meio da leitura)
    else if (onde?.tipo === 'ficha' && sheet.scrollTop < 60) navegar();
  }, 120);
};
dados.aoSincronizar(() => { social.carregar(); refazerAba(); });
social.aoCarregar(refazerAba);

await carregarChaves();
// espera um instante pelo login guardado, para a primeira tela já abrir com os dados da conta;
// se a internet estiver lenta, abre sem esperar e completa depois
ligando = nuvem.iniciar();
porteiro(); // quem nunca entrou neste aparelho vê a tela de entrada na hora, sem esperar o servidor
await Promise.race([ligando, new Promise((r) => setTimeout(r, 1500))]);
pronto = true;
anotarPosicao(true);
// quem tocou em "Entrar" numa tela específica volta para ela depois do Google
try {
  const ir = sessionStorage.getItem('sessao:ir');
  sessionStorage.removeItem('sessao:ir');
  if (voltandoDoGoogle && ir?.startsWith('#/') && !location.hash) history.replaceState(history.state, '', location.pathname + location.search + ir);
} catch { /* abre no Início */ }
if (porteiro()) navegar();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => { /* sem service worker o app funciona, só não abre offline */ });
  // tocou num aviso com o app já aberto: o service worker manda para onde ir
  navigator.serviceWorker.addEventListener('message', (e) => { if (typeof e.data?.ir === 'string' && e.data.ir.startsWith('#/')) location.hash = e.data.ir; });
}
