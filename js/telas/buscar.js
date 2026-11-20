// Aba Buscar: filmes, séries e pessoas no catálogo inteiro do TMDB.
// Aceita o título em inglês ou em português, com ou sem acento.
// Cada botão (Tudo, Filmes, Séries, Pessoas) refaz a busca no tipo escolhido; sem texto, mostra o que está em alta.
import * as tmdb from '../tmdb.js';
import { temChaves } from '../config.js';
import * as streaming from '../streaming.js';
import { carinha } from '../ovo.js';
import { $, esc, linha, headshot, foto, situacao } from '../ui.js';

export const manter = true; // voltar de uma ficha não apaga a busca

const estado = { q: '', tipo: 'tudo', meus: false, resultados: null, erro: null };
let relogio = 0;
let vez = 0;
const emAlta = {}; // tipo -> lista (sugestões quando o campo está vazio)

const TIPOS = [['tudo', 'Tudo'], ['filme', 'Filmes'], ['serie', 'Séries'], ['pessoa', 'Pessoas']];
const TITULO_ALTA = { tudo: 'Em alta esta semana', filme: 'Filmes em alta esta semana', serie: 'Séries em alta esta semana', pessoa: 'Pessoas em alta esta semana' };

function subtitulo(c) {
  return [c.ano || 'sem data', c.tipo === 'serie' ? '<span class="tag">Série</span>' : '', c.onde ? `<span class="ok">${esc(c.onde)}</span>` : '', c.tituloBR ? `<i>${esc(c.tituloBR)}</i>` : ''].filter(Boolean).join(' · ');
}
const linhaPessoa = (p) => `<a class="li" href="#/pessoa/${p.id}" style="grid-template-columns:44px 1fr">${foto(p, 'sm')}<div><div class="t">${esc(p.nome)}</div><div class="s">${esc([p.depto, ...p.conhecido].filter(Boolean).join(' · '))}</div></div></a>`;
const linhas = (itens) => `<div class="list">${itens.map((x) => (x.tipo === 'pessoa' ? linhaPessoa(x) : linha(x, subtitulo(x), situacao(x)))).join('')}</div>`;
const carregando = '<div class="skel txt"></div><div class="skel txt" style="width:70%;margin-top:10px"></div>';

function lista() {
  if (estado.q.trim().length < 2) {
    const alta = emAlta[estado.tipo];
    if (!alta) return carregando;
    return `<h2 style="margin-top:6px">${TITULO_ALTA[estado.tipo]}</h2>${alta.length ? linhas(alta) : '<p class="note">Nada por enquanto.</p>'}`;
  }
  if (estado.erro) return `<p class="note">${estado.erro.status === 401 ? 'A chave do TMDB foi recusada. Confira no Perfil.' : 'Não deu para buscar. Confira a internet.'}</p>`;
  if (!estado.resultados) return carregando;
  const r = estado.resultados;
  if (!r.length) {
    const onde = { tudo: '', filme: ' em filmes', serie: ' em séries', pessoa: ' em pessoas' }[estado.tipo];
    return `<p class="note">Nada encontrado${onde} para "${esc(estado.q.trim())}".</p>`;
  }
  if (estado.tipo !== 'tudo') return linhas(r);
  const gente = r.filter((x) => x.tipo === 'pessoa');
  const titulos = r.filter((x) => x.tipo !== 'pessoa');
  return `${gente.length ? `<div class="heads" style="padding-block:6px 10px">${gente.slice(0, 10).map((p) => headshot(p, p.depto)).join('')}</div>` : ''}${linhas(titulos)}`;
}

function desenharLista(el) {
  const alvo = $('#res', el);
  if (alvo) alvo.innerHTML = lista();
}

async function carregarEmAlta(el, tipo) {
  if (emAlta[tipo]) return;
  try {
    if (tipo === 'pessoa') emAlta.pessoa = (await tmdb.pessoasEmAlta()).slice(0, 12);
    else if (tipo === 'tudo') {
      const [f, s] = await Promise.all([tmdb.emAlta('filme'), tmdb.emAlta('serie')]);
      emAlta.tudo = [...f.slice(0, 6), ...s.slice(0, 4)];
    } else emAlta[tipo] = (await tmdb.emAlta(tipo)).slice(0, 12);
  } catch { emAlta[tipo] = []; }
  if (estado.tipo === tipo) desenharLista(el);
}

async function buscar(el) {
  const q = estado.q.trim();
  const minhaVez = ++vez;
  estado.erro = null;
  estado.resultados = null;
  desenharLista(el);
  if (q.length < 2) { carregarEmAlta(el, estado.tipo); return; }
  try {
    let r = await tmdb.buscar(q, estado.tipo);
    if (minhaVez !== vez) return;
    // "só nos meus streamings": ficam as pessoas e os títulos que estão num serviço seu
    if (estado.meus) r = [...r.filter((x) => x.tipo === 'pessoa'), ...await streaming.filtrar(r.filter((x) => x.tipo !== 'pessoa'))];
    if (minhaVez !== vez) return;
    estado.resultados = r;
  } catch (erro) {
    if (minhaVez !== vez) return;
    estado.erro = erro;
  }
  desenharLista(el);
}

export function atualizar(el) { desenharLista(el); } // notas e "quero ver" podem ter mudado na ficha

export function render(el) {
  if (!temChaves()) {
    el.innerHTML = `<div class="vazio"><b>Falta a chave do TMDB</b>Cole a sua chave no Perfil para buscar.<a class="btn small" href="#/perfil">Abrir o Perfil</a></div>`;
    return;
  }
  el.innerHTML = `<section>
    <label class="search" for="q"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>
      <input id="q" type="search" inputmode="search" enterkeyhint="search" placeholder="Filme, série, ator ou diretor" value="${esc(estado.q)}" autocomplete="off" autocapitalize="off" spellcheck="false">
      <button class="limpar" data-limpar aria-label="Limpar busca" ${estado.q ? '' : 'hidden'}>×</button></label>
    <div class="seg" role="group" aria-label="Tipo">${TIPOS.map(([k, l]) => `<button data-tipo="${k}" aria-pressed="${estado.tipo === k}">${l}</button>`).join('')}${carinha('buscar')}</div>
    <div class="seg"><button data-meus aria-pressed="${estado.meus}">Só nos meus streamings</button></div>
    <div id="res">${lista()}</div>
  </section>`;

  el.oninput = (e) => {
    if (e.target.id !== 'q') return;
    estado.q = e.target.value;
    $('[data-limpar]', el).hidden = !estado.q;
    clearTimeout(relogio);
    relogio = setTimeout(() => buscar(el), 320);
  };
  el.onclick = (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.dataset.tipo) {
      if (t.dataset.tipo === estado.tipo) return;
      estado.tipo = t.dataset.tipo;
      el.querySelectorAll('[data-tipo]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.tipo === estado.tipo));
      clearTimeout(relogio);
      buscar(el); // refaz a busca só no tipo escolhido
    } else if (t.hasAttribute('data-meus')) {
      estado.meus = !estado.meus;
      t.setAttribute('aria-pressed', estado.meus);
      clearTimeout(relogio);
      buscar(el);
    } else if (t.hasAttribute('data-limpar')) {
      estado.q = '';
      const campo = $('#q', el);
      campo.value = '';
      campo.focus();
      t.hidden = true;
      clearTimeout(relogio);
      buscar(el);
    }
  };
  el.onkeydown = (e) => { if (e.key === 'Enter' && e.target.id === 'q') e.target.blur(); };

  if (estado.q.trim().length < 2) carregarEmAlta(el, estado.tipo);
}
