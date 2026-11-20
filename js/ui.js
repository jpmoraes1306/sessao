// Pedaços de interface usados por várias telas.
import { img } from './tmdb.js';
import { MEUS_STREAMINGS } from './config.js';
import * as dados from './dados.js';

export const $ = (s, raiz = document) => raiz.querySelector(s);
export const $$ = (s, raiz = document) => [...raiz.querySelectorAll(s)];
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const norm = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/* ---------- datas ---------- */
const SEM = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
export const hoje = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' }); // AAAA-MM-DD, sempre o dia de Brasília (igual ao do servidor e para os dois)
export const dataBR = (iso) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '');
const meioDia = (iso) => new Date(`${iso.slice(0, 10)}T12:00:00`);
/** "sex, 22/11" (com o ano quando não é o ano atual). */
export function dataCurta(iso) {
  if (!iso) return '';
  const [a, m, d] = iso.slice(0, 10).split('-');
  return `${SEM[meioDia(iso).getDay()]}, ${d}/${m}${a !== hoje().slice(0, 4) ? `/${a}` : ''}`;
}
/** Contagem até 00:00 (horário de Brasília) do dia informado. */
export function contagem(iso) {
  const ms = new Date(`${iso.slice(0, 10)}T00:00:00-03:00`) - Date.now();
  if (ms <= 0) return 'hoje';
  const h = ms / 3600e3;
  if (h < 24) return `em ${Math.ceil(h)} h`;
  const dias = Math.ceil(h / 24);
  return `em ${dias} dias`;
}
export const duracao = (min) => (min >= 60 ? `${Math.floor(min / 60)}h${min % 60 ? ` ${String(min % 60).padStart(2, '0')}min` : ''}` : `${min} min`);

/* ---------- notas (0 a 10) ---------- */
/** Médias de fora (IMDb, TMDB): sempre com uma casa, "7,9". */
export const nota = (n) => n.toFixed(1).replace('.', ',');
/** Nota de vocês: "8" quando é inteira, "7,5" quando não é. */
export const notaMinha = (n) => (Number.isInteger(n) ? String(n) : nota(n));
/** A nota de vocês como aparece em listas e cartões. */
export function selo(n, vazio = '') {
  if (n == null) return vazio ? `<span class="dim">${vazio}</span>` : '';
  return `<span class="selo" aria-label="nota ${notaMinha(n)} de 10">${notaMinha(n)}</span>`;
}
const MARCAS = Array.from({ length: 11 }, (_, i) => `<span>${i % 5 === 0 ? i : ''}</span>`).join('');
/** Bloco "Sua nota": o número grande e uma régua de arrastar de 0 a 10. `alvo` vira data-* para a
    tela saber de quem é a nota. Quem grava é a tela, por `ligarReguas`; "Tirar nota" é um botão data-r="tirar". */
export function blocoNota(r, rotulo = 'Sua nota', alvo = '') {
  const menor = /temporada|episodio/.test(alvo);
  const v = r == null ? 0 : Math.round(r);
  return `<div class="rate${menor ? ' menor' : ''}" ${alvo}>
    <div class="rate-t"><span>${rotulo}</span><output class="rate-n${r != null ? ' tem' : ''}">${r != null ? notaMinha(r) : '—'}</output></div>
    <input type="range" class="regua${r == null ? ' vazia' : ''}" min="0" max="10" step="1" value="${v}" style="--p:${v * 10}%" aria-label="${rotulo}, de 0 a 10">
    <div class="marcas" aria-hidden="true">${MARCAS}</div>
    <div class="rate-d"><span>${r == null ? 'Arraste a bolinha para dar a nota' : ''}</span>${r != null ? '<button class="texto" data-r="tirar">Tirar nota</button>' : ''}</div></div>`;
}
/** Liga as réguas de nota de uma tela: o número acompanha o dedo e, ao soltar, chama aoGravar(nota, régua). */
export function ligarReguas(raiz, aoGravar) {
  raiz.oninput = (e) => {
    const x = e.target;
    if (!x.classList?.contains('regua')) return;
    x.dataset.mexeu = '1';
    x.style.setProperty('--p', `${x.value * 10}%`);
    x.classList.remove('vazia');
    const n = x.closest('.rate')?.querySelector('.rate-n');
    if (n) { n.textContent = x.value; n.classList.add('tem'); }
  };
  // "change" não dispara quando a pessoa arrasta e volta para o valor de antes (ex.: dar nota 0), por isso também ao soltar
  const soltar = (e) => {
    const x = e.target;
    if (!x.classList?.contains('regua') || !x.dataset.mexeu) return;
    delete x.dataset.mexeu;
    aoGravar(Number(x.value), x);
  };
  raiz.onchange = soltar;
  raiz.onpointerup = soltar;
  raiz.ontouchend = soltar;
}

