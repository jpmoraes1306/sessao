// Página de ator, diretor ou qualquer pessoa da equipe: foto, biografia e filmografia (filmes e séries).
import * as tmdb from '../tmdb.js';
import * as dados from '../dados.js';
import * as nuvem from '../nuvem.js';
import { carinha } from '../ovo.js';
import { $, esc, nota, selo, foto, tile, poster, erroFicha, dataBR, corDe } from '../ui.js';

// preferências de ordenação valem para todas as pessoas enquanto o app está aberto
let ordem = 'nota';
let esconderVistos = false;

/* ---------- rankings de vocês que são desta pessoa (ex.: "Nolan ranked" na página do Nolan) ---------- */
let rankings = null; // listas com ordem dos dois, com os itens; carrega uma vez por login
let rankingsDe = null;

async function listasComOrdem() {
  const b = nuvem.banco();
  const eu = nuvem.usuario()?.id;
  if (!b || !eu) return [];
  if (rankings && rankingsDe === eu) return rankings;
  const { data } = await b.from('listas').select('id, nome, user_id, lista_itens(posicao, tipo, tmdb_id)').eq('ranqueada', true);
  rankings = data || [];
  rankingsDe = eu;
  return rankings;
}

const semAcento = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** A lista é desta pessoa quando o sobrenome está no nome da lista e metade dos títulos é dela, ou quando quase todos são dela. */
async function rankingsDaPessoa(p) {
  const feitos = new Map(p.creditos.map((c) => [`${c.tipo}:${c.id}`, c]));
  const sobrenome = semAcento(p.nome.trim().split(/\s+/).pop());
  const achadas = [];
  for (const l of await listasComOrdem()) {
    const itens = (l.lista_itens || []).slice().sort((a, b) => a.posicao - b.posicao);
    if (itens.length < 2) continue;
    const dentro = itens.filter((i) => feitos.has(`${i.tipo}:${i.tmdb_id}`)).length / itens.length;
    const noNome = semAcento(l.nome).split(/[^a-z0-9]+/).includes(sobrenome);
    if ((noNome && dentro >= 0.5) || (itens.length >= 3 && dentro >= 0.9)) achadas.push({ ...l, itens });
  }
  if (!achadas.length) return [];
  const fora = achadas.flatMap((l) => l.itens).filter((i) => !feitos.has(`${i.tipo}:${i.tmdb_id}`));
  const info = fora.length ? await dados.resumos(fora).catch(() => new Map()) : new Map();
  for (const l of achadas) for (const i of l.itens) i.r = feitos.get(`${i.tipo}:${i.tmdb_id}`) || info.get(`${i.tipo}:${i.tmdb_id}`) || {};
  return achadas;
}

function blocoRanking(l, tudo) {
  const dono = nuvem.pessoa(l.user_id);
  const itens = tudo ? l.itens : l.itens.slice(0, 5);
  return `<div class="card" data-ranking="${l.id}">
    <div class="eyebrow">${dono?.eu ? 'Seu ranking' : `Ranking de ${esc(dono?.nome || 'vocês')}`}</div>
    <div class="list" style="margin-top:6px">${itens.map((i) => { const meu = dados.titulo(i.tipo, i.tmdb_id); return `
      <a class="li" href="#/${i.tipo}/${i.tmdb_id}" style="grid-template-columns:26px 36px 1fr auto"><span class="date" style="font-size:18px">${i.posicao}</span>${poster({ titulo: i.r.titulo || '', poster: i.r.poster }, { tam: 'w154' })}
        <div><div class="t">${esc(i.r.titulo || 'Sem título')}</div><div class="s">${i.r.ano || ''}</div></div><span class="r">${meu.nota != null ? `você ${selo(meu.nota)}` : meu.visto ? 'visto' : ''}</span></a>`; }).join('')}</div>
    ${!tudo && l.itens.length > 5 ? `<button class="mais" data-rank-tudo="${l.id}">ver os ${l.itens.length}</button>` : ''}
    <p class="note" style="margin-top:6px">Lista "${esc(l.nome)}".</p></div>`;
}

function idade(nasc, morte) {
  const fim = morte ? new Date(morte) : new Date();
  const n = new Date(nasc);
  let a = fim.getFullYear() - n.getFullYear();
  if (fim.getMonth() < n.getMonth() || (fim.getMonth() === n.getMonth() && fim.getDate() < n.getDate())) a--;
  return a;
}

