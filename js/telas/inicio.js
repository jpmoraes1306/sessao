// Aba Início: um destaque que passa de lado (filme do dia, o mesmo para os dois; próximo episódio;
// sessão marcada), atalhos e fileiras: atividade, séries em andamento, estreias, em cartaz e em alta.
import * as tmdb from '../tmdb.js';
import * as omdb from '../omdb.js';
import * as dados from '../dados.js';
import { temChaves } from '../config.js';
import * as nuvem from '../nuvem.js';
import * as social from '../social.js';
import * as andamento from '../andamento.js';
import * as avisos from '../avisos.js';
import { semChaves } from './comum.js';
import { simboloEscondido } from '../ovo.js';
import { $, esc, nota, notaMinha, tile, poster, link, dataCurta, contagem, proximaTerca, duracao, hoje, toast, corDe, IC } from '../ui.js';

export const manter = true; // ao voltar de uma ficha, a aba continua como estava

const esqueleto = (n = 5) => `<div class="row">${'<div class="poster skel" style="--a:transparent;--b:transparent"></div>'.repeat(n)}</div>`;

/* ---------- filme do dia ---------- */
// Regra: tem que ser o MESMO filme para os dois. Por isso a escolha depende só da data e de uma
// lista que os dois enxergam igual.
// - Sem login (hoje): a lista são os 400 filmes mais bem avaliados do TMDB.
// - Com login (fases 2 e 3): a lista passa a ser o "Quero ver" dos dois, com prioridade para o que
//   está nas duas listas e na "Queremos ver juntos"; basta trocar `candidatos()`.
const numeroDoDia = () => Math.floor(Date.parse(`${hoje()}T12:00:00Z`) / 864e5);

async function candidatos(dia) {
  // com login: primeiro "Queremos ver juntos"; depois o que está no Quero ver dos dois; depois em qualquer uma
  // das duas listas. Fica de fora o que os dois já viram. A ordem é fixa (pelo id), para dar igual nos dois celulares.
  if (nuvem.usuario() && social.pronto()) {
    const meus = new Set(dados.todos().filter((t) => t.quero && t.tipo === 'filme').map((t) => t.id));
    const dele = new Set(social.queroDoOutro().filter((q) => q.tipo === 'filme').map((q) => q.tmdb_id));
    const juntos = social.listaJuntos().filter((j) => j.tipo === 'filme').map((j) => j.tmdb_id);
    const doisViram = (id) => dados.titulo('filme', id).visto && social.doOutro('filme', id)?.visto;
    const ordena = (ids) => [...new Set(ids)].filter((id) => !doisViram(id)).sort((a, b) => a - b).map((id) => ({ id }));
    const grupos = [['juntos', ordena(juntos)], ['dois', ordena([...meus].filter((id) => dele.has(id)))], ['um', ordena([...meus, ...dele])]];
    const achado = grupos.find(([, l]) => l.length);
    if (achado) return { lista: achado[1], origem: achado[0] };
  }
  const pagina = (dia * 7) % 20 + 1; // 7 e 20 são primos entre si: passa por todas as páginas antes de repetir
  return { lista: await tmdb.bemAvaliados(pagina), origem: 'tmdb' };
}

async function filmeDoDia() {
  const dia = numeroDoDia();
  const { lista, origem } = await candidatos(dia);
  if (!lista.length) return null;
  const escolhido = lista[(dia * 13) % lista.length];
  const f = await tmdb.filme(escolhido.id);
  const notas = await omdb.notas(f.imdbId);
  return { f, notas, origem };
}

/* ---------- destaque: cartões que passam de lado ---------- */
const partes = { dia: '', serie: '' }; // cada pedaço chega no seu tempo
const fundoDe = (caminho, tam = 'w780') => (caminho ? `<img src="${tmdb.img(caminho, tam)}" alt="" crossorigin="anonymous" onerror="this.remove()">` : '');
const cores = (titulo) => { const [a, b] = corDe(titulo || ''); return `style="--a:${a};--b:${b}"`; };

