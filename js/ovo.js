// Easter egg: "caça ao símbolo".
// - Cada dia um símbolo de cinema (o app avisa qual é) fica escondido num lugar diferente do app.
// - Quem acha primeiro ganha o dia; o placar do mês fica guardado na conta.
// - Achar abre um pop-up com o Dafoe e o Cage do dia (uma cena grande de cada) e o caminho para o frame do dia.
// - Símbolo e esconderijo dependem só da data, então são os mesmos nos dois celulares.
import { img } from './tmdb.js';
import * as nuvem from './nuvem.js';
import { esc, hoje } from './ui.js';

const CAGE = { id: 2963, nome: 'Nicolas Cage', rosto: '/y1RtezurZYveYkVNRht7CwEgSYY.jpg' };
const DAFOE = { id: 5293, nome: 'Willem Dafoe', rosto: '/ui8e4sgZAwMPi3hzEO53jyBJF9B.jpg' };

// [imagem no TMDB, filme]: cenas escolhidas a dedo, das mais caricatas
const CENAS = {
  [CAGE.id]: [
    ['/rrmavNBz1aKSY11jbGGnj1Q5CTo.jpg', "Vampire's Kiss"], ['/88cDpJDbf3jky7VlyA24vFiAupm.jpg', 'The Wicker Man'],
    ['/1fldJZ43ftMj3gKbhf8idjI7fWO.jpg', 'Con Air'], ['/95cYzbSp13ChoUYlDwj1fPL4Q6X.jpg', 'Raising Arizona'],
    ['/1XA9KiP7NDWb6Dre3RGXBGc5e9o.jpg', 'Mandy'], ['/k4TpF7wl1FMPzHRJNudODAm7h0P.jpg', 'The Unbearable Weight of Massive Talent'],
    ['/6CBKRe9ossDiQ7UaSfvG4I07hK7.jpg', 'Renfield'], ['/fUmWfASEW1D4R2pvZPBpHNufAeL.jpg', "Vampire's Kiss"],
    ['/2WRe1y5S1jGWTKUcSPPmD1Ixq56.jpg', 'Dream Scenario'], ['/nj0TRnK46lY1Xyjynif5leQf3XS.jpg', 'Wild at Heart'],
    ['/yD3BbUMFkfVIW2BvPWdKDAqyY4g.jpg', "Willy's Wonderland"], ['/sdpxQx4AFfb9UxLtkuJUGF2UR5T.jpg', 'The Wicker Man'],
    ['/uFvueAhlKsXQacjiKxGBgnBqarf.jpg', 'Pig'], ['/ubVqplLMa6X51Y8yhRcbbnApXWe.jpg', "Vampire's Kiss"],
    ['/xLyQQTfbiC4iPam3jUOyLprg24x.jpg', 'The Unbearable Weight of Massive Talent'], ['/4oLlnVSOUNiOS4DIMMUai2TGQUg.jpg', 'Raising Arizona'],
    ['/8njrrfYfrei0IDw9Tm8PgXquk7Z.jpg', 'Renfield'], ['/vlbTPrt664RAIeMYtgnqCYQPfgR.jpg', 'Dream Scenario'],
    ['/xjjUSZnZugtGgVNtLEF92D0I9dI.jpg', "Vampire's Kiss"], ['/6xJ2odkMFmO2LptVUBR8t8wBldQ.jpg', 'Wild at Heart'],
  ],
  [DAFOE.id]: [
    ['/cRQEgHV829oEtnhEtG4S8yDyxSU.jpg', 'Spider-Man'], ['/rm31SGOzmpxhdjZmM2aZiZCcyT.jpg', 'Speed 2: Cruise Control'],
    ['/i51wnN9phojyn14xHjQt6rv1r0x.jpg', 'The Lighthouse'], ['/tjyilNxcCG3uHR0xG2n5E5rxEx3.jpg', 'Shadow of the Vampire'],
    ['/51Y6sC7CBXG3OEmoFnYCUuypfJi.jpg', 'Poor Things'], ['/vMFRG0QPq59MRGBAeAAV1DXok6w.jpg', 'The Boondock Saints'],
    ['/xt3zpT7LBVv74bLIqLtsS2kknEZ.jpg', 'The Lighthouse'], ['/dNplOw9U5IzlY7nNiaMS0JSVobp.jpg', 'Kinds of Kindness'],
    ['/4JDEpCKXuz0XheCp8p7S7Fo9APm.jpg', 'Shadow of the Vampire'], ['/5zSm9LFd566T67yhcinso7eFQSx.jpg', 'The Life Aquatic with Steve Zissou'],
    ['/zz7yNDyF91goWWU7WuCWPaBz3vM.jpg', 'Inside'], ['/tNE9HGcFOH8EpCmzO7XCYwqguI0.jpg', 'The Lighthouse'],
    ['/ArM4yzl1oxCrJVUngw5lKAEpkb7.jpg', 'Nosferatu'],
  ],
};

