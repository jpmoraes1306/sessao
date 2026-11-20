// Página de ator, diretor ou qualquer pessoa da equipe: foto, biografia e filmografia (filmes e séries).
import * as tmdb from '../tmdb.js';
import * as dados from '../dados.js';
import * as nuvem from '../nuvem.js';
import { simboloEscondido } from '../ovo.js';
import * as rankings from '../rankings.js';
import { $, esc, nota, selo, foto, tile, poster, erroFicha, dataBR, corDe } from '../ui.js';

// preferências de ordenação valem para todas as pessoas enquanto o app está aberto
let ordem = 'nota';
let esconderVistos = false;

/* ---------- rankings de vocês que são desta pessoa (o seu, montado no app, e o do outro) ---------- */
/** Uma linha do ranking; `direita` é o canto (a posição que o outro deu, ou a sua nota). */
function linhaRanking(i, direita) {
  return `<a class="rk-l" href="#/${i.tipo}/${i.tmdb_id}"><span class="pos">${i.posicao}</span>${poster({ titulo: i.r.titulo || '', poster: i.r.poster }, { tam: 'w154' })}
    <div class="tt"><b>${esc(i.r.titulo || 'Sem título')}</b><span>${i.r.ano || ''}</span></div><span class="dele">${direita}</span></a>`;
}
/** Em que posição a outra lista pôs o mesmo título, com uma seta quando é mais alto ou mais baixo que aqui. */
function comparar(i, outra, quem) {
  if (!outra) { const n = dados.titulo(i.tipo, i.tmdb_id).nota; return quem === 'você' && n != null ? `sua nota ${selo(n)}` : ''; }
  const la = outra.itens.find((x) => x.tipo === i.tipo && x.tmdb_id === i.tmdb_id);
  if (!la) return `${quem} não pôs`;
  const dif = i.posicao - la.posicao;
  return `${quem} <b>${la.posicao}º</b>${dif ? ` <span class="${dif > 0 ? 'sobe' : 'desce'}" aria-label="${dif > 0 ? 'mais alto' : 'mais baixo'} que aqui">${dif > 0 ? '▲' : '▼'}</span>` : ''}`;
}
function blocoRankings(p, achadas, abertas) {
  const u = nuvem.usuario();
  if (!u) return '';
  const meu = achadas.find((l) => l.user_id === u.id);
  const outros = achadas.filter((l) => l.user_id !== u.id);
  const vistos = rankings.vistosDaPessoa(p).length;
  const lista = (l, outra, quem) => {
    const tudo = abertas.has(l.id) || l.itens.length <= 6;
    return `<div class="rk">${(tudo ? l.itens : l.itens.slice(0, 5)).map((i) => linhaRanking(i, comparar(i, outra, quem))).join('')}</div>
      ${l.itens.length > 6 ? `<button class="mais" data-rank-tudo="${l.id}" style="margin-top:0">${tudo ? 'Mostrar só os 5 primeiros' : `Ver os ${l.itens.length}`}</button>` : ''}`;
  };
  const primeiroNome = esc(p.nome.trim().split(/\s+/).pop());
  let meuBloco = '';
  if (meu) meuBloco = `<section><h2>Seu ranking <small><a class="link" href="#/ranking/pessoa-${p.id}">Editar</a></small></h2>${lista(meu, outros[0], esc(nuvem.pessoa(outros[0]?.user_id)?.nome || ''))}</section>`;
  else if (vistos >= 2) meuBloco = `<section><h2>Seu ranking</h2><div class="grupo"><div class="lin"><span class="n">Você ainda não ranqueou ${primeiroNome}<small>Já viu ${vistos} títulos. Começa pela ordem das suas notas.</small></span><a class="btn small on-star" href="#/ranking/pessoa-${p.id}">Montar</a></div></div></section>`;
  return meuBloco + outros.map((l) => `<section><h2>Ranking de ${esc(nuvem.pessoa(l.user_id)?.nome || 'vocês')} <small>lista "${esc(l.nome)}"</small></h2>${lista(l, meu, 'você')}</section>`).join('');
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
    ${lista.length ? `<div class="grid4">${lista.map((c) => tile(c)).join('')}</div>` : `<p class="note">${esconderVistos && total ? 'Você já viu todos.' : 'Nada por aqui.'}</p>`}`;
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
    <div id="rankings" style="display:flex;flex-direction:column;gap:22px" hidden></div>
    <div id="filmografia" style="display:flex;flex-direction:column;gap:14px">${corpo()}</div>
    <p class="note">Filmografia e fotos: TMDB.</p>${simboloEscondido('ficha')}
   </div>`;
  const syn = $('.syn', el);
  if (syn && syn.scrollHeight <= syn.clientHeight + 2) { syn.classList.remove('clamp'); syn.nextElementSibling?.remove(); }

  let doRanking = [];
  const abertas = new Set(); // rankings em que a pessoa pediu para ver todos
  const desenharRankings = () => {
    const caixa = $('#rankings', el);
    const html = blocoRankings(p, doRanking, abertas);
    if (!caixa || !html) return;
    caixa.innerHTML = html;
    caixa.hidden = false;
  };
  rankings.daPessoa(p).catch(() => []).then((achadas) => {
    if (!ctx.vivo()) return;
    doRanking = achadas;
    desenharRankings();
  });

  el.onclick = (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.dataset.rankTudo) {
      const id = Number(t.dataset.rankTudo);
      if (abertas.has(id)) abertas.delete(id); else abertas.add(id);
      desenharRankings();
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
