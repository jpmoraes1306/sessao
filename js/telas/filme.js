// Ficha do filme.
import * as tmdb from '../tmdb.js';
import * as omdb from '../omdb.js';
import * as wikidata from '../wikidata.js';
import * as dados from '../dados.js';
import * as nuvem from '../nuvem.js';
import * as avisos from '../avisos.js';
import { grupoSocial, tocarExtra, montarReviews, montarCuriosidades } from './comum.js';
import { carinha } from '../ovo.js';
import { $, esc, nota, notaMinha, selo, blocoNota, ligarReguas, poster, headshot, tile, linha, blocoNotas, blocoProvedores, blocoReviews, erroFicha, toast, duracao, dataCurta, proximaTerca, dolares, hoje, corDe, IC } from '../ui.js';
import { img } from '../tmdb.js';

export const classificacao = (c) => (c ? (c === 'L' ? 'Livre' : /^\d+$/.test(c) ? `${c} anos` : c) : '');

/** A OMDb só devolve o resumo de prêmios em inglês; os termos são fixos, então dá para traduzir. */
export function traduzPremios(t) {
  return t
    .replace(/Won (\d+) Oscars?/i, (_, n) => `Ganhou ${n} Oscar${n > 1 ? 's' : ''}`)
    .replace(/Nominated for (\d+) Oscars?/i, (_, n) => `Indicado a ${n} Oscar${n > 1 ? 's' : ''}`)
    .replace(/Won (\d+) Primetime Emmys?/i, (_, n) => `Ganhou ${n} Emmy${n > 1 ? 's' : ''}`)
    .replace(/Nominated for (\d+) Primetime Emmys?/i, (_, n) => `Indicada a ${n} Emmy${n > 1 ? 's' : ''}`)
    .replace(/Won (\d+) BAFTA( Film)? Awards?/i, (_, n) => `Ganhou ${n} BAFTA${n > 1 ? 's' : ''}`)
    .replace(/Nominated for (\d+) BAFTA( Film)? Awards?/i, (_, n) => `Indicado a ${n} BAFTA${n > 1 ? 's' : ''}`)
    .replace(/Won (\d+) Golden Globes?/i, (_, n) => `Ganhou ${n} Globo${n > 1 ? 's' : ''} de Ouro`)
    .replace(/Nominated for (\d+) Golden Globes?/i, (_, n) => `Indicado a ${n} Globo${n > 1 ? 's' : ''} de Ouro`)
    .replace(/(\d+) wins?/i, (_, n) => `${n} prêmio${n > 1 ? 's' : ''}`)
    .replace(/(\d+) nominations?/i, (_, n) => `${n} indicaç${n > 1 ? 'ões' : 'ão'}`)
    .replace(/\s*&\s*/g, ' e ').replace(/ total/i, ' no total');
}

/** Seção "Prêmios": resumo (OMDb) que abre a lista com nome e ano de cada prêmio (Wikidata).
    Usada pela ficha do filme e pela página da série. */
export function secaoPremios(el, ctx, imdbId, resumo) {
  const sec = $('#premios', el);
  if (!sec || !resumo) return;
  let aberta = false;
  let lista; // undefined = ainda não buscou; null = não achou
  const linhaPremio = (p) => `<div class="premio"><span class="pill ${p.venceu ? 'venceu' : ''}">${p.venceu ? 'Venceu' : 'Indicado'}</span><div><div class="t">${esc(p.nome)}</div><div class="s">${[p.ano, p.quem.slice(0, 3).join(', ')].filter(Boolean).map(esc).join(' · ')}</div></div></div>`;
  const desenhar = () => {
    let corpo = '';
    if (aberta) {
      if (lista === undefined) corpo = '<div class="skel txt"></div><div class="skel txt" style="width:70%"></div>';
      else if (!lista?.length) corpo = '<p class="note">O Wikidata ainda não tem a lista detalhada deste título.</p>';
      else {
        const v = lista.filter((p) => p.venceu).length;
        corpo = `<p class="note">${v} prêmio${v === 1 ? '' : 's'} e ${lista.length - v} indicaç${lista.length - v === 1 ? 'ão' : 'ões'} com detalhe, dos mais importantes para os menores.</p>
          ${lista.map(linhaPremio).join('')}
          <p class="note">Lista: Wikidata. Traz os prêmios principais; os de festivais menores podem faltar.</p>`;
      }
    }
    sec.hidden = false;
    sec.innerHTML = `<h2>Prêmios</h2><div class="card premios${aberta ? ' aberta' : ''}">
      <button class="premios-h" data-acao="premios" aria-expanded="${aberta}"><span>${esc(traduzPremios(resumo))}</span><span class="seta">›</span></button>
      ${aberta ? `<div class="premios-c">${corpo}</div>` : ''}</div>
      ${aberta ? '' : '<p class="note">Toque para ver quais são e de que ano.</p>'}`;
  };
  sec.onclick = async (e) => {
    if (!e.target.closest('[data-acao="premios"]')) return;
    aberta = !aberta;
    desenhar();
    if (aberta && lista === undefined) {
      lista = await wikidata.premios(imdbId);
      if (ctx.vivo()) desenhar();
    }
  };
  desenhar();
}

