// Easter egg: "Dafoe e Cage do dia".
// - Cada dia uma cena diferente de cada um (cenas escolhidas a dedo, dos filmes mais caricatos).
// - Cada dia a carinha que abre o easter egg fica escondida num lugar diferente do app.
// - Tudo depende só da data, então os dois celulares mostram a mesma coisa.
// - A aba Perfil tem um botão de dica para quem não achar.
import { img } from './tmdb.js';
import { esc, hoje } from './ui.js';

const CAGE = { id: 2963, nome: 'Nicolas Cage', rosto: '/y1RtezurZYveYkVNRht7CwEgSYY.jpg' };
const DAFOE = { id: 5293, nome: 'Willem Dafoe', rosto: '/ui8e4sgZAwMPi3hzEO53jyBJF9B.jpg' };

// [imagem no TMDB, filme]
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

// onde a carinha pode se esconder
const LUGARES = {
  logo: 'ao lado do logo, no topo',
  inicio: 'no fim da aba Início',
  buscar: 'na aba Buscar, perto dos botões',
  lista: 'no título da aba Quero ver',
  diario: 'no fim da aba Diário',
  perfil: 'aqui mesmo, no lugar da sua foto',
  ficha: 'no rodapé da ficha de qualquer filme, série ou pessoa',
};
const NOMES = Object.keys(LUGARES);

const numeroDoDia = () => Math.floor(Date.parse(`${hoje()}T12:00:00Z`) / 864e5);
/** Embaralha o dia para o esconderijo não seguir o dia da semana. */
const sorteio = (dia, n) => (Math.imul(dia, 2654435761) >>> 8) % n;

export const esconderijoDeHoje = () => NOMES[sorteio(numeroDoDia(), NOMES.length)];
export const dicaDeHoje = () => LUGARES[esconderijoDeHoje()];

/** HTML da carinha, se hoje ela estiver escondida em `lugar`; senão, nada. */
export function carinha(lugar, cls = '') {
  if (lugar !== esconderijoDeHoje()) return '';
  const quem = numeroDoDia() % 2 ? CAGE : DAFOE;
  return `<button class="ovo-p ${cls}" data-ovo aria-label="Easter egg de hoje"><img src="${img(quem.rosto, 'w185')}" alt="" crossorigin="anonymous" onerror="this.remove()"></button>`;
}

export function abrirOvo() {
  if (document.querySelector('.ovo')) return;
  const dia = numeroDoDia();
  const caixa = document.createElement('div');
  caixa.className = 'ovo';
  caixa.innerHTML = `<div class="ovo-c"><h3>Dafoe e Cage do dia</h3>
    <div class="ovo-f">${[DAFOE, CAGE].map((p) => {
      const lista = CENAS[p.id];
      const [cena, filme] = lista[dia % lista.length];
      return `<a href="#/pessoa/${p.id}"><div class="cena"><img src="${img(cena, 'w780')}" alt="${esc(p.nome)}" crossorigin="anonymous" onerror="this.src='${img(p.rosto, 'w342')}';this.onerror=null"></div>
        <span><b>${esc(p.nome)}</b> em ${esc(filme)}</span></a>`;
    }).join('')}</div>
    <p class="note">Muda todo dia à meia-noite, e cada dia a carinha se esconde num lugar diferente do app.</p>
    <button class="btn small" data-fechar style="align-self:center">Fechar</button></div>`;
  caixa.addEventListener('click', (e) => { if (e.target === caixa || e.target.closest('a,[data-fechar]')) caixa.remove(); });
  document.body.append(caixa);
}

// a carinha funciona em qualquer tela
document.addEventListener('click', (e) => {
  if (e.target.closest('[data-ovo]')) { e.preventDefault(); e.stopPropagation(); abrirOvo(); }
}, true);