/* ---------- regra da terça ---------- */
/** Data sugerida para verem juntos: a primeira terça a partir da estreia (ou de hoje, se já estreou).
    Se a estreia cair numa terça, vale o próprio dia. */
export function proximaTerca(estreia) {
  const base = !estreia || estreia < hoje() ? hoje() : estreia.slice(0, 10);
  const d = meioDia(base);
  d.setDate(d.getDate() + ((2 - d.getDay() + 7) % 7));
  return d.toLocaleDateString('sv-SE');
}

/* ---------- dinheiro ---------- */
export function dolares(v) {
  if (v >= 1e9) return `US$ ${(v / 1e9).toFixed(2).replace('.', ',')} bi`;
  if (v >= 1e6) return `US$ ${(v / 1e6).toFixed(v >= 1e8 ? 0 : 1).replace('.', ',')} mi`;
  return `US$ ${Math.round(v / 1e3)} mil`;
}
/* ---------- imagens ---------- */
export function corDe(n) {
  let h = 0;
  for (const ch of String(n)) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return [`hsl(${h} 32% 42%)`, `hsl(${(h + 40) % 360} 38% 13%)`];
}
const SOME = `onerror="this.remove()"`;
export function poster(c, { lg = false, tam = 'w342' } = {}) {
  const [a, b] = corDe(c.titulo || '');
  return `<div class="poster${lg ? ' lg' : ''}" style="--a:${a};--b:${b}">${c.poster ? `<img src="${esc(img(c.poster, tam))}" alt="" loading="lazy" decoding="async" crossorigin="anonymous" ${SOME}>` : ''}<b>${esc(c.titulo)}</b>${c.ano ? `<span>${esc(c.ano)}</span>` : ''}</div>`;
}
const iniciais = (n) => String(n).split(' ').filter((w) => /^[A-ZÀ-Ý]/.test(w)).map((w) => w[0]).slice(0, 2).join('');
export function foto(p, cls = '') {
  const [a, b] = corDe(p.nome);
  return `<span class="ph ${cls}" style="--a:${a};--b:${b}">${esc(iniciais(p.nome))}${p.foto ? `<img src="${img(p.foto, 'w185')}" alt="" loading="lazy" decoding="async" crossorigin="anonymous" ${SOME}>` : ''}</span>`;
}
/** Elenco sem foto repetida: quem dirige (ou cria) e também atua aparece uma vez só, com os dois cargos. */
export function elencoJunto(chefes, cargo, elenco, papelDe = (p) => p.papel) {
  const mapa = new Map();
  for (const c of chefes) mapa.set(c.id, { ...c, papeis: [cargo] });
  for (const p of elenco) {
    const ja = mapa.get(p.id);
    const papel = papelDe(p);
    if (ja) { if (papel) ja.papeis.push(papel); } else mapa.set(p.id, { ...p, papeis: papel ? [papel] : [] });
  }
  return [...mapa.values()].map((p) => headshot(p, p.papeis.join(' · '))).join('');
}
export const headshot = (p, sub) => `<a class="headshot" href="#/pessoa/${p.id}">${foto(p)}<span>${esc(p.nome)}</span>${sub ? `<small>${esc(sub)}</small>` : ''}</a>`;