function desenharDestaque(el) {
  const alvo = $('#destaque', el);
  if (!alvo) return;
  const lista = [partes.dia, partes.serie].filter(Boolean);
  if (!lista.length) { alvo.innerHTML = '<p class="note">Sem sugestão hoje.</p>'; return; }
  alvo.innerHTML = `<div class="row dest${lista.length === 1 ? ' um' : ''}" id="dest">${lista.join('')}</div>
    ${lista.length > 1 ? `<div class="pontos" aria-hidden="true">${lista.map((_, i) => `<i class="${i ? '' : 'on'}"></i>`).join('')}</div>` : ''}`;
  const d = $('#dest', el);
  d.onscroll = () => {
    const passo = d.firstElementChild.getBoundingClientRect().width + 10;
    const n = Math.round(d.scrollLeft / passo);
    alvo.querySelectorAll('.pontos i').forEach((p, i) => p.classList.toggle('on', i === n));
  };
}

function slideDoDia({ f, notas }) {
  const meu = dados.titulo('filme', f.id);
  const fora = notas?.imdb ? `IMDb ${nota(notas.imdb)}` : (f.nota ? `TMDB ${nota(f.nota)}` : '');
  return `<a class="slide" href="${link(f)}" ${cores(f.titulo)}>${fundoDe(f.fundo)}
    <div><div class="eyebrow">Filme do dia${meu.visto ? ' · você já viu' : ''}</div><div class="tt">${esc(f.titulo)}</div>
    <div class="s">${[f.ano, f.diretores[0]?.nome, f.duracao ? duracao(f.duracao) : '', fora].filter(Boolean).map(esc).join(' · ')}</div></div></a>`;
}

/* ---------- séries em andamento (estilo TV Time) ---------- */
const cod = (t, e) => `S${String(t).padStart(2, '0')} E${String(e).padStart(2, '0')}`;

function slideDaSerie(t, { s, total, vistos, prox, ep }) {
  const pct = total ? Math.round((vistos / total) * 100) : 0;
  return `<a class="slide" href="${link(t)}" ${cores(s.titulo)}>${fundoDe(ep?.still || s.fundo)}
    <div><div class="eyebrow">Continue vendo</div><div class="tt">${esc(s.titulo)}</div>
    <div class="s">${cod(prox.t, prox.e)} · ${esc(ep?.nome || `Episódio ${prox.e}`)}</div><div class="bar"><i style="width:${pct}%"></i></div></div></a>`;
}

function cartaoSerie(t, sit) {
  const { s, total, vistos, prox, ep, inedito } = sit;
  const pct = total ? Math.round((vistos / total) * 100) : 0;
  const foto = prox ? ep?.still : s.fundo;
  const olho = prox ? `<button class="ic" data-acao="ver-ep" data-serie="${t.id}" data-t="${prox.t}" data-e="${prox.e}" aria-label="Marcar ${cod(prox.t, prox.e)} como visto">${IC.olho}</button>` : '';
  const linha2 = prox
    ? `${cod(prox.t, prox.e)}${ep?.duracao ? ` · ${ep.duracao} min` : ''} · ${esc(ep?.nome || `Episódio ${prox.e}`)}`
    : (s.acabou ? 'Série concluída' : 'Em dia: você viu tudo que já saiu');
  return `<div class="sc" data-serie="${t.id}">
    <div class="still"><a href="${link(t)}" style="position:absolute;inset:0" aria-label="${esc(s.titulo)}">${foto ? `<img src="${tmdb.img(foto, 'w300')}" alt="" loading="lazy" crossorigin="anonymous" onerror="this.remove()">` : ''}</a>${olho}<i style="width:${pct}%"></i></div>
    <a class="t" href="${link(t)}">${esc(s.titulo)}</a><div class="s">${linha2}</div>
    ${inedito ? `<div class="novo">Episódio novo ${contagem(inedito.data)} · ${dataCurta(inedito.data)}</div>` : ''}</div>`;
}

