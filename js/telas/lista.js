// Aba Quero ver: a sua lista, a do outro, "Queremos ver juntos" e o Mix, com os mesmos filtros
// (ordem, gênero, década e "só nos meus streamings").
import * as dados from '../dados.js';
import * as nuvem from '../nuvem.js';
import * as social from '../social.js';
import * as mix from '../mix.js';
import * as streaming from '../streaming.js';
import { carinha } from '../ovo.js';
import { esc, nota, tile, duracao } from '../ui.js';

const filtro = { lista: 'minha', ordem: 'recentes', genero: '', epoca: '', meus: false };
let vez = 0;

const ORDENS = [
  ['recentes', 'Adicionados por último'],
  ['nota', 'Maior nota'], ['nota-menor', 'Menor nota'],
  ['curtos', 'Mais curtos'], ['longos', 'Mais longos'],
  ['pop', 'Popularidade'],
  ['novos', 'Mais novos'], ['antigos', 'Mais antigos'],
];
const COMPARA = {
  recentes: (a, b) => (b.queroEm || '').localeCompare(a.queroEm || ''),
  nota: (a, b) => (b.tmdb || 0) - (a.tmdb || 0),
  'nota-menor': (a, b) => (a.tmdb || 99) - (b.tmdb || 99),
  curtos: (a, b) => (a.duracao || 9999) - (b.duracao || 9999),
  longos: (a, b) => (b.duracao || 0) - (a.duracao || 0),
  pop: (a, b) => (b.pop || 0) - (a.pop || 0),
  novos: (a, b) => (b.data || String(b.ano || '0')).localeCompare(a.data || String(a.ano || '0')),
  antigos: (a, b) => (a.data || String(a.ano || '9999')).localeCompare(b.data || String(b.ano || '9999')),
};
const decada = (ano) => (ano ? `${Math.floor(ano / 10) * 10}` : '');

/** Itens da lista escolhida, já com título, pôster, duração etc. No Mix vem também o `motivo`. */
async function itensDa(qual) {
  if (qual === 'minha') return { itens: dados.todos().filter((t) => t.quero) };
  if (qual === 'mix') { const m = await mix.montar(); return { itens: m.itens, porcento: m.porcento }; }
  const pares = qual === 'dele' ? social.queroDoOutro() : social.listaJuntos();
  const info = await dados.resumos(pares);
  return { itens: pares.map((p) => {
    const r = info.get(`${p.tipo}:${p.tmdb_id}`) || {};
    return { tipo: p.tipo, id: p.tmdb_id, titulo: r.titulo || 'Sem título', ano: r.ano ?? null, data: r.data || '', poster: r.poster || '', duracao: r.duracao || 0, generos: r.generos || [], tmdb: r.nota || 0, pop: r.pop || 0, queroEm: p.em };
  }) };
}