// os símbolos: [nome com artigo, desenho]. Traço simples, no mesmo estilo dos ícones do app.
const SIMBOLOS = [
  ['a claquete', '<path d="M3.5 10.5h17v9h-17z"/><path d="M3.5 10.5L3 7.5l16.5-3 .5 3z"/><path d="M7 6.8l1.5 2.8M11.5 6l1.5 2.8M16 5.1l1.5 2.8"/>'],
  ['o balde de pipoca', '<path d="M6.5 10.5L8 20h8l1.5-9.5z"/><path d="M10.2 11l.4 8.500M13.800 11l-.4 8.500"/><circle cx="8.6" cy="7.8" r="2.200"/><circle cx="12" cy="6.2" r="2.400"/><circle cx="15.400" cy="7.800" r="2.200"/>'],
  ['o ingresso', '<path d="M3 7h18v3.5a1.5 1.5 0 0 0 0 3V17H3v-3.5a1.5 1.5 0 0 0 0-3z"/><path d="M15 7.800v1.700M15 11.200v1.600M15 14.500v1.700"/>'],
  ['o rolo de filme', '<circle cx="12" cy="12" r="8.500"/><circle cx="12" cy="12" r="1.100"/><circle cx="12" cy="7.300" r="1.500"/><circle cx="12" cy="16.700" r="1.500"/><circle cx="7.300" cy="12" r="1.500"/><circle cx="16.700" cy="12" r="1.500"/>'],
  ['os óculos 3D', '<path d="M3 9.500h18V15h-6.500L13 12.500h-2L9.500 15H3z"/><path d="M3 9.500L2.500 7M21 9.500l.5-2.500"/>'],
  ['o megafone', '<path d="M4 10v4l3 .500L17 18V6L7 9.500z"/><path d="M7 14.500L8 19h2.500l-.800-3.600"/><path d="M19.500 9.500c1 1.500 1 3.500 0 5"/>'],
  ['a câmera', '<path d="M4.500 10.500h9A1.500 1.500 0 0 1 15 12v5.500a1.500 1.500 0 0 1-1.500 1.500h-9A1.500 1.500 0 0 1 3 17.500V12a1.500 1.500 0 0 1 1.500-1.500z"/><path d="M15 13.200l5.500-2.700v8.500L15 16.300"/><circle cx="6.500" cy="6.800" r="2.300"/><circle cx="11.800" cy="6.800" r="2.300"/>'],
  ['o troféu', '<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 5.500H5V7a3 3 0 0 0 3 3M16 5.500h3V7a3 3 0 0 1-3 3"/><path d="M12 13v4M9.500 17h5v3h-5zM8 20h8"/>'],
];
const desenho = ([, d]) => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;

// onde o símbolo pode se esconder
const LUGARES = {
  logo: 'ao lado do título, no topo',
  inicio: 'no fim da aba Início',
  buscar: 'na aba Buscar, perto dos botões',
  lista: 'no título da aba Quero ver',
  diario: 'no fim da aba Diário',
  perfil: 'aqui no Perfil, ao lado do seu nome',
  ficha: 'no rodapé da ficha de qualquer filme, série ou pessoa',
};
const NOMES = Object.keys(LUGARES);

