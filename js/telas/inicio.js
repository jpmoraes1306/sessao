// Aba Início: filme do dia (o mesmo para os dois), séries em andamento, estreias com a terça sugerida,
// em cartaz e em alta. Feed, calendário e Mix entram nas fases 3 e 4.
import * as tmdb from '../tmdb.js';
import * as omdb from '../omdb.js';
import * as dados from '../dados.js';
import { temChaves } from '../config.js';
import * as nuvem from '../nuvem.js';
import * as social from '../social.js';
import * as andamento from '../andamento.js';
import * as especial from '../especial.js';
import * as avisos from '../avisos.js';
import { semChaves } from './comum.js';
import { carinha } from '../ovo.js';
import { $, esc, nota, notaMinha, tile, poster, link, dataCurta, dataBR, contagem, proximaTerca, duracao, hoje, toast, IC } from '../ui.js';

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

function cartaoDoDia({ f, notas, origem }) {
  const meu = dados.titulo('filme', f.id);
  const dir = f.diretores[0]?.nome;
  const fora = [notas?.imdb ? `IMDb ${nota(notas.imdb)}` : `TMDB ${nota(f.nota)}`, notas?.rotten != null ? `Rotten ${notas.rotten}%` : ''].filter(Boolean).join(' · ');
  const outro = esc(nuvem.outro()?.nome || 'o outro');
  const naMinha = meu.quero;
  const naDele = social.doOutro('filme', f.id)?.quer;
  const porque = {
    tmdb: 'O mesmo para os dois. Sai dos filmes mais bem avaliados enquanto o "Quero ver" de vocês está vazio ou sem login.',
    juntos: 'Está na lista "Queremos ver juntos".',
    dois: `Está no "Quero ver" de vocês dois.`,
    um: `Está no "Quero ver" ${naMinha && naDele ? 'de vocês dois' : naMinha ? 'seu' : `de ${outro}`}. O mesmo filme aparece para os dois.`,
  }[origem];
  return `<a class="hero" href="${link(f)}">${poster(f, { lg: true })}
    <div class="info"><span class="eyebrow">Para hoje${meu.visto ? ' · você já viu' : ''}</span><h3>${esc(f.titulo)}</h3>
    <p>${[f.ano, dir, f.duracao ? duracao(f.duracao) : ''].filter(Boolean).map(esc).join(' · ')}</p><p>${fora}</p>
    <div class="why">${porque}</div></div></a>`;
}

/* ---------- séries em andamento (estilo TV Time) ---------- */
const cod = (t, e) => `S${String(t).padStart(2, '0')} E${String(e).padStart(2, '0')}`;

function cartaoSerie(t, sit) {
  const { s, total, vistos, prox, ep, inedito } = sit;
  const pct = total ? Math.round((vistos / total) * 100) : 0;
  const novo = inedito ? `<div class="and-n">Próximo episódio ${contagem(inedito.data)} · ${cod(inedito.t, inedito.e)} · ${dataCurta(inedito.data)}</div>` : '';
  const meio = prox
    ? `<a class="still" href="${link(t)}">${ep?.still ? `<img src="${tmdb.img(ep.still, 'w300')}" alt="" loading="lazy" crossorigin="anonymous" onerror="this.remove()">` : ''}${ep?.nota && ep.votos ? `<span class="nt">${nota(ep.nota)}</span>` : ''}</a>
       <a class="meio" href="${link(t)}"><div class="ep-cod">${cod(prox.t, prox.e)}${ep?.duracao ? ` · ${ep.duracao}m` : ''}</div><div class="ep-nome">${esc(ep?.nome || `Episódio ${prox.e}`)}</div><div class="ep-data">${ep?.data ? dataCurta(ep.data) : ''}</div></a>
       <div class="ep-b"><button class="ic" data-acao="ver-ep" data-serie="${t.id}" data-t="${prox.t}" data-e="${prox.e}" aria-label="Marcar ${cod(prox.t, prox.e)} como visto">${IC.olho}</button><a class="ic" href="${link(t)}" aria-label="Abrir a série para dar nota">${IC.lapis}</a></div>`
    : `<a class="still" href="${link(t)}">${s.fundo ? `<img src="${tmdb.img(s.fundo, 'w300')}" alt="" loading="lazy" crossorigin="anonymous" onerror="this.remove()">` : ''}</a>
       <a class="meio" href="${link(t)}"><div class="ep-nome ok">${s.acabou ? 'Série concluída' : 'Série em dia'}</div><div class="ep-data">${s.acabou ? 'Você viu tudo.' : 'Você viu tudo que já saiu.'}</div></a><span></span>`;
  return `<div class="and" data-serie="${t.id}"><a class="and-t" href="${link(t)}">${esc(s.titulo)}</a>
    <div class="and-c">${meio}</div>
    <div class="and-p"><div class="lbar-big"><i style="width:${pct}%"></i></div><span>${pct}%</span></div>${novo}</div>`;
}

