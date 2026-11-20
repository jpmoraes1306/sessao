// Reviews da comunidade (TMDB): duas na ficha e a página com todas, em português e em inglês,
// com filtro de idioma e de ordem. Rota: #/reviews/filme-ID ou #/reviews/serie-ID.
import * as tmdb from '../tmdb.js';
import { $, esc, erroFicha, SETA } from '../ui.js';

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const dataCurta = (iso) => (iso ? `${Number(iso.slice(8, 10))} ${MESES[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}` : '');
// o TMDB aceita um pouco de Markdown nas reviews: negrito, itálico e parágrafos
const texto = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/(^|[\s(])_(.+?)_(?=[\s.,;:!?)]|$)/g, '$1<i>$2</i>')
  .split(/\n{2,}/).map((p) => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('');

// O TMDB não informa curtidas, então não existe "mais relevantes"; "mais completas" (texto mais longo) faz esse papel.
const ORDENS = {
  recentes: ['Mais recentes', (a, b) => b.data.localeCompare(a.data)],
  maior: ['Maior nota', (a, b) => (b.nota ?? -1) - (a.nota ?? -1) || b.data.localeCompare(a.data)],
  menor: ['Menor nota', (a, b) => (a.nota ?? 99) - (b.nota ?? 99) || b.data.localeCompare(a.data)],
  completas: ['Mais completas', (a, b) => b.texto.length - a.texto.length],
  antigas: ['Mais antigas', (a, b) => a.data.localeCompare(b.data)],
};
// as escolhas valem para todos os títulos enquanto o app está aberto
let idioma = 'todas';
let ordem = 'recentes';

function cartao(r, linhas = 0) {
  const longa = r.texto.length > 300 || r.texto.split('\n').length > 5;
  return `<article class="rv">
    <header><span class="rv-av" aria-hidden="true">${esc((r.autor.trim()[0] || '?').toUpperCase())}</span>
      <div class="quem"><b>${esc(r.autor)}</b><span>${dataCurta(r.data)} · <i class="lg">${r.idioma === 'pt' ? 'PT' : 'EN'}</i></span></div>
      ${r.nota != null ? `<span class="rn" aria-label="Nota ${r.nota} de 10">${r.nota}</span>` : '<span class="rn sem">sem nota</span>'}</header>
    <div class="rt${longa ? ' clamp' : ''}"${longa && linhas ? ` style="-webkit-line-clamp:${linhas}"` : ''}>${texto(r.texto)}</div>
    ${longa ? '<button class="texto" data-rv="mais" aria-expanded="false">Ler mais</button>' : ''}
  </article>`;
}

/** "Ler mais" e "Ler menos" de um cartão. Devolve true se o toque era disso. */
function abrirOuFechar(e) {
  const b = e.target.closest('[data-rv="mais"]');
  if (!b) return false;
  const aberto = b.getAttribute('aria-expanded') === 'true';
  b.previousElementSibling.classList.toggle('clamp', aberto);
  b.setAttribute('aria-expanded', String(!aberto));
  b.textContent = aberto ? 'Ler mais' : 'Ler menos';
  return true;
}

/** Na ficha: preenche #reviews-comunidade com duas reviews (uma em português, se houver) e o caminho para todas. */
export async function secaoComunidade(el, ctx, tipo, id) {
  const sec = $('#reviews-comunidade', el);
  if (!sec) return;
  let lista;
  try { lista = await tmdb.reviewsTodas(tipo, id); } catch { return; }
  if (!ctx.vivo() || !lista.length) return;
  const nPt = lista.filter((r) => r.idioma === 'pt').length;
  const recentes = [...lista].sort(ORDENS.recentes[1]);
  const comNota = (r) => r.nota != null;
  const primeira = recentes.find((r) => r.idioma === 'pt' && comNota(r)) || recentes.find((r) => r.idioma === 'pt');
  const duas = [primeira, ...recentes.filter((r) => r !== primeira && comNota(r)), ...recentes.filter((r) => r !== primeira && !comNota(r))].filter(Boolean).slice(0, 2);
  const partes = [nPt ? `${nPt} em português` : '', lista.length - nPt ? `${lista.length - nPt} em inglês` : ''].filter(Boolean).join(' · ');
  sec.hidden = false;
  sec.innerHTML = `<h2>Reviews da comunidade <small>${lista.length} no TMDB</small></h2>
    <div class="rvs">${duas.map((r) => cartao(r, 4)).join('')}</div>
    ${lista.length > 2 ? `<div class="grupo"><a class="lin" href="#/reviews/${tipo}-${id}"><span class="n">Ver todas as ${lista.length} reviews<small>${partes}</small></span>${SETA}</a></div>` : ''}`;
  sec.addEventListener('click', abrirOuFechar);
}

export async function abrir(el, rota, ctx) {
  const [tipo, id] = rota.split('-');
  let t; let lista;
  try {
    [t, lista] = await Promise.all([tipo === 'serie' ? tmdb.serie(id) : tmdb.filme(id), tmdb.reviewsTodas(tipo, id)]);
  } catch (erro) { if (ctx.vivo()) el.innerHTML = erroFicha(erro); return; }
  if (!ctx.vivo()) return;
  const nPt = lista.filter((r) => r.idioma === 'pt').length;
  if (idioma !== 'todas' && !lista.some((r) => r.idioma === idioma)) idioma = 'todas';

  const corpo = () => {
    const filtradas = lista.filter((r) => idioma === 'todas' || r.idioma === idioma).sort(ORDENS[ordem][1]);
    const comNota = filtradas.filter((r) => r.nota != null);
    const media = comNota.length ? (comNota.reduce((s, r) => s + r.nota, 0) / comNota.length).toFixed(1).replace('.', ',') : '';
    return `<section>
      <div class="seg" role="group" aria-label="Idioma">
        <button data-idioma="todas" aria-pressed="${idioma === 'todas'}">Todas <span style="opacity:.6">${lista.length}</span></button>
        <button data-idioma="pt" aria-pressed="${idioma === 'pt'}" ${nPt ? '' : 'disabled'}>Português <span style="opacity:.6">${nPt}</span></button>
        <button data-idioma="en" aria-pressed="${idioma === 'en'}" ${lista.length - nPt ? '' : 'disabled'}>Inglês <span style="opacity:.6">${lista.length - nPt}</span></button>
      </div>
      <div class="caps" role="group" aria-label="Ordenar">${Object.entries(ORDENS).map(([k, [nome]]) => `<button class="cap${ordem === k ? ' on' : ''}" data-ordem="${k}" aria-pressed="${ordem === k}">${nome}</button>`).join('')}</div>
      <p class="sub2">${filtradas.length} ${filtradas.length === 1 ? 'review' : 'reviews'}${media ? ` · média ${media} entre as ${comNota.length} com nota` : ''}</p>
    </section>
    <div class="rvs">${filtradas.map((r) => cartao(r)).join('')}</div>`;
  };

  el.innerHTML = `<div class="backdrop curto" style="--a:#3d4a5c;--b:#101419"></div>
    <button class="back" data-acao="voltar" aria-label="Voltar">‹</button>
    <div class="wrap" style="gap:18px"><div class="pessoa-topo" style="margin-top:-40px"><div><div class="eyebrow">${esc(t.titulo)}</div><h1>Reviews</h1></div></div>
      ${lista.length ? `<div id="rv-corpo" style="display:flex;flex-direction:column;gap:18px">${corpo()}</div>` : '<p class="note">Ninguém escreveu review deste título no TMDB ainda.</p>'}
      <p class="note">Reviews de usuários do TMDB, em português e em inglês. O TMDB não informa curtidas, por isso não há ordem por relevância.</p>
    </div>`;

  el.onclick = (e) => {
    if (abrirOuFechar(e)) return;
    const b = e.target.closest('button[data-idioma],button[data-ordem]');
    if (!b) return;
    if (b.dataset.idioma) idioma = b.dataset.idioma; else ordem = b.dataset.ordem;
    const rolagemCaps = $('.caps', el)?.scrollLeft || 0;
    $('#rv-corpo', el).innerHTML = corpo();
    if ($('.caps', el)) $('.caps', el).scrollLeft = rolagemCaps;
  };
}