const numeroDoDia = (iso = hoje()) => Math.floor(Date.parse(`${iso}T12:00:00Z`) / 864e5);
/** Embaralha o dia para o esconderijo e o símbolo não seguirem o dia da semana. */
const sorteio = (dia, n, sal = 0) => (Math.imul(dia + sal, 2654435761) >>> 8) % n;

export const esconderijoDeHoje = () => NOMES[sorteio(numeroDoDia(), NOMES.length)];
export const dicaDeHoje = () => LUGARES[esconderijoDeHoje()];
const simboloDoDia = (dia) => SIMBOLOS[sorteio(dia, SIMBOLOS.length, 7)];
/** O símbolo escondido hoje (ou daqui a `mais` dias): { nome, svg }. */
export const simboloDeHoje = (mais = 0) => { const s = simboloDoDia(numeroDoDia() + mais); return { nome: s[0], svg: desenho(s) }; };

/* ---------- quem achou (corrida do dia e placar do mês) ---------- */
let achados = [];      // linhas do mês: { dia, user_id, achado_em }
let dono = null;
let carregando = null;
const LOCAL = 'sessao:ovo:achado'; // dia em que este aparelho achou (vale também sem login)
const achouAqui = () => { try { return localStorage.getItem(LOCAL) === hoje(); } catch { return false; } };

async function carregar() {
  const b = nuvem.usuario() ? nuvem.banco() : null;
  if (!b) { achados = []; return; }
  const { data } = await b.from('ovo_achados').select('dia, user_id, achado_em').gte('dia', `${hoje().slice(0, 7)}-01`);
  achados = data || [];
}
/** Espera os achados do mês chegarem da conta (para o Perfil mostrar o placar). */
export const pronto = () => carregando || Promise.resolve();
nuvem.aoMudar(() => {
  const eu = nuvem.usuario()?.id || null;
  if (eu === dono) return;
  dono = eu;
  carregando = carregar().catch(() => {}).then(() => marcarAchado());
});

const hora = (iso) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
const doDia = () => achados.filter((a) => a.dia === hoje()).sort((a, b) => a.achado_em.localeCompare(b.achado_em));
/** Você já achou o símbolo de hoje? Devolve a hora ("08:12"), true (sem login) ou false. */
export function acheiHoje() {
  const eu = nuvem.usuario()?.id;
  const meu = eu ? doDia().find((a) => a.user_id === eu) : null;
  return meu ? hora(meu.achado_em) : achouAqui();
}
/** Placar do mês: quantos dias cada um achou primeiro. null sem login ou sem o outro. */
export function placarDoMes() {
  const eu = nuvem.usuario()?.id;
  const o = nuvem.outro();
  if (!eu || !o) return null;
  const primeiro = new Map(); // dia -> quem achou antes
  for (const a of [...achados].sort((x, y) => x.achado_em.localeCompare(y.achado_em))) if (!primeiro.has(a.dia)) primeiro.set(a.dia, a.user_id);
  const de = (id) => [...primeiro.values()].filter((u) => u === id).length;
  return { eu: de(eu), ele: de(o.id), nomeDele: o.nome };
}
export function htmlPlacar(p, rotulo) {
  const mes = new Date(`${hoje()}T12:00:00`).toLocaleDateString('pt-BR', { month: 'long' });
  return `<div class="placar" aria-label="${esc(rotulo)} de ${mes}"><div class="${p.eu > p.ele ? 'lider' : ''}"><b>${p.eu}</b>você</div><span>${mes}</span><div class="${p.ele > p.eu ? 'lider' : ''}"><b>${p.ele}</b>${esc(p.nomeDele)}</div></div>`;
}

/** HTML do símbolo de hoje, se ele estiver escondido em `lugar`; senão, nada. */
export function simboloEscondido(lugar) {
  if (lugar !== esconderijoDeHoje()) return '';
  const s = simboloDeHoje();
  return `<button class="ovo-s${acheiHoje() ? ' achado' : ''}" data-ovo aria-label="Símbolo escondido de hoje: ${esc(s.nome)}">${s.svg}</button>`;
}
function marcarAchado() {
  if (acheiHoje()) document.querySelectorAll('[data-ovo]').forEach((b) => b.classList.add('achado'));
}