async function emAndamento(el) {
  const s = $('#em-andamento', el);
  if (!s) return;
  const series = andamento.acompanhadas().slice(0, 8);
  if (!series.length) { s.hidden = true; s.innerHTML = ''; return; }
  s.hidden = false;
  if (!s.innerHTML) s.innerHTML = '<h2>Séries em andamento</h2><div class="skel txt"></div>';
  const cartoes = await Promise.all(series.map(async (t) => {
    try { return cartaoSerie(t, await andamento.situacao(t.id)); } catch { return `<a class="li" href="${link(t)}">${poster(t, { tam: 'w154' })}<div><div class="t">${esc(t.titulo)}</div><div class="s">Não deu para carregar agora</div></div></a>`; }
  }));
  if ($('#em-andamento', el)) s.innerHTML = `<h2>Séries em andamento</h2>${cartoes.join('')}`;
}

/* ---------- sessões juntos (regra da terça) ---------- */
const MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
async function sessoesJuntos(el) {
  const s = $('#sessoes-juntos', el);
  if (!s || !nuvem.usuario()) return;
  const lista = social.sessoesJuntos().filter((x) => social.estadoDaSessao(x) !== 'feita');
  if (!lista.length) { s.hidden = true; s.innerHTML = ''; return; }
  const info = await dados.resumos(lista);
  if (!$('#sessoes-juntos', el)) return;
  const outro = esc(nuvem.outro()?.nome || 'o outro');
  s.hidden = false;
  s.innerHTML = `<h2>Sessões de vocês <small>para verem juntos</small></h2><div class="list">${lista.map((x) => {
    const r = info.get(`${x.tipo}:${x.tmdb_id}`) || {};
    const estado = social.estadoDaSessao(x);
    const texto = { futura: `Marcada para ${dataCurta(x.data)} · ${contagem(x.data)}`, 'hoje-ou-passou': x.data === hoje() ? 'É hoje. Já viram?' : `Era ${dataCurta(x.data)}. Já viram?`, confirmar: `${outro} marcou que vocês viram em ${dataCurta(x.data)}` }[estado];
    const botoes = { futura: `<button class="btn small" data-acao="cancelar-sessao" data-id="${x.id}">Cancelar</button>`,
      'hoje-ou-passou': `<button class="btn small on-seen" data-acao="vimos" data-id="${x.id}">Vimos</button><button class="btn small" data-acao="cancelar-sessao" data-id="${x.id}">Cancelar</button>`,
      confirmar: `<button class="btn small on-seen" data-acao="vimos" data-id="${x.id}">Confirmar que vi</button>` }[estado];
    return `<div class="li" style="grid-template-columns:36px 44px 1fr"><div class="date">${Number(x.data.slice(8))}<small>${MES[Number(x.data.slice(5, 7)) - 1]}</small></div>
      <a href="#/${x.tipo}/${x.tmdb_id}">${poster({ titulo: r.titulo || '', poster: r.poster }, { tam: 'w154' })}</a>
      <div><a class="t" href="#/${x.tipo}/${x.tmdb_id}" style="text-decoration:none">${esc(r.titulo || 'Sem título')}</a><div class="s">${texto}</div><div class="actions" style="margin-top:6px">${botoes}</div></div></div>`;
  }).join('')}</div>`;
}

