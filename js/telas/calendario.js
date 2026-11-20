// Calendário (abre por cima, em #/calendario/AAAA-MM): estreias nos cinemas do Brasil, episódios
// novos das séries que a pessoa acompanha e as sessões marcadas para verem juntos.
import * as tmdb from '../tmdb.js';
import * as dados from '../dados.js';
import * as nuvem from '../nuvem.js';
import * as social from '../social.js';
import * as andamento from '../andamento.js';
import { esc, poster, dataCurta, proximaTerca, hoje, erroFicha } from '../ui.js';

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const cod = (t, e) => `S${String(t).padStart(2, '0')} E${String(e).padStart(2, '0')}`;
const iso = (a, m, d) => `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

export async function abrir(el, id, ctx) {
  const [a, m] = (/^\d{4}-\d{2}$/.test(id) ? id : hoje().slice(0, 7)).split('-').map(Number);
  const dias = new Date(a, m, 0).getDate();
  const inicio = iso(a, m, 1);
  const fim = iso(a, m, dias);
  const vizinho = (delta) => { const d = new Date(a, m - 1 + delta, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
  let escolhido = hoje() >= inicio && hoje() <= fim ? hoje() : '';
  let estreias = [];
  let episodios = [];
  let sessoes = [];
  let carregando = true;

  const porDia = (lista, campo = 'data') => { const mapa = {}; for (const x of lista) (mapa[x[campo]] = mapa[x[campo]] || []).push(x); return mapa; };

  function desenhar() {
    if (!ctx.vivo()) return;
    const e = porDia(estreias);
    const p = porDia(episodios);
    const s = porDia(sessoes);
    const primeiro = new Date(a, m - 1, 1).getDay(); // 0 = domingo
    const celulas = [...Array(primeiro).fill(''), ...Array.from({ length: dias }, (_, i) => iso(a, m, i + 1))];
    const doDia = escolhido ? [
      ...(s[escolhido] || []).map((x) => `<a class="li" href="#/${x.tipo}/${x.tmdb_id}">${poster({ titulo: x.titulo || '', poster: x.poster }, { tam: 'w154' })}<div><div class="t">${esc(x.titulo || 'Sem título')}</div><div class="s" style="color:var(--list)">Sessão de vocês${x.situacao === 'vista' ? ' · vista' : ''}</div></div></a>`),
      ...(p[escolhido] || []).map((x) => `<a class="li" href="#/serie/${x.serie.id}">${poster(x.serie, { tam: 'w154' })}<div><div class="t">${esc(x.serie.titulo)}</div><div class="s" style="color:var(--seen)">${cod(x.t, x.e)} · ${esc(x.nome)}</div></div></a>`),
      ...(e[escolhido] || []).map((x) => `<a class="li" href="#/filme/${x.id}">${poster(x, { tam: 'w154' })}<div><div class="t">${esc(x.titulo)}</div><div class="s">Estreia nos cinemas</div></div><span class="r">juntos<br><b class="junto">${dataCurta(proximaTerca(x.data))}</b></span></a>`),
    ] : [];
    el.innerHTML = `<div class="backdrop curto" style="--a:#3d5a73;--b:#101419"></div>
      <button class="back" data-acao="voltar" aria-label="Voltar">‹</button>
      <div class="wrap" style="gap:16px"><div class="pessoa-topo" style="margin-top:-40px"><div><div class="eyebrow">Calendário</div><h1>${MESES[m - 1]} ${a}</h1></div></div>
        <div class="actions" style="justify-content:space-between"><a class="btn small" href="#/calendario/${vizinho(-1)}">‹ ${MESES[(m + 10) % 12]}</a><a class="btn small" href="#/calendario/${vizinho(1)}">${MESES[m % 12]} ›</a></div>
        <div class="cal"><div class="cal-s">${['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((x) => `<span>${x}</span>`).join('')}</div>
          <div class="cal-g">${celulas.map((d) => (d ? `<button class="cal-d${d === hoje() ? ' hoje' : ''}${d === escolhido ? ' on' : ''}" data-dia="${d}"><b>${Number(d.slice(8))}</b><span>${s[d] ? '<i class="ps"></i>' : ''}${p[d] ? '<i class="pe"></i>' : ''}${e[d] ? '<i class="pf"></i>' : ''}</span></button>` : '<span></span>')).join('')}</div></div>
        <p class="note"><i class="pf leg"></i> estreia no cinema &nbsp; <i class="pe leg"></i> episódio novo &nbsp; <i class="ps leg"></i> sessão de vocês</p>
        ${carregando ? '<div class="skel txt"></div>' : ''}
        ${escolhido ? `<section><h2>${dataCurta(escolhido)}</h2>${doDia.length ? `<div class="list">${doDia.join('')}</div>` : '<p class="note">Nada marcado neste dia.</p>'}</section>` : '<p class="note">Toque num dia para ver o que tem.</p>'}
        ${nuvem.usuario() ? '' : '<p class="note">Entre na sua conta para ver também os episódios das suas séries e as sessões de vocês.</p>'}
      </div>`;
  }

  el.onclick = (ev) => {
    const b = ev.target.closest('button[data-dia]');
    if (!b) return;
    escolhido = b.dataset.dia;
    const rolagem = el.scrollTop;
    desenhar();
    el.scrollTop = rolagem;
  };

  desenhar();
  try {
    const doMes = social.sessoesJuntos().filter((x) => x.data >= inicio && x.data <= fim);
    const [filmes, eps, info] = await Promise.all([
      tmdb.estreiasEntre(inicio, fim),
      andamento.episodiosEntre(inicio, fim).catch(() => []),
      dados.resumos(doMes).catch(() => new Map()),
    ]);
    estreias = filmes;
    episodios = eps;
    sessoes = doMes.map((x) => ({ ...x, ...(info.get(`${x.tipo}:${x.tmdb_id}`) || {}) }));
  } catch (erro) {
    if (ctx.vivo()) el.innerHTML = erroFicha(erro);
    return;
  }
  carregando = false;
  if (!escolhido) escolhido = [...estreias.map((x) => x.data), ...episodios.map((x) => x.data), ...sessoes.map((x) => x.data)].sort()[0] || '';
  desenhar();
}
