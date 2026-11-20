// Página da série: dados gerais, progresso, temporadas e episódios (estilo TV Time).
import * as tmdb from '../tmdb.js';
import * as omdb from '../omdb.js';
import * as dados from '../dados.js';
import * as nuvem from '../nuvem.js';
import { grupoSocial, botaoRever, tocarExtra, montarReviews, montarCuriosidades } from './comum.js';
import { simboloEscondido } from '../ovo.js';
import { secaoComunidade } from './reviews.js';
import { $, esc, nota, notaMinha, selo, blocoNota, ligarReguas, poster, elencoJunto, tile, blocoNotas, blocoProvedores, erroFicha, toast, perguntar, dataCurta, contagem, hoje, corDe, IC } from '../ui.js';
import { img } from '../tmdb.js';
import { secaoPremios, classificacao } from './filme.js';

const cod = (t, e) => `S${String(t).padStart(2, '0')} E${String(e).padStart(2, '0')}`;

export async function abrir(el, id, ctx) {
  let s;
  try { s = await tmdb.serie(id); } catch (erro) { if (ctx.vivo()) el.innerHTML = erroFicha(erro); return; }
  if (!ctx.vivo()) return;

  const meta = { tipo: 'serie', id: s.id, titulo: s.titulo, ano: s.ano, data: s.data, poster: s.poster, tmdb: s.nota, pop: s.pop, generos: s.generos };
  const carregadas = new Map();   // nº da temporada -> dados da temporada
  const abertas = new Set();      // temporadas expandidas
  let epAberto = '';              // "2x3" com sinopse e nota à mostra
  let notasFora = null;
  let carregandoNotas = Boolean(s.imdbId);
  const meu = () => dados.titulo('serie', s.id);
  const vistos = () => dados.episodios(s.id);
  const numeradas = s.temporadas.filter((t) => t.n > 0);
  const ultimaT = s.ultimo?.t ?? 0;

  /* ----- o que já foi ao ar ----- */
  // Com a temporada carregada, vale a data de cada episódio; sem ela, vale o "último episódio exibido" da série.
  function noAr(t) {
    const c = carregadas.get(t);
    if (c) return c.episodios.filter((e) => e.data && e.data <= hoje()).map((e) => e.n);
    const info = s.temporadas.find((x) => x.n === t);
    if (!info || !s.ultimo) return [];
    if (t === 0) return Array.from({ length: info.episodios }, (_, i) => i + 1);
    const n = t < ultimaT ? info.episodios : t === ultimaT ? s.ultimo.e : 0;
    return Array.from({ length: n }, (_, i) => i + 1);
  }
  const todosNoAr = () => numeradas.flatMap((t) => noAr(t.n).map((e) => ({ t: t.n, e })));
  const vistosDa = (t) => noAr(t).filter((e) => vistos()[`${t}x${e}`]).length;
  /** O próximo para a pessoa é o episódio seguinte ao ÚLTIMO que ela viu (mesmo que haja anteriores sem marcar). */
  const proximoParaVer = () => {
    const lista = todosNoAr();
    let ultimo = -1;
    lista.forEach((x, i) => { if (vistos()[`${x.t}x${x.e}`]) ultimo = i; });
    return lista[ultimo + 1] || null;
  };
  /** Episódios já exibidos, anteriores a (t, e), que ainda não estão marcados. */
  const anterioresSemMarcar = (t, e) => todosNoAr().filter((x) => (x.t < t || (x.t === t && x.e < e)) && !vistos()[`${x.t}x${x.e}`]);
  /** Ao marcar um episódio no meio da série, pergunta se os anteriores também foram vistos. */
  async function oferecerAnteriores(t, e) {
    const faltam = anterioresSemMarcar(t, e);
    if (!faltam.length) return;
    const temporadas = new Set(faltam.map((x) => x.t)).size;
    const sim = await perguntar({
      titulo: 'E os anteriores?',
      texto: `Você marcou ${cod(t, e)}. Posso considerar como vistos os ${faltam.length} episódio${faltam.length > 1 ? 's' : ''} anteriores${temporadas > 1 ? `, de ${temporadas} temporadas` : ''}?`,
      sim: `Sim, marcar os ${faltam.length} anteriores`,
      nao: 'Não, só este',
    });
    if (!sim || !ctx.vivo()) return;
    dados.marcarEpisodios(s.id, faltam, true);
    redesenhar();
    prepararProximo();
    toast(`${faltam.length} episódio${faltam.length > 1 ? 's' : ''} anteriores marcado${faltam.length > 1 ? 's' : ''}`);
  }
  /** Próximo episódio que ainda vai ao ar (data já anunciada). */
  function inedito() {
    for (const c of carregadas.values()) {
      const e = c.n > 0 && c.episodios.find((x) => x.data > hoje());
      if (e) return { t: c.n, e: e.n, data: e.data, nome: e.nome };
    }
    return s.proximo && s.proximo.data >= hoje() ? s.proximo : null;
  }

  async function carregar(t) {
    if (!carregadas.has(t)) carregadas.set(t, await tmdb.temporada(s.id, t, { recente: s.emExibicao && t >= ultimaT }));
    return carregadas.get(t);
  }

  /* ----- blocos ----- */
  const acoes = () => {
    const m = meu();
    return `
    <div class="acts">
      <button class="act seen ${m.seguindo ? 'on' : ''}" data-acao="seguir">${IC.sino}${m.seguindo ? 'Acompanhando' : 'Acompanhar'}</button>
      <button class="act like ${m.curtido ? 'on' : ''}" data-acao="curtir">${IC.coracao}${m.curtido ? 'Curtida' : 'Curtir'}</button>
      <button class="act list ${m.quero ? 'on' : ''}" data-acao="quero">${IC.relogio}${m.quero ? 'Na lista' : 'Quero ver'}</button>
    </div>
    ${blocoNota(m.nota, 'Sua nota', 'data-alvo="serie"')}
    ${botaoRever(m)}`;
  };
  const notas = () => blocoNotas(meu().nota, s.nota, notasFora, carregandoNotas);

  function progresso() {
    const lista = todosNoAr();
    const total = lista.length;
    const n = lista.filter((x) => vistos()[`${x.t}x${x.e}`]).length;
    const prox = proximoParaVer();
    const novo = inedito();
    const linhaNovo = novo ? `<p><b style="color:var(--fg)">Próximo episódio inédito ${contagem(novo.data)}</b> · ${cod(novo.t, novo.e)} · ${dataCurta(novo.data)}</p>` : '';
    if (!total) {
      return `<div class="card"><p><b style="color:var(--fg)">Ainda não estreou.</b></p>${linhaNovo}</div>`;
    }
    // episódios anteriores ao último visto que ficaram sem marcar (quem começou a marcar pelo meio)
    const vistosNaOrdem = lista.filter((x) => vistos()[`${x.t}x${x.e}`]);
    const ultimoVisto = vistosNaOrdem[vistosNaOrdem.length - 1];
    const buracos = ultimoVisto ? anterioresSemMarcar(ultimoVisto.t, ultimoVisto.e).length : 0;
    const linhaBuracos = buracos ? `<div class="entre" style="align-items:center"><span style="color:var(--muted)">${buracos} episódio${buracos > 1 ? 's' : ''} anterior${buracos > 1 ? 'es' : ''} sem marcar</span><button class="btn small" data-acao="marcar-anteriores">Já vi todos</button></div>` : '';
    let corpo;
    if (prox) {
      const ep = carregadas.get(prox.t)?.episodios.find((x) => x.n === prox.e);
      const anterior = numeradas[numeradas.findIndex((x) => x.n === prox.t) - 1];
      const acabouDeFechar = n > 0 && anterior && prox.e === noAr(prox.t)[0] && vistosDa(anterior.n) === noAr(anterior.n).length;
      corpo = `${acabouDeFechar ? `<p class="ok">Temporada ${anterior.n} concluída.</p>` : ''}
        <div class="prox">
          <div class="still">${ep?.still ? `<img src="${img(ep.still, 'w300')}" alt="" loading="lazy" crossorigin="anonymous" onerror="this.remove()">` : ''}${ep?.nota ? `<span class="nt">${nota(ep.nota)}</span>` : ''}</div>
          <div style="min-width:0"><div class="eyebrow">${n ? 'Próximo para você' : 'Comece por aqui'}</div>
            <div class="ep-cod">${cod(prox.t, prox.e)}${ep?.duracao ? ` · ${ep.duracao}m` : ''}</div>
            <div class="ep-nome">${ep ? esc(ep.nome) : '<span class="skel txt" style="display:block;width:70%"></span>'}</div>
            <div class="ep-data">${ep?.data ? dataCurta(ep.data) : ''}</div></div>
        </div>
        <button class="btn on-seen" data-acao="ver-proximo">✓ Marcar ${cod(prox.t, prox.e)} como visto</button>`;
    } else {
      corpo = `<p class="ok"><b>${buracos ? 'Você chegou ao último episódio que já saiu.' : s.acabou ? 'Série concluída. Você viu tudo.' : 'Série em dia. Você viu tudo que já saiu.'}</b></p>`;
    }
    return `<div class="card">
      <div class="entre"><span>Você viu <b>${n}</b> de ${total} episódios</span><span>${Math.round((n / total) * 100)}%</span></div>
      <div class="lbar-big"><i style="width:${(n / total) * 100}%"></i></div>
      ${corpo}${linhaBuracos}${linhaNovo}</div>`;
  }

  function cabecalhoTemp(t) {
    const exibidos = noAr(t.n).length;
    const v = vistosDa(t.n);
    const anuncio = !t.episodios ? 'anunciada' : `${t.episodios} episódio${t.episodios > 1 ? 's' : ''}${t.data ? ` · ${t.data.slice(0, 4)}` : ''}`;
    const minha = dados.notaTemporada(s.id, t.n);
    return `<button class="temp-h" data-acao="temporada" data-t="${t.n}" aria-expanded="${abertas.has(t.n)}">
      ${poster({ titulo: t.nome, poster: t.poster || s.poster }, { tam: 'w154' })}
      <div style="min-width:0"><div class="t">${esc(t.nome)}${t.apelido ? ` <span class="s">· ${esc(t.apelido)}</span>` : ''}</div>
        <div class="s">${anuncio}${minha != null ? ` · sua nota ${selo(minha)}` : ''}</div>
        ${exibidos ? `<div class="bar"><i style="width:${(v / exibidos) * 100}%"></i></div>` : ''}</div>
      <span class="s" style="display:flex;gap:8px;align-items:center">${exibidos ? `${v}/${exibidos}` : ''}<span class="seta">›</span></span></button>`;
  }

  function corpoTemp(t) {
    const c = carregadas.get(t.n);
    if (!c) return `<div class="temp-c"><div class="skel txt"></div><div class="skel txt" style="width:80%"></div><div class="skel txt" style="width:60%"></div></div>`;
    if (!c.episodios.length) return `<div class="temp-c"><p class="note" style="padding-bottom:8px">Os episódios ainda não foram divulgados.</p></div>`;
    const exibidos = noAr(t.n);
    const tudoVisto = exibidos.length > 0 && vistosDa(t.n) === exibidos.length;
    return `<div class="temp-c">
      <div class="temp-a">
        <button class="btn small ${tudoVisto ? 'on-seen' : ''}" data-acao="temporada-inteira" data-t="${t.n}" ${exibidos.length ? '' : 'disabled'}>${tudoVisto ? '✓ Temporada vista' : 'Marcar temporada inteira'}</button>
      </div>
      ${exibidos.length ? blocoNota(dados.notaTemporada(s.id, t.n), 'Sua nota para a temporada', `data-alvo="temporada" data-t="${t.n}"`) : ''}
      ${c.episodios.map((e) => episodio(t.n, e)).join('')}</div>`;
  }

  function episodio(t, e) {
    const k = `${t}x${e.n}`;
    const reg = vistos()[k];
    const futuro = !e.data || e.data > hoje();
    const aberto = epAberto === k;
    return `<div class="ep${futuro ? ' futuro' : ''}" data-k="${k}">
      <button class="still" data-acao="episodio" data-k="${k}" aria-label="Detalhes de ${esc(e.nome)}">${e.still ? `<img src="${img(e.still, 'w300')}" alt="" loading="lazy" crossorigin="anonymous" onerror="this.remove()">` : ''}${e.nota && e.votos ? `<span class="nt">${nota(e.nota)}</span>` : ''}</button>
      <button class="meio" data-acao="episodio" data-k="${k}">
        <div class="ep-cod">${cod(t, e.n)}${e.duracao ? ` · ${e.duracao}m` : ''}${e.final ? ' · final' : ''}</div>
        <div class="ep-nome">${esc(e.nome)}</div>
        <div class="ep-data">${e.data ? (futuro ? `estreia ${dataCurta(e.data)}` : dataCurta(e.data)) : 'sem data'}${reg?.r != null ? ` · sua nota ${selo(reg.r)}` : ''}${reg?.v > 1 ? ` · <span class="rev" title="Visto ${reg.v} vezes">${IC.rever}${reg.v}×</span>` : ''}</div>
      </button>
      <div class="ep-b">
        <button class="ic ${reg ? 'on' : ''}" data-acao="ver" data-t="${t}" data-e="${e.n}" ${futuro ? 'disabled' : ''} aria-label="${reg ? 'Desmarcar' : 'Marcar como visto'}" aria-pressed="${Boolean(reg)}">${IC.olho}</button>
        <button class="ic ${reg?.r != null ? 'nota' : ''}" data-acao="episodio" data-k="${k}" ${futuro ? 'disabled' : ''} aria-label="Dar nota">${IC.lapis}</button>
      </div>
      ${aberto ? `<div class="ep-x">${e.sinopse ? `<p>${esc(e.sinopse)}</p>` : '<p>Sem sinopse no TMDB.</p>'}
        ${futuro ? '' : blocoNota(reg?.r, 'Sua nota para o episódio', `data-alvo="episodio" data-t="${t}" data-e="${e.n}"`)}
        ${reg ? `<div class="actions" style="align-items:center"><button class="btn small rever" data-acao="rever-ep" data-t="${t}" data-e="${e.n}">${IC.rever}Vi de novo</button>${reg.v > 1 ? `<span class="note">Visto ${reg.v} vezes</span><button class="texto" data-acao="rever-ep-menos" data-t="${t}" data-e="${e.n}">tirar uma</button>` : ''}</div>` : ''}
        ${e.nota && e.votos ? `<p class="note">Média no TMDB: ${nota(e.nota)} (${e.votos} voto${e.votos > 1 ? 's' : ''})</p>` : ''}</div>` : ''}
    </div>`;
  }

  const temporadas = () => s.temporadas.map((t) => `<div class="temp${abertas.has(t.n) ? ' aberta' : ''}" data-temp="${t.n}">${cabecalhoTemp(t)}${abertas.has(t.n) ? corpoTemp(t) : ''}</div>`).join('');

  function redesenhar() {
    $('#acoes', el).innerHTML = acoes();
    $('#notas', el).innerHTML = notas();
    $('#dupla', el).innerHTML = grupoSocial(meta);
    $('#progresso', el).innerHTML = progresso();
    $('#temporadas', el).innerHTML = temporadas();
  }

  /* ----- página ----- */
  const [a, b] = corDe(s.titulo);
  const anos = s.ano ? (s.acabou ? (s.anoFim && s.anoFim !== s.ano ? `${s.ano}–${s.anoFim}` : `${s.ano}`) : `${s.ano}–`) : '';
  const nTemps = numeradas.filter((t) => t.episodios).length;
  const linhaSub = [
    [anos, s.status].filter(Boolean).join(' · '),
    [nTemps ? `${nTemps} temporada${nTemps > 1 ? 's' : ''}` : '', s.duracao ? `${s.duracao} min` : '', classificacao(s.classificacao)].filter(Boolean).join(' · '),
    [s.emissoras.slice(0, 2).join(', '), ...s.generos.slice(0, 2)].filter(Boolean).join(' · '),
    s.criadores.length ? `Criação ${s.criadores.slice(0, 2).map((c) => `<a href="#/pessoa/${c.id}">${esc(c.nome)}</a>`).join(', ')}` : '',
  ].filter(Boolean).join('<br>');

  el.innerHTML = `
   <div class="backdrop" style="--a:${a};--b:${b}">${s.fundo ? `<img src="${img(s.fundo, 'w780')}" alt="" crossorigin="anonymous" onerror="this.remove()">` : ''}</div>
   <button class="back" data-acao="voltar" aria-label="Voltar">‹</button>
   <div class="wrap">
    <div class="head"><div style="min-width:0"><h1>${esc(s.titulo)}</h1>
      <div class="sub">${linhaSub}${s.tituloBR ? `<br><span class="br">No Brasil: ${esc(s.tituloBR)}</span>` : ''}</div></div>${poster(s, { lg: true })}</div>
    <div class="scores" id="notas">${notas()}</div>
    <div id="acoes" style="display:flex;flex-direction:column;gap:22px">${acoes()}</div>
    <div id="dupla">${grupoSocial(meta)}</div>
    ${s.sinopse ? `<section class="sinopse"><p class="syn clamp">${esc(s.sinopse)}</p><button class="mais" data-acao="abrir-texto">Ler mais</button></section>` : '<p class="note">Sem sinopse no TMDB.</p>'}
    <section><h2>Seu progresso</h2><div id="progresso">${progresso()}</div></section>
    <section><h2>Temporadas <small>toque para ver os episódios</small></h2><div id="temporadas">${temporadas()}</div>
      ${nuvem.usuario() ? '' : '<p class="note">Sem login, o que você marca fica salvo só neste aparelho.</p>'}</section>
    ${s.elenco.length || s.criadores.length ? `<section><h2>Elenco e criação</h2><div class="heads">${elencoJunto(s.criadores, 'Criação', s.elenco, (p) => p.papel || (p.eps ? `${p.eps} eps` : ''))}</div></section>` : ''}
    <section><h2>Onde assistir <small>no Brasil</small></h2>${blocoProvedores(s.provedores)}</section>
    <section id="premios" hidden></section>
    <section id="curiosidades" hidden></section>
    ${nuvem.usuario() ? '<section id="reviews-nossas"></section>' : ''}
    <section id="reviews-comunidade" hidden></section>
    ${s.parecidos.length ? `<section><h2>Séries parecidas</h2><div class="row">${s.parecidos.map((c) => tile(c)).join('')}</div></section>` : ''}
    <p class="note">Dados e imagens: TMDB. Notas IMDb, Rotten Tomatoes e Metacritic: OMDb. Prêmios: OMDb e Wikidata.</p>${simboloEscondido('ficha')}
   </div>`;
  // a sinopse curta não precisa do "ler tudo"
  const syn = $('.syn', el);
  if (syn && syn.scrollHeight <= syn.clientHeight + 2) { syn.classList.remove('clamp'); syn.nextElementSibling?.remove(); }

  /* ----- toques ----- */
  const acompanhar = () => { if (!meu().seguindo) dados.marcar(meta, { seguindo: true, quero: false }); };

  // nota de 0 a 10 da série, da temporada ou do episódio (r = null tira a nota); `alvo` são os data-* do bloco
  async function darNota(r, alvo) {
    if (alvo.alvo === 'serie') {
      dados.marcar(meta, { nota: r });
      toast(r == null ? 'Nota removida' : `Nota ${notaMinha(r)} salva`);
    } else if (alvo.alvo === 'temporada') {
      dados.darNotaTemporada(s.id, Number(alvo.t), r);
      toast(r == null ? 'Nota removida' : `Temporada ${alvo.t}: nota ${notaMinha(r)}`);
    } else {
      const k = `${alvo.t}x${alvo.e}`;
      const eraNovo = !vistos()[k];
      dados.darNotaEpisodio(s.id, Number(alvo.t), Number(alvo.e), r);
      acompanhar();
      toast(r == null ? 'Nota removida' : `${cod(alvo.t, alvo.e)}: nota ${notaMinha(r)}`);
      if (eraNovo) { redesenhar(); await oferecerAnteriores(Number(alvo.t), Number(alvo.e)); prepararProximo(); return; }
    }
    redesenhar();
  }
  ligarReguas(el, (r, regua) => darNota(r, regua.closest('.rate').dataset));

  el.onclick = async (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    const acao = t.dataset.acao;
    const m = meu();
    if (await tocarExtra(acao, meta, t)) { redesenhar(); return; }

    if (t.dataset.r === 'tirar') { await darNota(null, t.closest('.rate').dataset); return; }
    if (acao === 'rever-ep' || acao === 'rever-ep-menos') {
      const v = dados.reverEpisodio(s.id, Number(t.dataset.t), Number(t.dataset.e), acao === 'rever-ep' ? 1 : -1);
      toast(acao === 'rever-ep' ? `${cod(t.dataset.t, t.dataset.e)}: visto ${v} vezes` : `${cod(t.dataset.t, t.dataset.e)}: ${v > 1 ? `visto ${v} vezes` : 'visto uma vez'}`);
      redesenhar();
      return;
    }
    if (acao === 'seguir') {
      dados.marcar(meta, { seguindo: !m.seguindo, ...(m.seguindo ? {} : { quero: false }) });
      toast(m.seguindo ? 'Você deixou de acompanhar' : 'Acompanhando a série');
      redesenhar();
    } else if (acao === 'curtir') {
      dados.marcar(meta, { curtido: !m.curtido });
      redesenhar();
    } else if (acao === 'quero') {
      dados.marcar(meta, { quero: !m.quero });
      toast(m.quero ? 'Removida do Quero ver' : 'Adicionada ao Quero ver');
      redesenhar();
    } else if (acao === 'temporada') {
      const n = Number(t.dataset.t);
      if (abertas.has(n)) { abertas.delete(n); redesenhar(); return; }
      abertas.add(n);
      redesenhar();
      try { await carregar(n); } catch { abertas.delete(n); toast('Não deu para carregar a temporada'); }
      if (ctx.vivo()) redesenhar();
    } else if (acao === 'episodio') {
      epAberto = epAberto === t.dataset.k ? '' : t.dataset.k;
      redesenhar();
    } else if (acao === 'ver') {
      const ep = { t: Number(t.dataset.t), e: Number(t.dataset.e) };
      const ja = Boolean(vistos()[`${ep.t}x${ep.e}`]);
      dados.marcarEpisodios(s.id, [ep], !ja);
      if (!ja) acompanhar();
      redesenhar();
      if (!ja) { avisarFim(ep.t); await oferecerAnteriores(ep.t, ep.e); }
      prepararProximo();
    } else if (acao === 'marcar-anteriores') {
      const feitos = todosNoAr().filter((x) => vistos()[`${x.t}x${x.e}`]);
      const ultimo = feitos[feitos.length - 1];
      if (!ultimo) return;
      const faltam = anterioresSemMarcar(ultimo.t, ultimo.e);
      dados.marcarEpisodios(s.id, faltam, true);
      redesenhar();
      toast(`${faltam.length} episódio${faltam.length > 1 ? 's' : ''} anteriores marcado${faltam.length > 1 ? 's' : ''}`);
    } else if (acao === 'temporada-inteira') {
      const n = Number(t.dataset.t);
      const exibidos = noAr(n);
      const tudoVisto = vistosDa(n) === exibidos.length;
      dados.marcarEpisodios(s.id, exibidos.map((x) => ({ t: n, e: x })), !tudoVisto);
      if (!tudoVisto) acompanhar();
      redesenhar();
      toast(tudoVisto ? `Temporada ${n} desmarcada` : `Temporada ${n}: ${exibidos.length} episódios vistos`);
      if (!tudoVisto && exibidos.length) await oferecerAnteriores(n, exibidos[0]);
      prepararProximo();
    } else if (acao === 'ver-proximo') {
      const prox = proximoParaVer();
      if (!prox) return;
      dados.marcarEpisodios(s.id, [prox], true);
      acompanhar();
      redesenhar();
      avisarFim(prox.t) || toast(`${cod(prox.t, prox.e)} visto`);
      prepararProximo();
    }
  };

  /** Avisa quando o episódio marcado fechou a temporada ou a série. */
  function avisarFim(t) {
    if (!proximoParaVer()) { toast(s.acabou ? 'Série concluída' : 'Série em dia'); return true; }
    const exibidos = noAr(t);
    if (exibidos.length && vistosDa(t) === exibidos.length) { toast(`Temporada ${t} concluída`); return true; }
    return false;
  }

  /** Carrega a temporada do próximo episódio para mostrar nome, imagem e data no cartão de progresso. */
  async function prepararProximo() {
    const prox = proximoParaVer();
    const alvo = prox?.t ?? (s.emExibicao ? ultimaT : null);
    if (alvo == null || carregadas.has(alvo)) return;
    try { await carregar(alvo); } catch { return; }
    if (ctx.vivo()) redesenhar();
  }

  montarReviews(el, ctx, meta, () => redesenhar());
  montarCuriosidades(el, ctx, s.imdbId);
  secaoComunidade(el, ctx, 'serie', s.id);

  // abre a temporada em que a pessoa está (ou a primeira, se ainda não começou)
  const comeco = proximoParaVer();
  if (comeco && Object.keys(vistos()).length) abertas.add(comeco.t);
  await prepararProximo();
  if (!ctx.vivo()) return;
  redesenhar();

  omdb.notas(s.imdbId).then((n) => {
    if (!ctx.vivo()) return;
    notasFora = n;
    carregandoNotas = false;
    $('#notas', el).innerHTML = notas();
    secaoPremios(el, ctx, s.imdbId, n?.premios);
  });
}