/* ---------- cartões de título ---------- */
export const link = (c) => `#/${c.tipo}/${c.id}`;
const marca = (c) => {
  const meu = dados.titulo(c.tipo, c.id);
  return meu.visto ? '<span class="mark" title="Visto"></span>' : '';
};
/** Pôster clicável para carrosséis e grades. `sob` = texto embaixo (opcional). */
export function tile(c, sob = '') {
  return `<a class="tile" href="${link(c)}" aria-label="${esc(c.titulo)}">${poster(c)}${c.tipo === 'serie' ? '<span class="tag">Série</span>' : ''}${marca(c)}${sob ? `<span class="meta">${sob}</span>` : ''}</a>`;
}
/** Linha de lista: pôster pequeno, título, subtítulo e um canto à direita. */
export function linha(c, sub, direita = '') {
  return `<a class="li" href="${link(c)}">${poster(c, { tam: 'w154' })}<div><div class="t">${esc(c.titulo)}</div><div class="s">${sub}</div></div><span class="r">${direita}</span></a>`;
}
/** O que mostrar no canto de um título conforme o que a pessoa já fez com ele. */
export function situacao(c) {
  const meu = dados.titulo(c.tipo, c.id);
  if (meu.nota != null) return selo(meu.nota);
  if (meu.visto) return '<span class="ok">visto</span>';
  if (meu.seguindo) return '<span class="ok">acompanhando</span>';
  if (meu.quero) return '<span style="color:var(--list)">quero ver</span>';
  return '';
}

/* ---------- blocos da ficha ---------- */
const BAIXO = '<svg class="vai" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';
export const SETA = '<svg class="vai" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';
/** Notas de outros sites numa linha só (IMDb, Rotten, Metacritic, TMDB). Tocar abre o detalhe. */
export function blocoNotas(minha, tmdbNota, omdb, carregando) {
  // os quatro sites aparecem sempre; "—" quando o site ainda não tem nota (comum em filme recém-lançado)
  const falta = carregando ? '…' : '—';
  const tem = { imdb: omdb?.imdb > 0, rotten: omdb?.rotten != null, meta: omdb?.metacritic > 0, tmdb: tmdbNota > 0 };
  const itens = [
    `<span class="nf${tem.imdb ? '' : ' sem'}"><i class="m imdb">IMDb</i>${tem.imdb ? nota(omdb.imdb) : falta}</span>`,
    `<span class="nf${tem.rotten ? '' : ' sem'}"><i class="m tom"></i>${tem.rotten ? `${omdb.rotten}%` : falta}</span>`,
    `<span class="nf${tem.meta ? '' : ' sem'}"><i class="m mc">${tem.meta ? omdb.metacritic : falta}</i><small>Meta</small></span>`,
    `<span class="nf${tem.tmdb ? '' : ' sem'}"><i class="m tm">TMDB</i>${tem.tmdb ? nota(tmdbNota) : falta}</span>`,
  ];
  const sem = carregando ? 'buscando…' : 'ainda sem nota';
  const mais = [
    `<span><b>IMDb${tem.imdb ? ` ${nota(omdb.imdb)}` : ''}</b> · ${tem.imdb ? (omdb.imdbVotos ? `${Number(omdb.imdbVotos).toLocaleString('pt-BR')} votos do público` : 'público') : sem}</span>`,
    `<span><b>Rotten Tomatoes${tem.rotten ? ` ${omdb.rotten}%` : ''}</b> · ${tem.rotten ? 'das críticas são positivas' : sem}</span>`,
    `<span><b>Metacritic${tem.meta ? ` ${omdb.metacritic}` : ''}</b> · ${tem.meta ? 'média da crítica, de 0 a 100' : sem}</span>`,
    `<span><b>TMDB${tem.tmdb ? ` ${nota(tmdbNota)}` : ''}</b> · ${tem.tmdb ? 'nota do público' : sem}</span>`,
  ];
  return `<details class="notas"><summary aria-label="Notas de outros sites. Toque para ver o detalhe.">${itens.join('')}${BAIXO}</summary><div class="notas-mais">${mais.join('')}</div></details>`;
}