export async function abrir(el, id, ctx) {
  let f;
  try { f = await tmdb.filme(id); } catch (erro) { if (ctx.vivo()) el.innerHTML = erroFicha(erro); return; }
  if (!ctx.vivo()) return;

  const meta = { tipo: 'filme', id: f.id, titulo: f.titulo, ano: f.ano, data: f.data, poster: f.poster, duracao: f.duracao, tmdb: f.nota, pop: f.pop, generos: f.generos };
  let notasFora = null;
  let carregandoNotas = Boolean(f.imdbId);
  const meu = () => dados.titulo('filme', f.id);
  const [a, b] = corDe(f.titulo);
  const dir = f.diretores[0];
  const aindaNaoSaiu = f.data > hoje() || (!f.data && f.status !== 'Released');

  // regra da terça: vale para o que ainda vai estrear no Brasil e para o que estreou há pouco (em cartaz)
  const estreia = f.estreiaBR || f.data;
  const haDias = estreia ? Math.round((new Date(hoje()) - new Date(estreia)) / 864e5) : 999;
  const noCinema = estreia && haDias <= 42;
  const terca = noCinema ? proximaTerca(estreia) : '';

  const acoes = () => {
    const m = meu();
    return `
    <div class="acts">
      <button class="act seen ${m.visto ? 'on' : ''}" data-acao="visto">${IC.olho}${m.visto ? 'Visto' : 'Assistir'}</button>
      <button class="act like ${m.curtido ? 'on' : ''}" data-acao="curtir">${IC.coracao}${m.curtido ? 'Curtido' : 'Curtir'}</button>
      <button class="act list ${m.quero ? 'on' : ''}" data-acao="quero">${IC.relogio}${m.quero ? 'Na lista' : 'Quero ver'}</button>
    </div>
    ${blocoNota(m.nota)}`;
  };
  const social = () => grupoSocial(meta, { estreia: noCinema ? estreia : '' });
  const notas = () => blocoNotas(meu().nota, f.nota, notasFora, carregandoNotas);

  function dinheiro() {
    if (!f.orcamento && !f.bilheteria && !notasFora?.bilheteria) return '';
    const max = Math.max(f.orcamento, f.bilheteria, 1);
    const barra = (rotulo, v, cor) => (v ? `<div class="grana"><div class="entre"><span>${rotulo}</span><b>${dolares(v)}</b></div><div class="lbar-big"><i style="width:${Math.max(2, (v / max) * 100)}%;background:${cor}"></i></div></div>` : '');
    const vezes = f.orcamento && f.bilheteria ? f.bilheteria / f.orcamento : 0;
    const veredito = vezes ? (vezes >= 1
      ? `Arrecadou <b style="color:var(--fg)">${vezes.toFixed(1).replace('.', ',')}×</b> o orçamento.`
      : `Arrecadou só <b style="color:var(--fg)">${Math.round(vezes * 100)}%</b> do orçamento.`) : '';
    const eua = notasFora?.bilheteria ? `Nos EUA: ${esc(notasFora.bilheteria.replace(/,/g, '.').replace('$', 'US$ '))}.` : '';
    return `<h2>Orçamento × bilheteria</h2><div class="card">
      ${barra('Orçamento', f.orcamento, 'var(--list)')}${barra('Bilheteria mundial', f.bilheteria, 'var(--seen)')}
      ${veredito || eua ? `<p>${[veredito, eua].filter(Boolean).join(' ')}</p>` : ''}
      ${!f.orcamento || !f.bilheteria ? `<p class="note">O TMDB não tem ${!f.orcamento ? 'o orçamento' : 'a bilheteria mundial'} deste filme.</p>` : ''}</div>`;
  }

  const linhaSub = [
    [f.ano || (aindaNaoSaiu ? 'Em breve' : ''), f.diretores.length ? `Direção ${f.diretores.slice(0, 2).map((d) => `<a href="#/pessoa/${d.id}">${esc(d.nome)}</a>`).join(', ')}` : ''].filter(Boolean).join(' · '),
    [f.duracao ? duracao(f.duracao) : '', classificacao(f.classificacao), ...f.generos.slice(0, 3)].filter(Boolean).join(' · '),
  ].filter(Boolean).join('<br>');

  el.innerHTML = `
   <div class="backdrop" style="--a:${a};--b:${b}">${f.fundo ? `<img src="${img(f.fundo, 'w780')}" alt="" crossorigin="anonymous" onerror="this.remove()">` : ''}</div>
   <button class="back" data-acao="voltar" aria-label="Voltar">‹</button>
   <div class="wrap">
    <div class="head"><div style="min-width:0"><h1>${esc(f.titulo)}</h1>
      <div class="sub">${linhaSub}${f.tituloBR ? `<br><span class="br">No Brasil: ${esc(f.tituloBR)}</span>` : ''}${f.original !== f.titulo ? `<br><span class="br">Título original: ${esc(f.original)}</span>` : ''}</div></div>${poster(f, { lg: true })}</div>
    <div class="scores" id="notas">${notas()}</div>
    <div id="acoes" style="display:flex;flex-direction:column;gap:22px">${acoes()}</div>
    <div id="dupla">${social()}</div>
    ${nuvem.usuario() ? '' : '<p class="note" style="margin-top:-12px">Sem login, o que você marca fica salvo só neste aparelho.</p>'}
    ${f.sinopse ? `<section class="sinopse"><p class="syn clamp">${esc(f.sinopse)}</p><button class="mais" data-acao="abrir-texto">Ler mais</button>${f.sinopseIdioma === 'en' ? '<p class="note">Sinopse ainda sem tradução no TMDB.</p>' : ''}</section>` : '<p class="note">Sem sinopse no TMDB.</p>'}
    ${noCinema ? `<div class="terca"><span class="eyebrow">Para verem juntos</span>
      <div>${aindaNaoSaiu || haDias < 0 ? `Estreia no Brasil ${dataCurta(estreia)}.` : `Em cartaz desde ${dataCurta(estreia)}.`} Terça sugerida: <b>${dataCurta(terca)}</b>.</div>
      ${haDias < 0 && nuvem.usuario() ? `<div class="actions" style="margin-top:6px" id="aviso-estreia"><button class="btn small ${avisos.pediuAviso(f.id) ? 'on-seen' : ''}" data-acao="avisar-estreia">${avisos.pediuAviso(f.id) ? '✓ Aviso ligado para a estreia' : 'Avisar na estreia'}</button></div>` : ''}</div>` : ''}
    ${f.elenco.length || f.diretores.length ? `<section><h2>Elenco e direção <small>toque para ver os filmes</small></h2><div class="heads">${f.diretores.map((d) => headshot(d, 'Direção')).join('')}${f.elenco.map((p) => headshot(p, p.papel)).join('')}</div></section>` : ''}
    <section><h2>Onde assistir <small>no Brasil</small></h2>${blocoProvedores(f.provedores)}</section>
    <section id="dinheiro">${dinheiro()}</section>
    <section id="premios" hidden></section>
    <section id="curiosidades" hidden></section>
    ${nuvem.usuario() ? '<section id="reviews-nossas"></section>' : ''}
    ${f.reviews.length ? `<section><h2>Reviews da comunidade <small>TMDB</small></h2>${blocoReviews(f.reviews)}</section>` : ''}
    <section id="do-diretor" hidden></section>
    ${f.parecidos.length ? `<section><h2>Filmes parecidos</h2><div class="row">${f.parecidos.map((c) => tile(c)).join('')}</div></section>` : ''}
    <p class="note">Dados e imagens: TMDB. Notas IMDb, Rotten Tomatoes e Metacritic: OMDb. Prêmios: OMDb e Wikidata.</p>${carinha('ficha')}
   </div>`;

  // a sinopse curta não precisa do "Ler mais"
  const syn = $('.syn', el);
  if (syn && syn.scrollHeight <= syn.clientHeight + 2) { syn.classList.remove('clamp'); syn.nextElementSibling?.remove(); }

  const atualizar = () => {
    $('#acoes', el).innerHTML = acoes();
    $('#dupla', el).innerHTML = social();
  };
  const gravarNota = (r) => { // r = null tira a nota
    dados.marcar(meta, r == null ? { nota: null } : { nota: r, visto: true, quero: false });
    toast(r == null ? 'Nota removida' : `Nota ${notaMinha(r)} salva`);
    atualizar();
  };
  ligarReguas(el, gravarNota);
  el.onclick = async (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    const m = meu();
    if (t.dataset.acao === 'avisar-estreia') {
      const ok = await avisos.alternarEstreia(meta, estreia);
      t.classList.toggle('on-seen', avisos.pediuAviso(f.id));
      t.textContent = avisos.pediuAviso(f.id) ? '✓ Aviso ligado para a estreia' : 'Avisar na estreia';
      toast(!ok ? 'Não deu para gravar' : avisos.pediuAviso(f.id) ? 'Você será avisado no dia da estreia' : 'Aviso desligado');
      return;
    }
    if (await tocarExtra(t.dataset.acao, meta, t)) { atualizar(); return; }
    if (t.dataset.r === 'tirar') { gravarNota(null); return; }
    if (t.dataset.acao === 'visto') {
      dados.marcar(meta, m.visto ? { visto: false, nota: null } : { visto: true, quero: false });
      toast(m.visto ? 'Tirado dos vistos' : 'Marcado como visto');
    } else if (t.dataset.acao === 'curtir') {
      dados.marcar(meta, { curtido: !m.curtido });
    } else if (t.dataset.acao === 'quero') {
      dados.marcar(meta, { quero: !m.quero });
      toast(m.quero ? 'Removido do Quero ver' : 'Adicionado ao Quero ver');
    } else return;
    atualizar();
  };
  montarReviews(el, ctx, meta, atualizar);
  montarCuriosidades(el, ctx, f.imdbId);

  // complementos que chegam depois, sem segurar a ficha
  omdb.notas(f.imdbId).then((n) => {
    if (!ctx.vivo()) return;
    notasFora = n;
    carregandoNotas = false;
    $('#notas', el).innerHTML = notas();
    $('#dinheiro', el).innerHTML = dinheiro();
    secaoPremios(el, ctx, f.imdbId, n?.premios);
  });

  if (dir) {
    tmdb.filmesDoDiretor(dir.id).then((lista) => {
      if (!ctx.vivo()) return;
      const outros = lista.filter((c) => c.id !== f.id).slice(0, 8);
      if (!outros.length) return;
      const s = $('#do-diretor', el);
      s.hidden = false;
      s.innerHTML = `<h2>Mais de ${esc(dir.nome)} <small>maior nota primeiro</small></h2><div class="list">${outros.map((c) => {
        const m = dados.titulo('filme', c.id);
        return linha(c, `${c.ano || ''}${m.visto ? ' · visto' : ''}`, m.nota != null ? selo(m.nota) : `TMDB ${nota(c.nota)}`);
      }).join('')}</div><a class="btn small" style="align-self:flex-start" href="#/pessoa/${dir.id}">Ver todos os filmes</a>`;
    }).catch(() => {});
  }
}
