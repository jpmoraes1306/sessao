// Connect the Stars: ligar um ator a outro pelos filmes em que atuaram. De um ator você escolhe um filme dele; do
// filme, alguém do elenco; e assim até chegar no ator de destino. Menos filmes, melhor.
// Há um par por rodada (troca à meia-noite e ao meio-dia de Brasília). Ele sai dos atores dos filmes que VOCÊS DOIS
// viram e fica gravado na conta (quem abre primeiro sorteia), então é o mesmo para os dois. Rota: #/estrelas/hoje.
import * as tmdb from '../tmdb.js';
import * as dados from '../dados.js';
import * as nuvem from '../nuvem.js';
import * as social from '../social.js';
import { $, esc, poster, foto, rodada, numeroDaRodada, proximaTroca, toast, perguntar } from '../ui.js';

const MAXIMO = 6;                 // filmes que dá para usar numa partida
const LOCAL = 'sessao:estrelas';  // caminho em andamento desta rodada, para não zerar ao sair e voltar
const sorteio = (n, sal) => (Math.imul(n + sal, 2654435761) >>> 8);
const embaralhar = (lista, n) => [...lista].sort((a, b) => sorteio(a.id, n) - sorteio(b.id, n));

const moldura = (miolo) => `<div class="backdrop curto" style="--a:#2a3f5c;--b:#101419"></div><button class="back" data-acao="voltar" aria-label="Voltar">‹</button>
  <div class="wrap" style="gap:16px"><div class="pessoa-topo" style="margin-top:-40px"><div><div class="eyebrow">Jogo da rodada</div><h1>Connect the Stars</h1></div></div>${miolo}</div>`;
const aviso = (titulo, texto) => moldura(`<div class="vazio"><b>${titulo}</b>${texto}</div>`);

/** Sorteia o par desta rodada e grava na conta. Devolve a linha gravada (a de quem chegou primeiro) ou { poucos: true }. */
async function sortear(b, dia) {
  if (!social.pronto()) await social.carregar();
  if (!social.pronto()) throw new Error('sem os dados do outro');
  const comuns = dados.todos().filter((t) => t.tipo === 'filme' && t.visto && social.doOutro('filme', t.id)?.visto);
  if (comuns.length < 8) return { poucos: true };
  const n = numeroDaRodada(dia);
  // os atores dos filmes que os dois viram (o resumo guardado na conta traz o elenco principal)
  const info = await dados.resumos(comuns.map((t) => ({ tipo: 'filme', tmdb_id: t.id })));
  const atores = new Map();
  for (const t of comuns) for (const p of (info.get(`filme:${t.id}`)?.elenco || []).slice(0, 5)) if (p?.id && p.nome) atores.set(p.id, { id: p.id, nome: p.nome });
  if (atores.size < 12) {
    // resumos antigos sem elenco: busca o de alguns filmes direto no TMDB
    for (const t of embaralhar(comuns, n).slice(0, 8)) {
      const elenco = await tmdb.elencoDoFilme(t.id).catch(() => []);
      for (const p of elenco.slice(0, 5)) atores.set(p.id, { id: p.id, nome: p.nome });
    }
  }
  // não repete os atores das últimas rodadas
  const { data: recentes } = await b.from('estrelas_dia').select('a, b').order('criado_em', { ascending: false }).limit(20);
  const usados = new Set((recentes || []).flatMap((r) => [r.a?.id, r.b?.id]));
  const fila = embaralhar([...atores.values()].filter((p) => !usados.has(p.id)), n);
  for (const A of fila.slice(0, 10)) {
    try {
      const filmesA = await tmdb.filmesComoAtor(A.id);
      if (filmesA.length < 6) continue;
      const deA = new Set(filmesA.map((f) => f.id));
      const F1 = filmesA[sorteio(n, 3) % Math.min(filmesA.length, 8)];
      const elenco1 = await tmdb.elencoDoFilme(F1.id);
      const eu = elenco1.find((p) => p.id === A.id);
      const pontes = embaralhar(elenco1.slice(0, 10).filter((p) => p.id !== A.id), n + 1);
      for (const X of pontes.slice(0, 4)) {
        const filmesX = (await tmdb.filmesComoAtor(X.id)).filter((f) => !deA.has(f.id));
        if (filmesX.length < 3) continue;
        const F2 = filmesX[sorteio(n, 7) % Math.min(filmesX.length, 6)];
        const elenco2 = await tmdb.elencoDoFilme(F2.id);
        for (const B of elenco2.slice(0, 8)) {
          if (B.id === A.id || B.id === X.id || elenco1.some((p) => p.id === B.id) || !B.foto) continue;
          const filmesB = await tmdb.filmesComoAtor(B.id);
          // o destino tem de ser alguém com carreira, e sem nenhum filme em comum com a partida (senão bastaria 1 filme)
          if (filmesB.length < 6 || filmesB.some((f) => deA.has(f.id))) continue;
          const linha = {
            dia,
            a: { id: A.id, nome: A.nome, foto: eu?.foto || '' },
            b: { id: B.id, nome: B.nome, foto: B.foto },
            solucao: [{ tipo: 'filme', id: F1.id, titulo: F1.titulo, ano: F1.ano, poster: F1.poster }, { tipo: 'ator', id: X.id, nome: X.nome, foto: X.foto }, { tipo: 'filme', id: F2.id, titulo: F2.titulo, ano: F2.ano, poster: F2.poster }],
          };
          await b.from('estrelas_dia').upsert(linha, { onConflict: 'dia', ignoreDuplicates: true });
          const { data } = await b.from('estrelas_dia').select('*').eq('dia', dia).maybeSingle();
          return data || linha;
        }
      }
    } catch { /* este ator não deu: tenta o próximo */ }
  }
  return { poucos: true };
}