// Os dados já vêm só do Brasil (JustWatch BR). Aqui saem os "canais" revendidos dentro de outro
// serviço (ex.: "HBO Max Amazon Channel") e o plano com anúncios quando o serviço principal já aparece.
const CANAL = /(amazon|apple tv|roku premium) channel$/i;
function soServicos(l) {
  const semCanal = l.filter((x) => !CANAL.test(x.nome));
  return semCanal.filter((x) => !/ with ads$/i.test(x.nome) || !semCanal.some((y) => y !== x && MEUS_STREAMINGS.get(y.id) === MEUS_STREAMINGS.get(x.id) && MEUS_STREAMINGS.has(x.id)));
}

export function blocoProvedores(bruto) {
  const p = bruto && { stream: soServicos(bruto.stream), alugar: soServicos(bruto.alugar), comprar: soServicos(bruto.comprar) };
  if (!p || !(p.stream.length + p.alugar.length + p.comprar.length)) {
    return '<p class="note">Não está em nenhum streaming no Brasil no momento.</p>';
  }
  const meusPrimeiro = (l) => [...l].sort((a, b) => MEUS_STREAMINGS.has(b.id) - MEUS_STREAMINGS.has(a.id) || a.ordem - b.ordem);
  const grupo = (rotulo, l) => (l.length ? `<div class="prov-g"><span>${rotulo}</span><div class="prov-l">${meusPrimeiro(l).map((x) => {
    const meu = MEUS_STREAMINGS.has(x.id);
    return `<div class="prov${meu ? ' meu' : ''}" title="${esc(x.nome)}"><img src="${img(x.logo, 'w92')}" alt="" loading="lazy" crossorigin="anonymous">${esc(MEUS_STREAMINGS.get(x.id) || x.nome)}</div>`;
  }).join('')}</div></div>` : '');
  const tenho = p.stream.filter((x) => MEUS_STREAMINGS.has(x.id));
  const resumo = tenho.length
    ? `<p class="note ok">Está nos seus streamings: ${[...new Set(tenho.map((x) => MEUS_STREAMINGS.get(x.id)))].join(', ')}.</p>`
    : (p.stream.length ? (MEUS_STREAMINGS.size ? '<p class="note">Não está nos seus streamings.</p>' : '') : '<p class="note">Fora dos streamings por assinatura. Só para alugar ou comprar.</p>');
  return `<div class="provs">${resumo}${grupo('Streaming', p.stream)}${grupo('Alugar', p.alugar)}${grupo('Comprar', p.comprar)}</div>
    <p class="note">Só serviços disponíveis no Brasil. Fonte: JustWatch, via TMDB.</p>`;
}

export function blocoReviews(lista) {
  return `<div class="facts">${lista.slice(0, 5).map((r) => `<div class="fact"><div class="who"><b>${esc(r.autor)}</b><span>${r.nota != null ? `<span class="selo">${notaMinha(r.nota)}</span> · ` : ''}${dataBR(r.data)}</span></div><div class="txt${r.texto.length > 380 ? ' clamp' : ''}">${esc(r.texto)}</div>${r.texto.length > 380 ? '<button class="mais" data-acao="abrir-texto">Ler mais</button>' : ''}</div>`).join('')}</div>`;
}

export const esqueletoFicha = () => `
  <div class="backdrop"></div><button class="back" data-acao="voltar" aria-label="Voltar">‹</button>
  <div class="wrap"><div class="head"><div><div class="skel tit" style="margin:0 0 10px"></div><div class="skel txt" style="width:55%"></div></div><div class="poster skel" style="--a:transparent;--b:transparent"></div></div>
  <div class="skel txt"></div><div class="skel txt" style="width:92%"></div><div class="skel txt" style="width:60%"></div></div>`;