export async function render(el) {
  const minhaVez = ++vez;
  const logado = Boolean(nuvem.usuario());
  const o = logado ? nuvem.outro() : null;
  if (!logado && filtro.lista !== 'minha') filtro.lista = 'minha';
  const LISTAS = [['minha', 'Minha'], ...(o ? [['dele', o.nome]] : []), ...(logado ? [['juntos', 'Juntos']] : []), ...(o ? [['mix', 'Mix']] : [])];
  const seletor = LISTAS.length > 1 ? `<div class="seg" role="group" aria-label="Lista">${LISTAS.map(([k, r]) => `<button data-lista="${k}" aria-pressed="${filtro.lista === k}">${esc(r)}</button>`).join('')}</div>` : '';
  const moldura = (miolo, resumo = '') => `<section>${seletor}${resumo || carinha('lista') ? `<p class="sub2">${resumo}${carinha('lista')}</p>` : ''}${miolo}</section>`;
  const esperando = (texto) => { el.innerHTML = moldura(`<div class="card"><p>${texto}</p><div class="lbar-big"><i id="andamento-filtro" style="width:5%"></i></div></div>`); ligar(); };

  function ligar() {
    el.onchange = (e) => {
      if (!(e.target.name in filtro)) return;
      filtro[e.target.name] = e.target.value;
      render(el);
    };
    el.onclick = (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.lista) filtro.lista = b.dataset.lista;
      else if (b.hasAttribute('data-meus')) filtro.meus = !filtro.meus;
      else if (b.dataset.acao === 'refazer-mix') mix.esquecer();
      else return;
      render(el);
    };
  }

  if (filtro.lista === 'mix') esperando('Montando o Mix de vocês dois…');
  let dadosDaLista;
  try { dadosDaLista = await itensDa(filtro.lista); } catch { dadosDaLista = { itens: [] }; }
  if (minhaVez !== vez) return;
  let todos = dadosDaLista.itens;

  if (filtro.meus && todos.length) {
    esperando('Conferindo o que está nos seus streamings…');
    todos = await streaming.filtrar(todos, (feito, total) => { const b = document.getElementById('andamento-filtro'); if (b) b.style.width = `${(feito / total) * 100}%`; });
    if (minhaVez !== vez) return;
  }

  const generos = [...new Set(todos.flatMap((t) => t.generos || []))].sort((a, b) => a.localeCompare(b));
  const decadas = [...new Set(todos.map((t) => decada(t.ano)).filter(Boolean))].sort().reverse();
  if (filtro.genero && !generos.includes(filtro.genero)) filtro.genero = '';
  if (filtro.epoca && !decadas.includes(filtro.epoca)) filtro.epoca = '';

  const itens = todos
    .filter((t) => !filtro.genero || (t.generos || []).includes(filtro.genero))
    .filter((t) => !filtro.epoca || decada(t.ano) === filtro.epoca)
    .sort(COMPARA[filtro.ordem]);
  const filmes = itens.filter((t) => t.tipo === 'filme').length;
  const series = itens.length - filmes;
  const horas = Math.round(itens.reduce((s, t) => s + (t.duracao || 0), 0) / 60);
  const resumo = [filmes ? `${filmes} filme${filmes > 1 ? 's' : ''}` : '', series ? `${series} série${series > 1 ? 's' : ''}` : '', horas ? `${horas} h de filme` : ''].filter(Boolean).join(' · ');
  const opcoes = (lista, atual) => lista.map(([v, r]) => `<option value="${esc(v)}" ${v === atual ? 'selected' : ''}>${esc(r)}</option>`).join('');
  const ehMix = filtro.lista === 'mix';
  // o que aparece embaixo do pôster: no Mix, o motivo; com o filtro de streaming, o serviço; senão, acompanha a ordenação
  const sob = (t) => {
    if (ehMix && filtro.ordem === 'recentes' && !filtro.meus) return esc(t.motivo || '');
    if (filtro.meus && t.onde) return `<span class="ok">${esc(t.onde)}</span>${t.duracao ? ` · ${duracao(t.duracao)}` : ''}`;
    if (filtro.ordem === 'novos' || filtro.ordem === 'antigos') return [t.ano, t.tmdb ? `TMDB ${nota(t.tmdb)}` : ''].filter(Boolean).join(' · ');
    return [t.tmdb ? `TMDB ${nota(t.tmdb)}` : '', t.duracao ? duracao(t.duracao) : (t.ano || '')].filter(Boolean).join(' · ');
  };
  const semFiltro = dadosDaLista.itens.length;
  const VAZIO = {
    minha: `<div class="vazio"><b>Sua lista está vazia</b>Na ficha de um filme ou de uma série, toque em "Quero ver".<a class="btn small" href="#/buscar">Buscar um título</a></div>`,
    dele: `<div class="vazio"><b>${esc(o?.nome || '')} ainda não tem nada na lista</b></div>`,
    juntos: `<div class="vazio"><b>Nada em "Queremos ver juntos" ainda</b>Na ficha de um filme ou de uma série, toque em "+ Queremos ver juntos". A lista é dos dois: qualquer um põe e tira.</div>`,
    mix: `<div class="vazio"><b>Ainda não dá para montar o Mix</b>Ele precisa do "Quero ver" e das notas de vocês dois.</div>`,
  };
  const explica = {
    minha: '',
    dele: `<p class="note">Lista de ${esc(o?.nome || '')}, só para consulta. O ponto verde marca o que você já viu.</p>`,
    juntos: '<p class="note">Lista dos dois: qualquer um põe e tira.</p>',
    mix: `<div class="card"><div class="entre"><span>Mix de você e ${esc(o?.nome || '')}</span>${dadosDaLista.porcento != null ? `<b class="selo" style="font-size:22px">${dadosDaLista.porcento}%</b>` : ''}</div>
      <p>${dadosDaLista.porcento != null ? 'de compatibilidade de gosto. ' : ''}Primeiro o que está no Quero ver dos dois, depois o que está na lista de um e combina com o outro, e por fim sugestões parecidas com os favoritos de vocês.</p>
      <div class="actions"><button class="btn small" data-acao="refazer-mix">Refazer o Mix</button></div></div>`,
  }[filtro.lista];

  el.innerHTML = moldura(`
    ${semFiltro ? `<div class="filtros">
      <label>Ordenar<select name="ordem">${opcoes(ehMix ? [['recentes', 'Ordem do Mix'], ...ORDENS.slice(1)] : ORDENS, filtro.ordem)}</select></label>
      <label>Gênero<select name="genero">${opcoes([['', 'Todos os gêneros'], ...generos.map((g) => [g, g])], filtro.genero)}</select></label>
      <label>Ano<select name="epoca">${opcoes([['', 'Todas as décadas'], ...decadas.map((d) => [d, `Anos ${d}`])], filtro.epoca)}</select></label>
      <button data-meus aria-pressed="${filtro.meus}">Meus streamings</button>
    </div>${explica}
    ${itens.length ? `<div class="grid3">${itens.slice(0, 300).map((t) => tile(t, sob(t))).join('')}</div>${itens.length > 300 ? `<p class="note">Mostrando 300 de ${itens.length}. Use os filtros para ver o resto.</p>` : ''}`
      : `<p class="note">${filtro.meus && !todos.length ? 'Nada desta lista está nos seus streamings agora.' : 'Nenhum título com esse filtro.'}</p>`}`
    : VAZIO[filtro.lista]}
    ${logado ? '' : '<p class="note">Sem login, a lista fica só neste aparelho. Entre no Perfil para ver também a do outro, a "juntos" e o Mix.</p>'}`, resumo);
  ligar();
}