export async function abrir(el, _id, ctx) {
  const u = nuvem.usuario();
  const o = u ? nuvem.outro() : null;
  if (!u || !o) { el.innerHTML = aviso('É um jogo para os dois', 'Entre na sua conta para jogar. Os atores saem dos filmes que você e o outro já viram.<div class="actions"><a class="btn small" href="#/perfil">Abrir o Perfil</a></div>'); return; }
  const b = nuvem.banco();
  const dia = rodada();
  let P; let jogadas; let mes;
  try {
    const { data } = await b.from('estrelas_dia').select('*').eq('dia', dia).maybeSingle();
    P = data || await sortear(b, dia);
    if (!ctx.vivo()) return;
    if (P.poucos) { el.innerHTML = aviso('Ainda não dá para montar o jogo', 'Ele usa os atores dos filmes que os dois já viram, e precisa de pelo menos 8 filmes em comum.'); return; }
    const { data: linhas, error } = await b.from('estrelas_jogadas').select('dia, user_id, filmes, conseguiu, caminho').gte('dia', `${dia.slice(0, 7)}-01`);
    if (error) throw error;
    mes = linhas || [];
    jogadas = mes.filter((j) => j.dia === dia);
  } catch (erro) {
    console.warn('connect the stars:', erro);
    if (ctx.vivo()) el.innerHTML = aviso('Não deu para carregar', 'Confira a internet e tente de novo.<div class="actions"><button class="btn small" data-acao="recarregar">Tentar de novo</button></div>');
    return;
  }
  if (!ctx.vivo()) return;

  const A = { tipo: 'ator', ...P.a };
  const B = { tipo: 'ator', ...P.b };
  let minha = jogadas.find((j) => j.user_id === u.id) || null;
  // o caminho: ator, filme, ator, filme... sempre começa no ator de partida
  let caminho = [A];
  try {
    const g = JSON.parse(localStorage.getItem(LOCAL) || 'null');
    if (g?.dia === dia && g.de === u.id && Array.isArray(g.caminho) && g.caminho[0]?.id === A.id) caminho = g.caminho;
  } catch { /* começa do zero */ }
  if (minha?.caminho?.length) caminho = minha.caminho;
  const guardar = () => { try { localStorage.setItem(LOCAL, JSON.stringify({ dia, de: u.id, caminho })); } catch { /* vale só nesta visita */ } };
  let opcoes = null;   // o que dá para escolher agora (filmes do ator atual, ou elenco do filme atual); null = carregando
  let erroOpcoes = false;
  let filtro = '';
  let ocupado = false;

  const filmesUsados = () => caminho.filter((x) => x.tipo === 'filme').length;
  const atual = () => caminho[caminho.length - 1];
  const elo = (x, alvo = false) => (x.tipo === 'filme'
    ? `<span class="es-elo filme" title="${esc(x.titulo)}">${poster(x, { tam: 'w154' })}<small>${esc(x.titulo)}</small></span>`
    : `<span class="es-elo${alvo ? ' alvo' : ''}" title="${esc(x.nome)}">${foto(x, 'sm')}<small>${esc(x.nome)}</small></span>`);
  const cadeia = (lista, comAlvo) => `<div class="es-cadeia">${lista.map((x) => elo(x)).join('<i>›</i>')}${comAlvo ? `<i>···</i>${elo(B, true)}` : ''}</div>`;
  const texto = (j, quem) => (!j ? `${quem} ainda não jogou` : j.conseguiu ? `${quem} ligou com ${j.filmes} filme${j.filmes > 1 ? 's' : ''}` : `${quem} não conseguiu`);

  async function carregarOpcoes() {
    opcoes = null; erroOpcoes = false; filtro = '';
    const x = atual();
    const usados = new Set(caminho.map((c) => `${c.tipo}:${c.id}`));
    try {
      const lista = x.tipo === 'ator'
        ? (await tmdb.filmesComoAtor(x.id)).slice(0, 60).map((f) => ({ tipo: 'filme', ...f }))
        : (await tmdb.elencoDoFilme(x.id)).map((p) => ({ tipo: 'ator', ...p }));
      opcoes = lista.filter((c) => !usados.has(`${c.tipo}:${c.id}`));
    } catch { opcoes = []; erroOpcoes = true; }
  }

  function listaDeOpcoes() {
    if (opcoes === null) return '<div class="skel txt"></div><div class="skel txt" style="width:70%"></div>';
    if (erroOpcoes) return '<p class="note">Não deu para buscar. Confira a internet e toque em "Voltar um passo".</p>';
    const f = filtro.trim().toLowerCase();
    const lista = opcoes.filter((c) => !f || (c.titulo || c.nome).toLowerCase().includes(f));
    if (!lista.length) return `<p class="note">${opcoes.length ? 'Nada com esse nome.' : 'Sem saída por aqui. Volte um passo.'}</p>`;
    return `<div class="grupo">${lista.map((c) => (c.tipo === 'filme'
      ? `<button class="lin es-op" data-pega="filme:${Number(c.id)}">${poster(c, { tam: 'w154' })}<span class="n">${esc(c.titulo)}<small>${c.ano || ''}</small></span></button>`
      : `<button class="lin es-op" data-pega="ator:${Number(c.id)}">${foto(c, 'sm')}<span class="n">${esc(c.nome)}</span></button>`)).join('')}</div>`;
  }

  function desenhar() {
    const fim = Boolean(minha);
    const x = atual();
    const n = filmesUsados();
    const dele = jogadas.find((j) => j.user_id === o.id);
    // quem ganhou cada rodada do mês: quem ligou com menos filmes (ou o único que conseguiu)
    const porRodada = new Map();
    for (const j of mes) porRodada.set(j.dia, [...(porRodada.get(j.dia) || []), j]);
    const pontos = (id) => [...porRodada.values()].filter((js) => {
      const meu = js.find((j) => j.user_id === id); const outro = js.find((j) => j.user_id !== id);
      return meu?.conseguiu && (!outro?.conseguiu || meu.filmes < outro.filmes);
    }).length;
    const nomeMes = new Date(`${dia.slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR', { month: 'long' });
    const rolagem = el.scrollTop;
    el.innerHTML = moldura(`
      <p class="sub2" style="display:block">Ligue <b style="color:var(--fg)">${esc(A.nome)}</b> a <b style="color:var(--fg)">${esc(B.nome)}</b> pelos filmes em que atuaram. De um ator, escolha um filme dele; do filme, alguém do elenco. Menos filmes, melhor (até ${MAXIMO}).</p>
      ${cadeia(caminho, !fim || !minha.conseguiu)}
      ${fim ? `<p class="dica">${minha.conseguiu ? `Ligou com ${minha.filmes} filme${minha.filmes > 1 ? 's' : ''}.` : 'Não foi dessa vez.'}</p>
        ${minha.conseguiu && minha.filmes <= 2 ? '' : `<section><h2>Um caminho possível <small>com 2 filmes</small></h2>${cadeia([A, ...P.solucao, B], false)}</section>`}
        ${dele?.conseguiu && dele.caminho?.length ? `<section><h2>O caminho de ${esc(o.nome)}</h2>${cadeia(dele.caminho, false)}</section>` : ''}
        <section><h2>Placar <small>rodadas ganhas em ${nomeMes}</small></h2>
          <div class="placar"><div class="${pontos(u.id) > pontos(o.id) ? 'lider' : ''}"><b>${pontos(u.id)}</b>você</div><span>${nomeMes}</span><div class="${pontos(o.id) > pontos(u.id) ? 'lider' : ''}"><b>${pontos(o.id)}</b>${esc(o.nome)}</div></div>
          <div class="grupo"><div class="lin"><span class="n">Nesta rodada<small>${texto(minha, 'Você')} · ${esc(texto(dele, o.nome))}</small></span></div></div></section>
        <p class="note">Ganha a rodada quem liga com menos filmes. O próximo par sai ${proximaTroca()}.</p>`
    : `<p class="dica" aria-live="polite">${x.tipo === 'ator' ? `Filme ${n + 1} de ${MAXIMO}: escolha um filme de ${esc(x.nome)}.` : `Quem do elenco de ${esc(x.titulo)}? Se ${esc(B.nome)} estiver aqui, é só tocar.`}</p>
        <div class="actions">${caminho.length > 1 ? '<button class="btn small" data-es="voltar">Voltar um passo</button>' : ''}<button class="btn small" data-es="desistir">Desistir</button></div>
        ${x.tipo === 'ator' && (opcoes?.length || 0) > 12 ? '<label class="search" for="es-filtro"><input id="es-filtro" type="search" placeholder="Filtrar pelo nome do filme" autocomplete="off" autocapitalize="off" spellcheck="false"></label>' : ''}
        <div id="es-opcoes">${listaDeOpcoes()}</div>`}`);
    el.scrollTop = rolagem;
  }

  async function terminar(conseguiu) {
    minha = { dia, user_id: u.id, filmes: conseguiu ? filmesUsados() : MAXIMO, conseguiu, caminho: conseguiu ? caminho : [] };
    jogadas.push(minha); mes.push(minha);
    desenhar();
    el.scrollTop = 0;
    const { error } = await b.from('estrelas_jogadas').upsert(minha, { onConflict: 'dia,user_id', ignoreDuplicates: true });
    if (error && ctx.vivo()) toast('Sem internet para mandar o resultado. Abra o jogo de novo mais tarde.');
  }

  el.oninput = (e) => {
    if (e.target.id !== 'es-filtro') return;
    filtro = e.target.value;
    $('#es-opcoes', el).innerHTML = listaDeOpcoes(); // só a lista: o campo continua com o cursor
  };
  el.onclick = async (e) => {
    const bt = e.target.closest('button');
    if (!bt || minha || ocupado) return;
    ocupado = true;
    try {
      if (bt.dataset.pega) {
        const [tipo, id] = bt.dataset.pega.split(':');
        const escolhido = (opcoes || []).find((c) => c.tipo === tipo && c.id === Number(id));
        if (!escolhido) return;
        caminho = [...caminho, escolhido];
        guardar();
        if (escolhido.tipo === 'ator' && escolhido.id === B.id) { await terminar(true); return; }
        if (escolhido.tipo === 'ator' && filmesUsados() >= MAXIMO) { await terminar(false); return; }
      } else if (bt.dataset.es === 'voltar') {
        caminho = caminho.slice(0, -1);
        guardar();
      } else if (bt.dataset.es === 'desistir') {
        if (!(await perguntar({ titulo: 'Desistir desta rodada?', texto: 'Você vê um caminho possível, mas não joga de novo até a próxima troca.', sim: 'Desistir', nao: 'Continuar tentando' }))) return;
        if (!ctx.vivo()) return;
        await terminar(false);
        return;
      } else return;
      opcoes = null;
      desenhar();
      el.scrollTop = 0;
      await carregarOpcoes();
      if (ctx.vivo() && !minha) desenhar();
    } finally { ocupado = false; }
  };

  if (!minha) { desenhar(); await carregarOpcoes(); if (!ctx.vivo()) return; }
  desenhar();
}