/* ---------- data especial (tema do dia) ---------- */
async function dataEspecial(el) {
  const s = $('#data-especial', el);
  const d = especial.deHoje();
  if (!s || !d) return;
  s.hidden = false;
  s.innerHTML = `<div class="banner"><span><b>${esc(d.nome)}</b><br>Tema especial ligado.<span id="conta-especial"></span></span></div>`;
  if (!d.pessoa) return;
  try {
    const p = await tmdb.pessoa(d.pessoa);
    const vistos = p.creditos.filter((c) => dados.titulo(c.tipo, c.id).visto).length;
    const alvo = $('#conta-especial', el);
    if (alvo) alvo.innerHTML = ` Você já viu <b style="font:inherit;font-weight:600;text-transform:none;letter-spacing:0">${vistos}</b> título${vistos === 1 ? '' : 's'} com <a href="#/pessoa/${p.id}">${esc(p.nome)}</a>.`;
  } catch { /* sem a contagem */ }
}

export function atualizar(el) {
  emAndamento(el).catch(() => {});
  sessoesJuntos(el).catch(() => {});
  atividade(el).catch(() => {});
}
/* ---------- atividade de vocês dois ---------- */
function linhaFeed(a) {
  const quem = a.eu ? 'Você' : esc(a.nome);
  let fez;
  if (a.nota != null) fez = `deu <span class="selo">${notaMinha(a.nota)}</span> para`;
  else if (a.visto) fez = 'viu';
  else if (a.seguindo) fez = a.eu ? 'está acompanhando' : 'está acompanhando';
  else if (a.curtido) fez = 'curtiu';
  else fez = 'marcou';
  return `<a class="li" href="#/${a.tipo}/${a.tmdb_id}">${poster(a, { tam: 'w154' })}
    <div><div class="s"><b style="color:var(--fg)">${quem}</b> ${fez}</div><div class="t">${esc(a.titulo)}${a.curtido ? ' <span class="heart">♥</span>' : ''}</div>${a.review_em ? '<div class="s">escreveu review</div>' : ''}</div>
    <span class="r">${new Date(a.atualizado_em).toLocaleDateString('pt-BR').slice(0, 5)}</span></a>`;
}

async function atividade(el) {
  const s = $('#atividade', el);
  if (!s || !nuvem.usuario()) return;
  const itens = await social.feed(12);
  if (!$('#atividade', el) || !itens.length) return;
  s.hidden = false;
  s.innerHTML = `<h2>Atividade <small>você e ${esc(nuvem.outro()?.nome || 'o outro')}</small></h2><div class="list">${itens.map(linhaFeed).join('')}</div>`;
}