export function erroFicha(erro) {
  const semChave = erro?.status === 401;
  return `<button class="back" data-acao="voltar" aria-label="Voltar">‹</button><div class="wrap" style="padding-top:90px"><div class="vazio"><b>${semChave ? 'Falta configurar a chave do TMDB' : erro?.status === 404 ? 'Título não encontrado' : 'Não deu para carregar'}</b>
    ${semChave ? 'Abra o Perfil e cole a chave do TMDB.' : 'Confira a internet e tente de novo.'}
    <div class="actions">${semChave ? '<a class="btn small" href="#/perfil">Abrir o Perfil</a>' : '<button class="btn small" data-acao="recarregar">Tentar de novo</button>'}</div></div></div>`;
}

export function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.h);
  toast.h = setTimeout(() => t.classList.remove('show'), 1900);
}

/** Folha que sobe de baixo, por cima da tela, com um título e um conteúdo que rola.
    Fecha no véu, no ✕ ou quando a pessoa abre um título da lista. */
export function folha(titulo, sub, corpo) {
  document.querySelector('.folha-v')?.remove();
  const caixa = document.createElement('div');
  caixa.className = 'folha-v';
  caixa.innerHTML = `<div class="folha" role="dialog" aria-modal="true" aria-label="${esc(titulo)}"><div class="pega"></div>
    <div class="folha-t"><div><b>${esc(titulo)}</b><span>${esc(sub)}</span></div><button class="ic" data-fechar aria-label="Fechar">✕</button></div>
    <div class="folha-c">${corpo}</div></div>`;
  const fechar = () => { caixa.remove(); window.removeEventListener('hashchange', fechar); };
  caixa.addEventListener('click', (e) => { if (e.target === caixa || e.target.closest('[data-fechar]')) fechar(); });
  window.addEventListener('hashchange', fechar);
  document.body.append(caixa);
}

/** Janela de pergunta com dois botões. Devolve true (sim), false (não) ou null (fechou sem responder). */
export function perguntar({ titulo, texto, sim, nao }) {
  return new Promise((responder) => {
    const caixa = document.createElement('div');
    caixa.className = 'ovo';
    caixa.innerHTML = `<div class="ovo-c" role="dialog" aria-modal="true" style="text-align:left">
      <h3 style="text-align:left">${esc(titulo)}</h3><p style="margin:0;color:var(--muted);font-size:14px">${esc(texto)}</p>
      <div class="actions" style="flex-direction:column;align-items:stretch">
        <button class="btn on-seen" data-r="sim">${esc(sim)}</button><button class="btn" data-r="nao">${esc(nao)}</button></div></div>`;
    caixa.addEventListener('click', (e) => {
      const b = e.target.closest('[data-r]');
      if (!b && e.target !== caixa) return;
      caixa.remove();
      responder(b ? b.dataset.r === 'sim' : null);
    });
    document.body.append(caixa);
    caixa.querySelector('[data-r="sim"]').focus();
  });
}

/* ícones (traço, mesmo estilo das abas) */
export const IC = {
  olho: '<svg viewBox="0 0 24 24"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
  coracao: '<svg viewBox="0 0 24 24"><path d="M12 20s-7-4.4-9-9a5 5 0 0 1 9-3 5 5 0 0 1 9 3c-2 4.6-9 9-9 9z"/></svg>',
  relogio: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  estrela: '<svg viewBox="0 0 24 24"><path d="M12 3.6l2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z"/></svg>',
  lapis: '<svg viewBox="0 0 24 24"><path d="M4 20l4-1L19 8l-3-3L5 16z"/><path d="M14 7l3 3"/></svg>',
  sino: '<svg viewBox="0 0 24 24"><path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 20a2 2 0 0 0 4 0"/></svg>',
  rever: '<svg viewBox="0 0 24 24"><path d="M4.500 11a7.500 7.500 0 0 1 12.800-4.800L20 9"/><path d="M20 4.500V9h-4.500"/><path d="M19.500 13a7.500 7.500 0 0 1-12.800 4.800L4 15"/><path d="M4 19.500V15h4.500"/></svg>',
};