async function emAndamento(el) {
  const s = $('#em-andamento', el);
  if (!s) return;
  const series = andamento.acompanhadas().slice(0, 8);
  if (!series.length) { s.hidden = true; s.innerHTML = ''; partes.serie = ''; desenharDestaque(el); atalhos(el); return; }
  s.hidden = false;
  if (!s.innerHTML) s.innerHTML = '<h2>Séries em andamento</h2><div class="skel txt"></div>';
  atalhos(el);
  const situacoes = await Promise.all(series.map(async (t) => { try { return await andamento.situacao(t.id); } catch { return null; } }));
  if (!$('#em-andamento', el)) return;
  s.innerHTML = `<h2>Séries em andamento</h2><div class="row larga">${series.map((t, i) => (situacoes[i] ? cartaoSerie(t, situacoes[i]) : `<a class="sc" href="${link(t)}"><div class="still"></div><span class="t">${esc(t.titulo)}</span><span class="s">Não deu para carregar agora</span></a>`)).join('')}</div>`;
  const i = situacoes.findIndex((x) => x?.prox);
  partes.serie = i >= 0 ? slideDaSerie(series[i], situacoes[i]) : '';
  desenharDestaque(el);
}

export function atualizar(el) {
  emAndamento(el).catch(() => {});
  atividade(el).catch(() => {});
}

/* ---------- atividade do outro (as suas ficam no seu Diário) ---------- */
function tileFeed(a, o) {
  const fez = a.nota != null ? `deu <span class="selo">${notaMinha(a.nota)}</span>` : a.visto ? 'viu' : a.seguindo ? 'acompanha' : a.curtido ? 'curtiu' : 'marcou';
  // a miniatura é a foto de perfil do outro; sem foto, a inicial
  const mini = o?.foto ? `<img class="av" src="${esc(o.foto)}" alt="" referrerpolicy="no-referrer" onerror="this.replaceWith(Object.assign(document.createElement('i'),{className:'av ele',textContent:this.dataset.l}))" data-l="${esc((a.nome || '?')[0])}">` : `<i class="av ele">${esc((a.nome || '?')[0])}</i>`;
  return `<a class="tile" href="#/${a.tipo}/${a.tmdb_id}" aria-label="${esc(a.nome)}: ${esc(a.titulo)}">${poster(a)}
    <span class="leg">${mini}<span class="n">${fez}</span>${a.curtido && a.nota != null ? '<span class="heart" aria-label="curtiu">♥</span>' : ''}</span></a>`;
}

async function atividade(el) {
  const s = $('#atividade', el);
  const o = nuvem.usuario() && nuvem.outro();
  if (!s || !o) return;
  const itens = await social.feed(12);
  if (!$('#atividade', el) || !itens.length) return;
  s.hidden = false;
  s.innerHTML = `<h2>Atividade <small>de ${esc(o.nome)}</small></h2><div class="row">${itens.map((a) => tileFeed(a, o)).join('')}</div>`;
  atalhos(el);
}

/* ---------- atalhos: pulam para cada parte da tela ---------- */
function atalhos(el) {
  const alvo = $('#atalhos', el);
  if (!alvo) return;
  const lista = [['atividade', 'Atividade'], ['em-andamento', 'Séries'], ['s-estreias', 'Estreias'], ['s-cartaz', 'Em cartaz'], ['s-alta', 'Em alta']]
    .filter(([id]) => { const s = document.getElementById(id); return s && !s.hidden; });
  alvo.innerHTML = lista.map(([id, n]) => `<button class="cap" data-ir="${id}">${n}</button>`).join('');
}

/* ---------- página ---------- */
let altaTipo = 'filme';
let vezDoDia = 0;