/* ---------- página ---------- */
export function render(el) {
  if (!temChaves()) {
    semChaves(el);
    return;
  }
  el.innerHTML = `
    <section id="data-especial" hidden></section>
    <section><h2>Filme do dia <small>muda todo dia, igual para os dois</small></h2><div id="do-dia"><div class="hero"><div class="poster skel" style="--a:transparent;--b:transparent"></div><div class="info"><div class="skel tit"></div><div class="skel txt"></div><div class="skel txt" style="width:60%"></div></div></div></div></section>
    <section id="sessoes-juntos" hidden></section>
    <section id="em-andamento" hidden></section>
    <section id="atividade" hidden></section>
    <section><h2>Próximas estreias <small><a class="link" href="#/calendario/${hoje().slice(0, 7)}">ver calendário ›</a></small></h2><div id="estreias"><div class="skel txt"></div></div>
      <p class="note">"Juntos" é a data sugerida para vocês verem: a primeira terça-feira a partir da estreia.</p></section>
    <section><h2>Em cartaz no Brasil <small>juntos: ${dataCurta(proximaTerca(''))}</small></h2><div id="cartaz">${esqueleto()}</div></section>
    <section><h2>Filmes em alta <small>esta semana</small></h2><div id="alta-filmes">${esqueleto()}</div></section>
    <section><h2>Séries em alta <small>esta semana</small></h2><div id="alta-series">${esqueleto()}</div></section>
    <p class="note">Este app usa a API do TMDB, mas não é endossado nem certificado pelo TMDB.</p>${carinha('inicio')}`;
  atualizar(el);
  dataEspecial(el).catch(() => {});

  // toques nos cartões de série e nas sessões juntos
  el.onclick = async (e) => {
    const b = e.target.closest('button[data-acao]');
    if (!b) return;
    if (b.dataset.acao === 'ver-ep') {
      b.disabled = true;
      dados.marcarEpisodios(b.dataset.serie, [{ t: Number(b.dataset.t), e: Number(b.dataset.e) }], true);
      toast(`${cod(b.dataset.t, b.dataset.e)} visto`);
      emAndamento(el).catch(() => {});
    } else if (b.dataset.acao === 'cancelar-sessao') {
      await social.cancelarSessao(Number(b.dataset.id));
      toast('Sessão cancelada');
      sessoesJuntos(el).catch(() => {});
    } else if (b.dataset.acao === 'vimos') {
      const x = social.sessoesJuntos().find((y) => y.id === Number(b.dataset.id));
      if (!x) return;
      const r = (await dados.resumos([x])).get(`${x.tipo}:${x.tmdb_id}`) || {};
      const ok = await social.vimosJuntos(x, { tipo: x.tipo, id: x.tmdb_id, titulo: r.titulo || '', ano: r.ano ?? null, data: r.data || '', poster: r.poster || '', duracao: r.duracao || 0, tmdb: r.nota || 0, pop: r.pop || 0, generos: r.generos || [] });
      toast(ok ? 'Entrou no seu diário. Dê a sua nota na ficha.' : 'Não deu para gravar');
      sessoesJuntos(el).catch(() => {});
      if (ok) location.hash = `#/${x.tipo}/${x.tmdb_id}`;
    }
  };

  const erroTexto = (erro) => `<p class="note">${erro?.status === 401 ? 'A chave do TMDB foi recusada. Confira no Perfil.' : 'Não deu para carregar. Confira a internet.'}</p>`;
  const por = (sel, promessa, desenha) => promessa.then((lista) => {
    const alvo = $(sel, el);
    if (alvo) alvo.innerHTML = lista.length ? desenha(lista) : '<p class="note">Nada por enquanto.</p>';
  }).catch((erro) => {
    const alvo = $(sel, el);
    if (alvo) alvo.innerHTML = erroTexto(erro);
  });

  filmeDoDia().then((d) => {
    const alvo = $('#do-dia', el);
    if (alvo) alvo.innerHTML = d ? cartaoDoDia(d) : '<p class="note">Sem sugestão hoje.</p>';
  }).catch((erro) => { const alvo = $('#do-dia', el); if (alvo) alvo.innerHTML = erroTexto(erro); });

  const fileira = (lista) => `<div class="row">${lista.slice(0, 18).map((c) => tile(c)).join('')}</div>`;
  por('#estreias', tmdb.estreias(), (lista) => `<div class="list">${lista.slice(0, 6).map((c) => `
    <a class="li" href="${link(c)}">${poster(c, { tam: 'w154' })}
      <div><div class="t">${esc(c.titulo)}</div><div class="s">Estreia ${dataCurta(c.data)} · ${contagem(c.data)}${avisos.pediuAviso(c.id) ? ' · aviso ligado' : ''}</div></div>
      <span class="r">juntos<br><b class="junto">${dataCurta(proximaTerca(c.data))}</b></span></a>`).join('')}</div>`);
  por('#cartaz', tmdb.emCartaz(), fileira);
  por('#alta-filmes', tmdb.emAlta('filme'), fileira);
  por('#alta-series', tmdb.emAlta('serie'), fileira);
}