export async function abrir(el, id, ctx) {
  let p;
  try { p = await tmdb.pessoa(id); } catch (erro) { if (ctx.vivo()) el.innerHTML = erroFicha(erro); return; }
  if (!ctx.vivo()) return;

  // categorias em que a pessoa trabalhou, da mais frequente para a menos
  const conta = {};
  for (const c of p.creditos) for (const cat in c.categorias) conta[cat] = (conta[cat] || 0) + 1;
  const categorias = Object.entries(conta).sort((a, b) => b[1] - a[1]).map(([c]) => c);
  let categoria = categorias.includes(p.depto) ? p.depto : categorias[0];
  let tipo = 'tudo';

  const daCategoria = () => p.creditos.filter((c) => categoria in c.categorias);

  function corpo() {
    const base = daCategoria();
    const temFilme = base.some((c) => c.tipo === 'filme');
    const temSerie = base.some((c) => c.tipo === 'serie');
    if (tipo !== 'tudo' && !base.some((c) => c.tipo === tipo)) tipo = 'tudo';
    let lista = base.filter((c) => tipo === 'tudo' || c.tipo === tipo);
    const total = lista.length;
    const meus = lista.map((c) => dados.titulo(c.tipo, c.id));
    const vistos = meus.filter((m) => m.visto || m.seguindo).length;
    const ns = meus.map((m) => m.nota).filter((n) => n != null);
    const media = ns.length ? ns.reduce((x, y) => x + y, 0) / ns.length : null;
    lista = lista.slice().sort(ordem === 'nota'
      ? (x, y) => tmdb.pesoNota(y) - tmdb.pesoNota(x)
      : (x, y) => (y.data || '9999').localeCompare(x.data || '9999'));
    if (esconderVistos) lista = lista.filter((c) => !dados.titulo(c.tipo, c.id).visto);
    const oQue = tipo === 'serie' ? 'séries' : tipo === 'filme' ? 'filmes' : 'títulos';

    return `
    ${categorias.length > 1 ? `<div class="seg" role="group" aria-label="Função">${categorias.slice(0, 5).map((c) => `<button data-cat="${esc(c)}" aria-pressed="${c === categoria}">${esc(c)} <span style="opacity:.6">${conta[c]}</span></button>`).join('')}</div>` : ''}
    <div class="card">
      <div class="entre"><span>Você viu <b>${vistos}</b> de ${total} ${oQue}</span><span>${media != null ? `sua média ${nota(media)}` : ''}</span></div>
      <div class="lbar-big"><i style="width:${total ? (vistos / total) * 100 : 0}%"></i></div>
    </div>
    ${temFilme && temSerie ? `<div class="seg" role="group" aria-label="Filmes ou séries"><button data-tipo="tudo" aria-pressed="${tipo === 'tudo'}">Tudo</button><button data-tipo="filme" aria-pressed="${tipo === 'filme'}">Filmes</button><button data-tipo="serie" aria-pressed="${tipo === 'serie'}">Séries</button></div>` : ''}
    <div class="seg" role="group" aria-label="Ordenar">
      <button data-ordem="nota" aria-pressed="${ordem === 'nota'}">Maior nota</button>
      <button data-ordem="ano" aria-pressed="${ordem === 'ano'}">Mais recentes</button>
      <button data-esconder aria-pressed="${esconderVistos}">Esconder vistos</button>
    </div>
    ${lista.length ? `<div class="grid3">${lista.map((c) => {
      const m = dados.titulo(c.tipo, c.id);
      const papel = c.categorias[categoria];
      return tile(c, m.nota != null ? `sua nota ${selo(m.nota)}` : `${c.ano || 'em breve'}${papel && categoria === 'Atuação' ? ` · ${esc(papel)}` : ''}`);
    }).join('')}</div>` : `<p class="note">${esconderVistos && total ? 'Você já viu todos.' : 'Nada por aqui.'}</p>`}`;
  }

  const [a, b] = corDe(p.nome);
  const vida = [
    p.nascimento ? `${dataBR(p.nascimento)}${p.morte ? ` – ${dataBR(p.morte)}` : ''} · ${idade(p.nascimento, p.morte)} anos` : '',
    p.local,
  ].filter(Boolean).join('<br>');

  el.innerHTML = `
   <div class="backdrop curto" style="--a:${a};--b:${b}"></div>
   <button class="back" data-acao="voltar" aria-label="Voltar">‹</button>
   <div class="wrap" style="gap:20px">
    <div class="pessoa-topo">${foto(p, 'lg')}
      <div style="min-width:0"><div class="eyebrow">${esc(categorias.slice(0, 2).join(' · ') || p.depto)}</div><h1>${esc(p.nome)}</h1></div></div>
    ${vida ? `<p class="note" style="font-size:13px;color:var(--muted)">${vida}</p>` : ''}
    ${p.bio ? `<p class="syn clamp">${esc(p.bio)}</p><button class="mais" data-acao="abrir-texto">Ler mais</button>${p.bioIdioma === 'en' ? '<p class="note" style="margin-top:-10px">Biografia ainda sem tradução no TMDB.</p>' : ''}` : ''}
    <div id="rankings" style="display:flex;flex-direction:column;gap:14px" hidden></div>
    <div id="filmografia" style="display:flex;flex-direction:column;gap:14px">${corpo()}</div>
    <p class="note">Filmografia e fotos: TMDB.</p>${carinha('ficha')}
   </div>`;
  const syn = $('.syn', el);
  if (syn && syn.scrollHeight <= syn.clientHeight + 2) { syn.classList.remove('clamp'); syn.nextElementSibling?.remove(); }

  let doRanking = [];
  rankingsDaPessoa(p).then((achadas) => {
    const caixa = $('#rankings', el);
    if (!ctx.vivo() || !caixa || !achadas.length) return;
    doRanking = achadas;
    caixa.innerHTML = achadas.map((l) => blocoRanking(l, false)).join('');
    caixa.hidden = false;
  }).catch(() => { /* sem ranking a página continua igual */ });

  el.onclick = (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.dataset.rankTudo) {
      const l = doRanking.find((x) => String(x.id) === t.dataset.rankTudo);
      if (l) t.closest('[data-ranking]').outerHTML = blocoRanking(l, true);
      return;
    }
    if (t.dataset.cat) categoria = t.dataset.cat;
    else if (t.dataset.tipo) tipo = t.dataset.tipo;
    else if (t.dataset.ordem) ordem = t.dataset.ordem;
    else if (t.hasAttribute('data-esconder')) esconderVistos = !esconderVistos;
    else return;
    $('#filmografia', el).innerHTML = corpo();
  };
}
