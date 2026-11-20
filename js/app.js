// Partida do app e navegação.
// Rotas (no #): /inicio /buscar /lista /diario /perfil são abas;
// /filme/ID /serie/ID /pessoa/ID abrem por cima, na "ficha". O botão voltar do celular funciona.
import { carregarChaves } from './config.js';
import { $, $$, esqueletoFicha, erroFicha } from './ui.js';
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
import * as dados from './dados.js';
import * as social from './social.js';
import { carinha } from './ovo.js';
import * as nuvem from './nuvem.js';

const ABAS = { inicio, buscar, lista, diario, perfil };
const NOMES = { inicio: 'Início', buscar: 'Buscar', lista: 'Quero ver', diario: 'Diário', perfil: 'Perfil' };
const FICHAS = { filme, serie, pessoa, importar, calendario };

const view = $('#view');
const sheet = $('#sheet');
let abaNaTela = null;       // aba desenhada em #view
let onde = null;            // { tipo: 'aba' | 'ficha', hash }
let passos = 0;             // navegações feitas dentro do app (para o botão voltar)
let vez = 0;                // invalida desenhos de fichas que ficaram para trás
const pilha = [];           // fichas abertas em sequência
const rolagem = new Map();  // hash -> posição da rolagem

function rota() {
  const [, nome = 'inicio', id] = (location.hash || '#/inicio').split('/');
  return { nome, id };
}

async function navegar() {
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
  $('#titulo-texto').textContent = NOMES[nome];
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
  window.scrollTo(0, vindoDeFicha ? rolagem.get(onde.hash) || 0 : 0);
}

// ações comuns a todas as fichas
sheet.addEventListener('click', (e) => {
  const b = e.target.closest('[data-acao]');
  if (!b) return;
  if (b.dataset.acao === 'voltar') {
    if (passos > 0) history.back();
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

// o título grande do topo muda com a aba; se hoje a carinha do easter egg estiver escondida no topo, ela fica ao lado dele
$('#titulo').innerHTML = `<span id="titulo-texto">Início</span>${carinha('logo')}`;

window.addEventListener('hashchange', () => { passos++; navegar(); });

// quem está logado aparece no topo; ao entrar ou sair, a tela atual é refeita
function mostrarLogin() {
  const u = nuvem.usuario();
  const chip = $('#chip');
  chip.textContent = u ? u.nome.trim()[0].toUpperCase() : 'Entrar';
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
  // refaz a tela aberta se alguém entrou ou saiu; o Perfil sempre, porque mostra o estado do login
  if (onde?.tipo === 'aba' && (trocou || abaNaTela === 'perfil')) { abaNaTela = null; navegar(); }
  else if (onde?.tipo === 'ficha' && trocou && pronto) navegar();
});

// quando os dados da conta chegam (login ou import), a aba aberta é refeita
let esperaRefazer = 0;
const refazerAba = () => { // junta os avisos que chegam em sequência (login, sincronização, dados do outro)
  clearTimeout(esperaRefazer);
  esperaRefazer = setTimeout(() => {
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
await Promise.race([nuvem.iniciar(), new Promise((r) => setTimeout(r, 1500))]);
pronto = true;
navegar();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => { /* sem service worker o app funciona, só não abre offline */ });
  // tocou num aviso com o app já aberto: o service worker manda para onde ir
  navigator.serviceWorker.addEventListener('message', (e) => { if (typeof e.data?.ir === 'string' && e.data.ir.startsWith('#/')) location.hash = e.data.ir; });
}