/** Registra que você achou (uma vez por dia) e avisa o outro, se ele ainda não achou. */
async function registrar() {
  try { localStorage.setItem(LOCAL, hoje()); } catch { /* sem armazenamento, vale só nesta visita */ }
  const b = nuvem.usuario() ? nuvem.banco() : null;
  if (!b) return;
  await pronto();
  const eu = nuvem.usuario().id;
  if (doDia().some((a) => a.user_id === eu)) return;
  const { error } = await b.from('ovo_achados').upsert({ dia: hoje(), user_id: eu }, { onConflict: 'dia,user_id', ignoreDuplicates: true });
  if (error) return;
  await carregar().catch(() => {});
  // o aviso no celular do outro sai pela função do servidor; se falhar, a corrida continua valendo
  b.functions.invoke('avisos', { body: { acao: 'achou' } }).catch(() => {});
}

export async function abrirOvo() {
  if (document.querySelector('.ovo')) return;
  const dia = numeroDoDia();
  const s = simboloDeHoje();
  const caixa = document.createElement('div');
  caixa.className = 'ovo ovo-dia';
  const corpo = () => {
    const eu = nuvem.usuario()?.id;
    const hojeAchados = doDia();
    const meu = hojeAchados.find((a) => a.user_id === eu);
    const primeiro = hojeAchados[0];
    const o = nuvem.outro();
    let quem = 'Entre na sua conta para disputar com o outro quem acha primeiro.';
    if (meu && primeiro.user_id === eu) quem = `Você achou primeiro hoje, às ${hora(meu.achado_em)}.${o && hojeAchados.length < 2 ? ` ${esc(o.nome)} ainda está procurando.` : ''}`;
    else if (meu) quem = `${esc(nuvem.pessoa(primeiro.user_id)?.nome || 'O outro')} achou primeiro, às ${hora(primeiro.achado_em)}. Você achou às ${hora(meu.achado_em)}.`;
    else if (eu) quem = 'Anotando que você achou…';
    const placar = placarDoMes();
    const amanha = simboloDeHoje(1);
    return `<div class="ovo-c" role="dialog" aria-modal="true" aria-label="Você achou o símbolo de hoje">
      <div class="ovo-t"><span class="ovo-g">${s.svg}</span><div><h3>Você achou ${esc(s.nome)}</h3><p>${quem}</p></div></div>
      <div class="ovo-f">${[DAFOE, CAGE].map((p) => {
        const lista = CENAS[p.id];
        const [cena, filme] = lista[dia % lista.length];
        return `<a href="#/pessoa/${p.id}"><div class="cena"><img src="${img(cena, 'w780')}" alt="${esc(p.nome)}" crossorigin="anonymous" onerror="this.src='${img(p.rosto, 'w342')}';this.onerror=null"></div>
          <span><b>${esc(p.nome)}</b> em ${esc(filme)}</span></a>`;
      }).join('')}</div>
      ${placar ? htmlPlacar(placar, 'Quem achou primeiro, placar') : ''}
      ${eu && o ? '<a class="btn on-star" href="#/frame/hoje">Jogar o frame do dia</a>' : ''}
      <p class="ovo-a">Amanhã o símbolo escondido é <span class="ovo-m">${amanha.svg}</span> <b>${esc(amanha.nome)}</b>.</p>
      <button class="btn small" data-fechar style="align-self:center">Fechar</button></div>`;
  };
  caixa.innerHTML = corpo();
  const fechar = () => { caixa.remove(); window.removeEventListener('hashchange', fechar); };
  caixa.addEventListener('click', (e) => { if (e.target === caixa || e.target.closest('a,[data-fechar]')) fechar(); });
  window.addEventListener('hashchange', fechar);
  document.body.append(caixa);
  await registrar();
  marcarAchado();
  window.dispatchEvent(new Event('ovo:achado')); // o Perfil atualiza o cartão da caça ao símbolo
  if (caixa.isConnected) caixa.innerHTML = corpo();
}

// o símbolo funciona em qualquer tela
document.addEventListener('click', (e) => {
  if (e.target.closest('[data-ovo]')) { e.preventDefault(); e.stopPropagation(); abrirOvo(); }
}, true);