export function render(el) {
  if (!temChaves()) {
    semChaves(el);
    return;
  }
  partes.dia = ''; partes.serie = '';
  el.innerHTML = `
    <section id="destaque"><div class="slide skel"></div></section>
    <div class="caps" id="atalhos" role="group" aria-label="Ir para"></div>
    <section id="atividade" hidden></section>
    <section id="em-andamento" hidden></section>
    <section id="s-estreias"><h2>Próximas estreias <small><a class="link" href="#/calendario/${hoje().slice(0, 7)}">Calendário</a></small></h2><div id="estreias">${esqueleto()}</div></section>
    <section id="s-cartaz"><h2>Em cartaz <small>juntos: ${dataCurta(proximaTerca(''))}</small></h2><div id="cartaz">${esqueleto()}</div></section>
    <section id="s-alta"><h2>Em alta <span class="seg" role="group" aria-label="Filmes ou séries" style="flex:none"><button data-alta="filme" aria-pressed="${altaTipo === 'filme'}">Filmes</button><button data-alta="serie" aria-pressed="${altaTipo === 'serie'}">Séries</button></span></h2><div id="alta">${esqueleto()}</div></section>
    <p class="note">"Juntos" é a primeira terça-feira a partir da estreia. O filme do dia é o mesmo para vocês dois. Este app usa a API do TMDB, mas não é endossado nem certificado pelo TMDB.</p>${simboloEscondido('inicio')}`;
  atalhos(el);
  atualizar(el);

  const erroTexto = (erro) => `<p class="note">${erro?.status === 401 ? 'A chave do TMDB foi recusada. Confira no Perfil.' : 'Não deu para carregar. Confira a internet.'}</p>`;
  // vale(): a resposta ainda é a que a tela espera? (quem troca Filmes/Séries rápido recebe as respostas fora de ordem)
  const por = (sel, promessa, desenha, vale = () => true) => promessa.then((lista) => {
    const alvo = $(sel, el);
    if (alvo && vale()) alvo.innerHTML = lista.length ? desenha(lista) : '<p class="note">Nada por enquanto.</p>';
  }).catch((erro) => {
    const alvo = $(sel, el);
    if (alvo && vale()) alvo.innerHTML = erroTexto(erro);
  });
  const carregarAlta = () => { const tipo = altaTipo; return por('#alta', tmdb.emAlta(tipo), fileira, () => tipo === altaTipo); };
  const fileira = (lista) => `<div class="row">${lista.slice(0, 18).map((c) => tile(c)).join('')}</div>`;

  // toques: cartões de série, atalhos e o seletor do "Em alta"
  el.onclick = async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.ir) {
      document.getElementById(b.dataset.ir)?.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    } else if (b.dataset.alta) {
      altaTipo = b.dataset.alta;
      el.querySelectorAll('[data-alta]').forEach((x) => x.setAttribute('aria-pressed', x.dataset.alta === altaTipo));
      $('#alta', el).innerHTML = esqueleto();
      carregarAlta();
    } else if (b.dataset.acao === 'ver-ep') {
      e.preventDefault();
      b.disabled = true;
      dados.marcarEpisodios(b.dataset.serie, [{ t: Number(b.dataset.t), e: Number(b.dataset.e) }], true);
      toast(`${cod(b.dataset.t, b.dataset.e)} visto`);
      emAndamento(el).catch(() => {});
    }
  };

  const pedidoDoDia = ++vezDoDia; // se a tela for refeita antes de a resposta chegar, vale só a do pedido mais novo
  filmeDoDia().then((d) => { if (pedidoDoDia !== vezDoDia) return; partes.dia = d ? slideDoDia(d) : ''; desenharDestaque(el); })
    .catch((erro) => { const alvo = $('#destaque', el); if (alvo && !partes.serie) alvo.innerHTML = erroTexto(erro); });

  por('#estreias', tmdb.estreias(), (lista) => `<div class="row">${lista.slice(0, 12).map((c) => `
    <a class="tile" href="${link(c)}" aria-label="${esc(c.titulo)}, estreia ${dataCurta(c.data)}">${poster(c).replace(/<\/div>$/, `<span class="dia">${dataCurta(c.data)}</span></div>`)}
      <span class="leg"><span class="n">juntos <span class="junto">${dataCurta(proximaTerca(c.data))}</span>${avisos.pediuAviso(c.id) ? ' · aviso' : ''}</span></span></a>`).join('')}</div>`);
  por('#cartaz', tmdb.emCartaz(), fileira);
  carregarAlta();
}