// Easter egg: "caça ao símbolo".
// - A cada rodada (são duas por dia: troca à meia-noite e ao meio-dia de Brasília) um símbolo de cinema, que o app
//   avisa qual é, fica escondido num lugar diferente do app.
// - Quem acha primeiro ganha a rodada; o placar do mês fica guardado na conta.
// - Achar abre um pop-up com o Dafoe e o Cage da rodada (uma cena grande de cada) e o caminho para o frame.
// - Símbolo e esconderijo dependem só da rodada, então são os mesmos nos dois celulares.
import { img } from './tmdb.js';
import * as nuvem from './nuvem.js';
import { esc, hoje, rodada, numeroDaRodada, proximaTroca, toast } from './ui.js';

const CAGE = { id: 2963, nome: 'Nicolas Cage', rosto: '/y1RtezurZYveYkVNRht7CwEgSYY.jpg' };
const DAFOE = { id: 5293, nome: 'Willem Dafoe', rosto: '/ui8e4sgZAwMPi3hzEO53jyBJF9B.jpg' };

// [imagem no TMDB, filme]. Regra para entrar aqui: o ator aparece de verdade, bem visível, com cara ou situação
// cômica ou caricata. Cada imagem foi olhada uma a uma em 20/11/2026; as sérias, tristes, escuras ou sem o ator
// saíram. Ao acrescentar uma, ABRIR A IMAGEM E OLHAR antes: o nome do filme não garante nada.
const CENAS = {
  [CAGE.id]: [
    ['/fUmWfASEW1D4R2pvZPBpHNufAeL.jpg', "Vampire's Kiss"],                          // olhos arregalados, o meme
    ['/k4TpF7wl1FMPzHRJNudODAm7h0P.jpg', 'The Unbearable Weight of Massive Talent'], // de chapéu, fazendo arminha com os dedos
    ['/6CBKRe9ossDiQ7UaSfvG4I07hK7.jpg', 'Renfield'],                                // Drácula de presas à mostra
    ['/vlbTPrt664RAIeMYtgnqCYQPfgR.jpg', 'Dream Scenario'],                          // careca, ao lado do carro pichado "LOSER"
    ['/rrmavNBz1aKSY11jbGGnj1Q5CTo.jpg', "Vampire's Kiss"],                          // surtando ao telefone
    ['/95cYzbSp13ChoUYlDwj1fPL4Q6X.jpg', 'Raising Arizona'],                         // de bigode, segurando o bebê
    ['/xLyQQTfbiC4iPam3jUOyLprg24x.jpg', 'The Unbearable Weight of Massive Talent'], // rindo ao volante
    ['/ubVqplLMa6X51Y8yhRcbbnApXWe.jpg', "Vampire's Kiss"],                          // de braços abertos, boca aberta, na rua
    ['/2WRe1y5S1jGWTKUcSPPmD1Ixq56.jpg', 'Dream Scenario'],                          // retrato careca, de suéter
    ['/8njrrfYfrei0IDw9Tm8PgXquk7Z.jpg', 'Renfield'],                                // Drácula encarando
    ['/xjjUSZnZugtGgVNtLEF92D0I9dI.jpg', "Vampire's Kiss"],                          // de dentes de vampiro
  ],
  [DAFOE.id]: [
    ['/rm31SGOzmpxhdjZmM2aZiZCcyT.jpg', 'Speed 2: Cruise Control'], // sorriso de maluco, cabelo cacheado
    ['/cRQEgHV829oEtnhEtG4S8yDyxSU.jpg', 'Spider-Man'],             // o sorriso do Norman Osborn
    ['/tjyilNxcCG3uHR0xG2n5E5rxEx3.jpg', 'Shadow of the Vampire'],  // vampiro de garras, de perfil
    ['/51Y6sC7CBXG3OEmoFnYCUuypfJi.jpg', 'Poor Things'],            // olhos arregalados, rosto costurado
    ['/vOo46SFy6ar7WB0qNOXBKTldCNX.jpg', 'The Lighthouse'],         // lobo do mar de cachimbo
    ['/5BSvHKPhpsBFMJbq9dg2Dwoc9O8.jpg', 'Shadow of the Vampire'],  // vampiro sorrindo de lado
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

/** Embaralha a rodada para o esconderijo e o símbolo não seguirem uma ordem previsível. */
const sorteio = (n, total, sal = 0) => (Math.imul(n + sal, 2654435761) >>> 8) % total;
/** Sorteio que não repete o da rodada anterior: de uma rodada para a outra, o lugar e o símbolo sempre mudam. */
const semRepetir = (n, total, sal = 0) => { const a = sorteio(n, total, sal); return a === sorteio(n - 1, total, sal) ? (a + 1) % total : a; };

/** Os nomes dizem "de hoje", mas valem para a rodada atual (ver `rodada` em ui.js). */
export const esconderijoDeHoje = () => NOMES[semRepetir(numeroDaRodada(), NOMES.length)];
export const dicaDeHoje = () => LUGARES[esconderijoDeHoje()];
export { proximaTroca };
const simboloDa = (n) => SIMBOLOS[semRepetir(n, SIMBOLOS.length, 7)];
/** O símbolo escondido agora (ou daqui a `mais` rodadas): { nome, svg }. */
export const simboloDeHoje = (mais = 0) => { const s = simboloDa(numeroDaRodada() + mais); return { nome: s[0], svg: desenho(s) }; };

/* ---------- quem achou (corrida do dia e placar do mês) ---------- */
let achados = [];      // linhas do mês: { dia, user_id, achado_em }
let dono = null;
let carregando = null;
const LOCAL = 'sessao:ovo:achado'; // rodada em que este aparelho achou (vale também sem login)
// guarda a rodada e de quem foi, para o achado de um não valer para o outro no mesmo aparelho
const marcaLocal = () => `${rodada()}|${nuvem.usuario()?.id || ''}`;
const achouAqui = () => { try { return localStorage.getItem(LOCAL) === marcaLocal(); } catch { return false; } };

async function carregar() {
  const b = nuvem.usuario() ? nuvem.banco() : null;
  if (!b) { achados = []; return; }
  const { data } = await b.from('ovo_achados').select('dia, user_id, achado_em').gte('dia', `${hoje().slice(0, 7)}-01`);
  achados = data || [];
}
/** Espera os achados do mês chegarem da conta (para o Perfil mostrar o placar). */
export const pronto = () => carregando || Promise.resolve();
/** Busca de novo quem achou (o outro pode ter achado depois que o app abriu, ou o mês virou). */
export const atualizar = () => (carregando = carregar().catch(() => {}).then(() => { marcarAchado(); if (achouAqui()) enviar(); }));
nuvem.aoMudar(() => {
  const eu = nuvem.usuario()?.id || null;
  if (eu === dono) return;
  dono = eu;
  // se este aparelho achou hoje e a conta ainda não sabe (a internet caiu na hora), manda agora
  carregando = carregar().catch(() => {}).then(() => { marcarAchado(); if (achouAqui()) enviar(); });
});

const hora = (iso) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
const doDia = () => achados.filter((a) => a.dia === rodada()).sort((a, b) => a.achado_em.localeCompare(b.achado_em));
/** Você já achou o símbolo desta rodada? Devolve a hora ("08:12"), true (sem login) ou false. */
export function acheiHoje() {
  const eu = nuvem.usuario()?.id;
  const meu = eu ? doDia().find((a) => a.user_id === eu) : null;
  return meu ? hora(meu.achado_em) : achouAqui();
}
/** Placar do mês: em quantas rodadas cada um achou primeiro. null sem login ou sem o outro. */
export function placarDoMes() {
  const eu = nuvem.usuario()?.id;
  const o = nuvem.outro();
  if (!eu || !o) return null;
  const primeiro = new Map(); // rodada -> quem achou antes
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
  return `<button class="ovo-s${acheiHoje() ? ' achado' : ''}" data-ovo="${rodada()}" aria-label="Símbolo escondido da vez: ${esc(s.nome)}">${s.svg}</button>`;
}
function marcarAchado() {
  if (acheiHoje()) document.querySelectorAll('[data-ovo]').forEach((b) => b.classList.add('achado'));
}

/** Registra que você achou (uma vez por rodada) e avisa o outro, se ele ainda não achou. */
async function registrar() {
  try { localStorage.setItem(LOCAL, marcaLocal()); } catch { /* sem armazenamento, vale só nesta visita */ }
  await pronto();
  await enviar();
}
/** Grava na conta o achado desta rodada, se ainda não estiver lá. */
async function enviar() {
  const b = nuvem.usuario() ? nuvem.banco() : null;
  if (!b) return;
  const eu = nuvem.usuario().id;
  if (doDia().some((a) => a.user_id === eu)) return;
  const { error } = await b.from('ovo_achados').upsert({ dia: rodada(), user_id: eu }, { onConflict: 'dia,user_id', ignoreDuplicates: true });
  if (error) return;
  await carregar().catch(() => {});
  // o aviso no celular do outro sai pela função do servidor; se falhar, a corrida continua valendo
  b.functions.invoke('avisos', { body: { acao: 'achou' } }).catch(() => {});
}

export async function abrirOvo() {
  if (document.querySelector('.ovo')) return;
  const dia = numeroDaRodada();
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
    if (meu && primeiro.user_id === eu) quem = `Você achou primeiro nesta rodada, às ${hora(meu.achado_em)}.${o && hojeAchados.length < 2 ? ` ${esc(o.nome)} ainda está procurando.` : ''}`;
    else if (meu) quem = `${esc(nuvem.pessoa(primeiro.user_id)?.nome || 'O outro')} achou primeiro, às ${hora(primeiro.achado_em)}. Você achou às ${hora(meu.achado_em)}.`;
    else if (eu) quem = anotando ? 'Anotando que você achou…' : 'Sem internet para anotar agora. O achado fica guardado e sobe quando a conexão voltar.';
    const placar = placarDoMes();
    const amanha = simboloDeHoje(1);
    return `<div class="ovo-c" role="dialog" aria-modal="true" aria-label="Você achou o símbolo da vez">
      <div class="ovo-t"><span class="ovo-g">${s.svg}</span><div><h3>Você achou ${esc(s.nome)}</h3><p>${quem}</p></div></div>
      <div class="ovo-f">${[DAFOE, CAGE].map((p) => {
        // a foto cômica da rodada vem do depósito privado e entra em seguida (ver porAsFotos); o quadro já nasce no lugar
        const [prefixo, total] = FOTOS[p.id];
        const arquivo = `${prefixo}-${String((dia % total) + 1).padStart(2, '0')}.jpg`;
        return `<a href="#/pessoa/${p.id}"><div class="cena" data-foto="${arquivo}" data-pessoa="${p.id}"></div><span><b>${esc(p.nome)}</b><i data-filme></i></span></a>`;
      }).join('')}</div>
      ${placar ? htmlPlacar(placar, 'Quem achou primeiro, placar') : ''}
      ${eu && o ? '<div class="actions" style="justify-content:center"><a class="btn small on-star" href="#/frame/hoje">Jogar o frame</a><a class="btn small on-list" href="#/estrelas/hoje">Connect the Stars</a></div>' : ''}
      <p class="ovo-a">Tudo troca ${proximaTroca()}: o próximo símbolo é <span class="ovo-m">${amanha.svg}</span> <b>${esc(amanha.nome)}</b>.</p>
      <button class="btn small" data-fechar style="align-self:center">Fechar</button></div>`;
  };
  let anotando = true;
  caixa.innerHTML = corpo();
  porAsFotos(caixa, dia);
  const fechar =() => { caixa.remove(); window.removeEventListener('hashchange', fechar); };
  caixa.addEventListener('click', (e) => { if (e.target === caixa || e.target.closest('a,[data-fechar]')) fechar(); });
  window.addEventListener('hashchange', fechar);
  document.body.append(caixa);
  await registrar();
  anotando = false;
  marcarAchado();
  window.dispatchEvent(new Event('ovo:achado')); // o Perfil atualiza o cartão da caça ao símbolo
  if (caixa.isConnected) {
    // o texto e o placar são refeitos; as fotos que já estão na tela ficam (para não piscar nem buscar de novo)
    const fotos = caixa.querySelector('.ovo-f');
    caixa.innerHTML = corpo();
    if (fotos) caixa.querySelector('.ovo-f').replaceWith(fotos);
  }
}

/* ---------- as fotos cômicas do Dafoe e do Cage ---------- */
// Ficam no depósito privado "cenas" do Supabase (só vocês dois leem), com os nomes dafoe-01.jpg, cage-01.jpg...
// São poses e caretas escolhidas uma a uma em 20/11/2026: 30 do Dafoe e 24 do Cage, uma por rodada, em sequência.
// Para pôr mais: subir o arquivo com o número seguinte no depósito e aumentar o total aqui. OLHAR a foto antes.
const FOTOS = { [DAFOE.id]: ['dafoe', 30], [CAGE.id]: ['cage', 24] };
const enderecos = new Map(); // arquivo -> { url, ate }
/** Endereço temporário de uma foto do depósito ('' sem login, sem internet ou se a foto não existir). */
async function fotoDe(arquivo) {
  const guardado = enderecos.get(arquivo);
  if (guardado && guardado.ate > Date.now()) return guardado.url;
  const b = nuvem.usuario() ? nuvem.banco() : null;
  if (!b?.storage) return '';
  try {
    const { data, error } = await b.storage.from('cenas').createSignedUrl(arquivo, 6 * 3600);
    if (error || !data?.signedUrl) return '';
    enderecos.set(arquivo, { url: data.signedUrl, ate: Date.now() + 5 * 3600e3 });
    return data.signedUrl;
  } catch { return ''; }
}
/** Põe em cada quadro a foto da rodada. Se o depósito não responder, entra uma cena de filme (lista CENAS). */
function porAsFotos(caixa, n) {
  for (const quadro of caixa.querySelectorAll('.cena[data-foto]')) {
    const reserva = () => {
      const lista = CENAS[quadro.dataset.pessoa] || [];
      const [cena, filme] = lista[n % lista.length] || [];
      if (!cena || !quadro.isConnected) return;
      quadro.classList.remove('foto');
      quadro.style.aspectRatio = '';
      quadro.innerHTML = `<img src="${img(cena, 'w780')}" alt="" crossorigin="anonymous">`;
      const legenda = quadro.parentNode.querySelector('[data-filme]');
      if (legenda) legenda.textContent = ` em ${filme}`;
    };
    fotoDe(quadro.dataset.foto).then((url) => {
      if (!quadro.isConnected) return;
      if (!url) { reserva(); return; }
      const frente = new Image();
      frente.className = 'frente';
      frente.alt = '';
      frente.onerror = reserva;
      frente.onload = () => {
        if (!quadro.isConnected) return;
        // a foto aparece inteira, sem cortar a pose: o quadro acompanha o formato dela, entre 16:10 e 16:9
        // (mais alto que isso, o pop-up com as duas fotos não cabe na tela do celular sem rolar)
        quadro.style.aspectRatio = String(Math.min(16 / 9, Math.max(1.6, frente.naturalWidth / frente.naturalHeight)));
        const fundo = new Image();
        fundo.className = 'fundo';
        fundo.alt = '';
        fundo.src = url;
        quadro.classList.add('foto');
        quadro.replaceChildren(fundo, frente);
      };
      frente.src = url;
    });
  }
}

// o símbolo funciona em qualquer tela
document.addEventListener('click', (e) => {
  const s = e.target.closest('[data-ovo]');
  if (!s) return;
  e.preventDefault(); e.stopPropagation();
  // um símbolo que ficou na tela desde a rodada anterior não vale: o de agora é outro e está em outro lugar
  if (s.dataset.ovo !== rodada()) { s.remove(); toast('Esse era o símbolo da rodada anterior. O de agora está escondido em outro lugar.'); return; }
  abrirOvo();
}, true);
