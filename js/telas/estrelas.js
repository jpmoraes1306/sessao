// Seis graus: ligar um ator a outro num MAPA de fotos. Você digita um filme ou série em que um ator do mapa atuou e
// ele entra ligado a esse ator; depois digita um ator desse título, e assim o mapa cresce até os dois se encontrarem.
// Menos títulos no caminho, melhor. Há um par por rodada (troca à meia-noite e ao meio-dia de Brasília), tirado do
// elenco dos filmes que VOCÊS DOIS viram e gravado na conta (quem abre primeiro sorteia), então é o mesmo para os dois.
// É o jogo dos dias ímpares; nos pares o jogo é o frame (ver jogoDoDia em ui.js). Rota: #/estrelas/hoje.
import * as tmdb from '../tmdb.js';
import * as dados from '../dados.js';
import * as nuvem from '../nuvem.js';
import * as social from '../social.js';
import { $, esc, poster, foto, rodada, numeroDaRodada, proximaTroca, jogoDoDia, NOME_DO_JOGO, toast, perguntar } from '../ui.js';

const LOCAL = 'sessao:estrelas';  // o mapa em andamento desta rodada, para não zerar ao sair e voltar
const sorteio = (n, sal) => (Math.imul(n + sal, 2654435761) >>> 8);
const embaralhar = (lista, n) => [...lista].sort((a, b) => sorteio(a.id, n) - sorteio(b.id, n));
const K = (x) => `${x.tipo}:${x.id}`;
const nomeDe = (x) => x.titulo || x.nome || '';

const moldura = (miolo) => `<div class="backdrop curto" style="--a:#2a3f5c;--b:#101419"></div><button class="back" data-acao="voltar" aria-label="Voltar">‹</button>
  <div class="wrap" style="gap:14px"><div class="pessoa-topo" style="margin-top:-40px"><div><div class="eyebrow">Jogo de hoje</div><h1>Seis graus</h1></div></div>${miolo}</div>`;
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
          // o destino tem de ser alguém com carreira, e sem nenhum filme em comum com a partida (senão bastaria 1 título)
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
  if (jogoDoDia() !== 'estrelas') { el.innerHTML = aviso(`Hoje o jogo é o ${NOME_DO_JOGO.frame}`, 'Os dois jogos se revezam, um dia cada. O Seis graus volta amanhã.<div class="actions"><a class="btn small on-star" href="#/frame/hoje">Jogar o frame</a></div>'); return; }
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
    console.warn('seis graus:', erro);
    if (ctx.vivo()) el.innerHTML = aviso('Não deu para carregar', 'Confira a internet e tente de novo.<div class="actions"><button class="btn small" data-acao="recarregar">Tentar de novo</button></div>');
    return;
  }
  if (!ctx.vivo()) return;

  /* ----- o mapa: nós (atores e títulos) e ligações (ator <-> título) ----- */
  const A = { tipo: 'ator', ...P.a };
  const B = { tipo: 'ator', ...P.b };
  const nos = new Map();     // "ator:1" / "filme:2" / "serie:3" -> { tipo, id, nome|titulo, foto|poster, ano, x, y }
  let arestas = [];          // [chave do ator, chave do título]
  const elencos = new Map(); // chave do título -> Set com os ids de todo o elenco
  let palpites = 0; let dicas = 0;
  let minha = jogadas.find((j) => j.user_id === u.id) || null;
  const por = (x) => { if (!nos.has(K(x))) nos.set(K(x), { ...x }); return nos.get(K(x)); };
  por(A); por(B);
  try {
    const g = JSON.parse(localStorage.getItem(LOCAL) || 'null');
    if (g?.dia === dia && g.de === u.id && Array.isArray(g.nos) && Array.isArray(g.arestas)) {
      for (const x of g.nos) if (x?.tipo && x.id) por({ tipo: x.tipo, id: x.id, nome: x.nome, titulo: x.titulo, foto: x.foto, poster: x.poster, ano: x.ano });
      arestas = g.arestas.filter(([p, t]) => nos.has(p) && nos.has(t));
      palpites = Number(g.palpites) || 0; dicas = Number(g.dicas) || 0;
    }
  } catch { /* começa só com os dois atores */ }
  const guardar = () => {
    try {
      localStorage.setItem(LOCAL, JSON.stringify({ dia, de: u.id, palpites, dicas, arestas,
        nos: [...nos.values()].map((x) => ({ tipo: x.tipo, id: x.id, nome: x.nome, titulo: x.titulo, foto: x.foto, poster: x.poster, ano: x.ano })) }));
    } catch { /* vale só nesta visita */ }
  };

  /** Todo o elenco de um título (ids), buscado uma vez. */
  async function elencoDe(t) {
    if (!elencos.has(K(t))) elencos.set(K(t), new Set((await tmdb.elencoCompleto(t.tipo, t.id)).map((p) => p.id)));
    return elencos.get(K(t));
  }
  /** O caminho mais curto entre os dois atores pelo que já está no mapa (lista de nós) ou null. */
  function caminhoMaisCurto() {
    const vizinhos = new Map();
    for (const [p, t] of arestas) { vizinhos.set(p, [...(vizinhos.get(p) || []), t]); vizinhos.set(t, [...(vizinhos.get(t) || []), p]); }
    const de = new Map([[K(A), null]]);
    const fila = [K(A)];
    while (fila.length) {
      const k = fila.shift();
      if (k === K(B)) { const volta = []; for (let x = k; x; x = de.get(x)) volta.unshift(nos.get(x)); return volta; }
      for (const v of vizinhos.get(k) || []) if (!de.has(v)) { de.set(v, k); fila.push(v); }
    }
    return null;
  }

  /* ----- posição dos nós: os dois atores ficam nas pontas e o resto se ajeita sozinho (molas e repulsão) ----- */
  function arrumar() {
    const lista = [...nos.values()];
    const a = nos.get(K(A)); const z = nos.get(K(B));
    a.x = -105; a.y = -150; z.x = 105; z.y = 150;
    for (const n of lista) {
      if (n.x != null) continue;
      const viz = arestas.filter((e) => e[0] === K(n) || e[1] === K(n)).map((e) => nos.get(e[0] === K(n) ? e[1] : e[0])).filter((v) => v && v.x != null);
      const cx = viz.length ? viz.reduce((s, v) => s + v.x, 0) / viz.length : 0;
      const cy = viz.length ? viz.reduce((s, v) => s + v.y, 0) / viz.length : 0;
      const ang = (sorteio(n.id, 3) % 628) / 100;
      // nasce perto de quem está ligado, puxando um pouco para o meio do mapa
      n.x = cx * 0.8 + Math.cos(ang) * 60; n.y = cy * 0.8 + Math.sin(ang) * 60;
    }
    for (let volta = 0; volta < 240; volta++) {
      for (const n of lista) { n.fx = -n.x * 0.006; n.fy = -n.y * 0.006; }
      for (let i = 0; i < lista.length; i++) for (let j = i + 1; j < lista.length; j++) {
        const p = lista[i]; const q = lista[j];
        let dx = p.x - q.x; let dy = p.y - q.y;
        if (!dx && !dy) { dx = 1; dy = 1; }
        const d2 = Math.max(dx * dx + dy * dy, 400);
        const d = Math.sqrt(d2); const f = 5200 / d2;
        p.fx += (dx / d) * f; p.fy += (dy / d) * f; q.fx -= (dx / d) * f; q.fy -= (dy / d) * f;
      }
      for (const [kp, kt] of arestas) {
        const p = nos.get(kp); const q = nos.get(kt);
        const dx = q.x - p.x; const dy = q.y - p.y;
        const d = Math.hypot(dx, dy) || 1; const f = (d - 104) * 0.05;
        p.fx += (dx / d) * f; p.fy += (dy / d) * f; q.fx -= (dx / d) * f; q.fy -= (dy / d) * f;
      }
      for (const n of lista) {
        if (n === a || n === z) continue;
        n.x += Math.max(-10, Math.min(10, n.fx)); n.y += Math.max(-10, Math.min(10, n.fy));
      }
    }
  }

  let escolhido = null;      // nó tocado (para a dica)
  let achados = null;        // sugestões da busca ou da dica: { rotulo, itens } | 'buscando' | 'erro' | null
  let recado = '';           // o que aconteceu com o último palpite
  let vezBusca = 0; let espera = 0;
  let ocupado = false;
  let arrasto = { x: 0, y: 0 }; // quanto a pessoa arrastou o mapa

  const noHtml = (n, noCaminho) => {
    const classes = ['mp-no', n.tipo === 'ator' ? 'ator' : 'tit', K(n) === K(A) ? 'ponta' : '', K(n) === K(B) ? 'ponta alvo' : '', noCaminho.has(K(n)) ? 'caminho' : '', escolhido === K(n) ? 'sel' : ''].filter(Boolean).join(' ');
    return `<button class="${classes}" data-no="${K(n)}" style="left:${n.x.toFixed(1)}px;top:${n.y.toFixed(1)}px" aria-label="${esc(nomeDe(n))}">
      ${n.tipo === 'ator' ? foto(n, '') : poster(n, { tam: 'w154' })}<small>${esc(nomeDe(n))}</small></button>`;
  };
  function mapaHtml() {
    arrumar();
    const lista = [...nos.values()];
    const caminho = caminhoMaisCurto();
    const noCaminho = new Set((caminho || []).map(K));
    const linhas = arestas.map(([kp, kt]) => { const p = nos.get(kp); const q = nos.get(kt); return `<line x1="${p.x.toFixed(1)}" y1="${p.y.toFixed(1)}" x2="${q.x.toFixed(1)}" y2="${q.y.toFixed(1)}" class="${noCaminho.has(kp) && noCaminho.has(kt) ? 'caminho' : ''}"/>`; }).join('');
    // o mapa novo nasce no enquadramento em que o anterior estava, para deslizar até o novo em vez de pular
    return `<div class="mp-camada"${enquadre ? ` style="transform:${enquadre}"` : ''}><svg class="mp-linhas" width="2" height="2" aria-hidden="true">${linhas}</svg>${lista.map((n) => noHtml(n, noCaminho)).join('')}</div>`;
  }
  let enquadre = ''; // o último enquadramento aplicado ao mapa
  /** Encaixa o mapa inteiro no quadro (encolhe quando cresce) e aplica o que a pessoa arrastou. */
  function encaixar() {
    const quadro = $('#mapa', el);
    const camada = quadro?.querySelector('.mp-camada');
    if (!camada) return;
    const lista = [...nos.values()];
    const x0 = Math.min(...lista.map((n) => n.x)) - 44; const x1 = Math.max(...lista.map((n) => n.x)) + 44;
    const y0 = Math.min(...lista.map((n) => n.y)) - 40; const y1 = Math.max(...lista.map((n) => n.y)) + 58;
    const L = quadro.clientWidth; const Hq = quadro.clientHeight;
    const s = Math.max(0.5, Math.min(1.15, L / (x1 - x0), Hq / (y1 - y0)));
    const tx = L / 2 - ((x0 + x1) / 2) * s + arrasto.x; const ty = Hq / 2 - ((y0 + y1) / 2) * s + arrasto.y;
    const novo = `translate(${tx.toFixed(1)}px,${ty.toFixed(1)}px) scale(${s.toFixed(3)})`;
    if (!enquadre) { // primeira vez: já aparece no lugar, sem animação
      camada.style.transition = 'none';
      camada.style.transform = novo;
      camada.getBoundingClientRect();
      camada.style.transition = '';
    } else camada.style.transform = novo;
    enquadre = novo;
  }

  const linhaSugestao = (c) => (c.tipo === 'pessoa' || c.tipo === 'ator'
    ? `<button class="lin es-op" data-palpite="ator:${Number(c.id)}">${foto(c, 'sm')}<span class="n">${esc(c.nome)}<small>ator ou atriz</small></span></button>`
    : `<button class="lin es-op" data-palpite="${c.tipo}:${Number(c.id)}">${poster(c, { tam: 'w154' })}<span class="n">${esc(c.titulo)}<small>${[c.ano, c.tipo === 'serie' ? 'série' : 'filme'].filter(Boolean).join(' · ')}</small></span></button>`);
  function achadosHtml() {
    if (achados === 'buscando') return '<div class="skel txt"></div><div class="skel txt" style="width:70%"></div>';
    if (achados === 'erro') return '<p class="note">Não deu para buscar. Confira a internet.</p>';
    if (!achados) return '';
    return `${achados.rotulo ? `<p class="note">${esc(achados.rotulo)}</p>` : ''}${achados.itens.length ? `<div class="grupo">${achados.itens.map(linhaSugestao).join('')}</div>` : '<p class="note">Nada encontrado.</p>'}`;
  }
  const elo = (x) => (x.tipo === 'ator'
    ? `<span class="es-elo" title="${esc(x.nome)}">${foto(x, 'sm')}<small>${esc(x.nome)}</small></span>`
    : `<span class="es-elo filme" title="${esc(x.titulo)}">${poster(x, { tam: 'w154' })}<small>${esc(x.titulo)}</small></span>`);
  const cadeia = (lista) => `<div class="es-cadeia">${lista.map(elo).join('<i>›</i>')}</div>`;
  const texto = (j, quem) => (!j ? `${quem} ainda não jogou` : j.conseguiu ? `${quem} ligou com ${j.filmes} título${j.filmes > 1 ? 's' : ''}` : `${quem} não conseguiu`);

  function painelDoNo() {
    const n = escolhido ? nos.get(escolhido) : null;
    if (!n || minha) return '';
    return `<div class="grupo"><div class="lin"><span class="n">${esc(nomeDe(n))}<small>${n.tipo === 'ator' ? 'Travou? Veja alguns títulos em que atuou.' : `${n.ano || ''} · Travou? Veja parte do elenco.`}</small></span><button class="btn small" data-es="dica">Dica</button></div></div>`;
  }

  function desenhar() {
    const fim = Boolean(minha);
    const dele = jogadas.find((j) => j.user_id === o.id);
    const porRodada = new Map();
    for (const j of mes) porRodada.set(j.dia, [...(porRodada.get(j.dia) || []), j]);
    // quem ganhou cada rodada do mês: quem ligou com menos títulos (ou o único que conseguiu)
    const pontos = (id) => [...porRodada.values()].filter((js) => {
      const meu = js.find((j) => j.user_id === id); const outro = js.find((j) => j.user_id !== id);
      return meu?.conseguiu && (!outro?.conseguiu || meu.filmes < outro.filmes);
    }).length;
    const nomeMes = new Date(`${dia.slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR', { month: 'long' });
    const temMapa = nos.size > 2;
    const rolagem = el.scrollTop;
    el.innerHTML = moldura(`
      <p class="sub2" style="display:block">Ligue <b style="color:var(--fg)">${esc(A.nome)}</b> a <b style="color:var(--star)">${esc(B.nome)}</b>. ${fim ? '' : 'Digite um filme ou série em que um ator do mapa atuou; depois, um ator desse título. O mapa cresce até os dois se encontrarem.'}</p>
      ${!fim || temMapa ? `<div class="mapa${fim ? ' fim' : ''}" id="mapa">${mapaHtml()}</div>` : ''}
      ${fim ? `<p class="dica">${minha.conseguiu ? `Ligou com ${minha.filmes} título${minha.filmes > 1 ? 's' : ''}${palpites ? ` (${palpites} palpite${palpites > 1 ? 's' : ''}${dicas ? `, ${dicas} dica${dicas > 1 ? 's' : ''}` : ''})` : ''}.` : 'Não foi dessa vez.'}</p>
        ${minha.conseguiu && minha.caminho?.length && !temMapa ? cadeia(minha.caminho) : ''}
        ${minha.conseguiu && minha.filmes <= 2 ? '' : `<section><h2>Um caminho possível <small>com 2 títulos</small></h2>${cadeia([A, ...P.solucao, B])}</section>`}
        ${dele?.conseguiu && dele.caminho?.length ? `<section><h2>O caminho de ${esc(o.nome)}</h2>${cadeia(dele.caminho)}</section>` : ''}
        <section><h2>Placar <small>rodadas ganhas em ${nomeMes}</small></h2>
          <div class="placar"><div class="${pontos(u.id) > pontos(o.id) ? 'lider' : ''}"><b>${pontos(u.id)}</b>você</div><span>${nomeMes}</span><div class="${pontos(o.id) > pontos(u.id) ? 'lider' : ''}"><b>${pontos(o.id)}</b>${esc(o.nome)}</div></div>
          <div class="grupo"><div class="lin"><span class="n">Nesta rodada<small>${texto(minha, 'Você')} · ${esc(texto(dele, o.nome))}</small></span></div></div></section>
        <p class="note">Ganha a rodada quem liga com menos títulos. O próximo par sai ${proximaTroca()}; amanhã o jogo é o frame.</p>`
    : `<p class="dica" id="es-recado" aria-live="polite">${esc(recado || (temMapa ? 'Toque numa foto do mapa se precisar de uma dica.' : `Comece por um filme ou série com ${A.nome} ou com ${B.nome}.`))}</p>
        <label class="search" for="es-q"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>
          <input id="es-q" type="search" inputmode="search" enterkeyhint="search" placeholder="Filme, série ou ator" autocomplete="off" autocapitalize="off" spellcheck="false"></label>
        <div id="es-painel">${painelDoNo()}</div>
        <div id="es-achados" style="display:flex;flex-direction:column;gap:8px">${achadosHtml()}</div>
        <div class="actions"><button class="texto" data-es="desistir" style="color:var(--muted)">Desistir desta rodada</button></div>`}`);
    el.scrollTop = rolagem;
    encaixar();
  }
  /** Refaz só o mapa e os avisos, sem mexer no campo de busca (a pessoa pode estar digitando). */
  function atualizar() {
    const quadro = $('#mapa', el);
    if (!quadro) { desenhar(); return; }
    quadro.innerHTML = mapaHtml();
    encaixar();
    const r = $('#es-recado', el); if (r) r.textContent = recado;
    const p = $('#es-painel', el); if (p) p.innerHTML = painelDoNo();
    const a = $('#es-achados', el); if (a) a.innerHTML = achadosHtml();
  }

  async function terminar(conseguiu) {
    const caminho = conseguiu ? caminhoMaisCurto() : null;
    const titulos = caminho ? caminho.filter((x) => x.tipo !== 'ator').length : 6;
    minha = { dia, user_id: u.id, filmes: Math.max(1, Math.min(6, titulos)), conseguiu, caminho: (caminho || []).map((x) => ({ tipo: x.tipo, id: x.id, nome: x.nome, titulo: x.titulo, foto: x.foto, poster: x.poster, ano: x.ano })) };
    jogadas.push(minha); mes.push(minha);
    escolhido = null; achados = null;
    guardar();
    desenhar();
    el.scrollTop = 0;
    const { error } = await b.from('estrelas_jogadas').upsert(minha, { onConflict: 'dia,user_id', ignoreDuplicates: true });
    if (error && ctx.vivo()) toast('Sem internet para mandar o resultado. Abra o jogo de novo mais tarde.');
  }

  /** Um palpite: o título só entra se algum ator do mapa estiver nele; o ator só entra se estiver num título do mapa. */
  async function tentar(c) {
    palpites++;
    const novo = c.tipo === 'ator'
      ? { tipo: 'ator', id: c.id, nome: c.nome, foto: c.foto || '' }
      : { tipo: c.tipo, id: c.id, titulo: c.titulo, poster: c.poster || '', ano: c.ano ?? null };
    if (nos.has(K(novo))) { recado = `${nomeDe(novo)} já está no mapa.`; palpites--; return; }
    const ligados = [];
    if (novo.tipo === 'ator') {
      for (const t of [...nos.values()].filter((x) => x.tipo !== 'ator')) if ((await elencoDe(t)).has(novo.id)) ligados.push([K(novo), K(t)]);
      if (!ligados.length) { recado = nos.size > 2 ? `${novo.nome} não está em nenhum título do mapa.` : 'Antes de um ator, ponha um filme ou série no mapa.'; return; }
    } else {
      const elenco = await elencoDe(novo);
      for (const p of [...nos.values()].filter((x) => x.tipo === 'ator')) if (elenco.has(p.id)) ligados.push([K(p), K(novo)]);
      if (!ligados.length) { recado = `Nenhum ator do mapa está em ${novo.titulo}.`; elencos.delete(K(novo)); return; }
    }
    por(novo);
    arestas = [...arestas, ...ligados];
    recado = novo.tipo === 'ator' ? `${novo.nome} entrou no mapa. Agora um título dele.` : `${novo.titulo} entrou no mapa. Agora alguém do elenco.`;
    arrasto = { x: 0, y: 0 };
  }

  el.oninput = (e) => {
    if (e.target.id !== 'es-q') return;
    clearTimeout(espera);
    const q = e.target.value.trim();
    const minhaVez = ++vezBusca; // uma resposta antiga que chegar depois não cobre a busca nova
    if (q.length < 2) { achados = null; $('#es-achados', el).innerHTML = ''; return; }
    espera = setTimeout(async () => {
      achados = 'buscando';
      $('#es-achados', el).innerHTML = achadosHtml();
      let r;
      try { r = { rotulo: '', itens: (await tmdb.buscar(q)).slice(0, 7) }; } catch { r = 'erro'; }
      if (minhaVez !== vezBusca || !ctx.vivo() || minha) return;
      achados = r;
      $('#es-achados', el).innerHTML = achadosHtml();
    }, 320);
  };

  // arrastar o mapa com o dedo (quando ele fica grande)
  el.onpointerdown = (e) => {
    const quadro = e.target.closest('#mapa');
    if (!quadro || e.target.closest('.mp-no')) return;
    const ini = { x: e.clientX - arrasto.x, y: e.clientY - arrasto.y };
    const mover = (ev) => { arrasto = { x: ev.clientX - ini.x, y: ev.clientY - ini.y }; encaixar(); };
    const fim = () => { window.removeEventListener('pointermove', mover); window.removeEventListener('pointerup', fim); window.removeEventListener('pointercancel', fim); };
    window.addEventListener('pointermove', mover); window.addEventListener('pointerup', fim); window.addEventListener('pointercancel', fim);
  };

  el.onclick = async (e) => {
    const bt = e.target.closest('button');
    if (!bt || ocupado) return;
    if (bt.dataset.no) { // tocou numa foto do mapa: mostra o nome e a opção de dica
      if (minha) return;
      escolhido = escolhido === bt.dataset.no ? null : bt.dataset.no;
      atualizar();
      return;
    }
    if (minha) return;
    ocupado = true;
    try {
      if (bt.dataset.palpite) {
        const [tipo, id] = bt.dataset.palpite.split(':');
        const c = (achados?.itens || []).find((x) => (x.tipo === 'pessoa' ? 'ator' : x.tipo) === tipo && x.id === Number(id));
        if (!c) return;
        const daDica = Boolean(achados?.dica);
        bt.disabled = true;
        try { await tentar({ ...c, tipo }); } catch { recado = 'Não deu para conferir agora. Confira a internet.'; palpites--; }
        if (!ctx.vivo()) return;
        if (daDica) dicas++;
        achados = null; escolhido = null;
        const campo = $('#es-q', el); if (campo) campo.value = '';
        guardar();
        if (caminhoMaisCurto()) { await terminar(true); return; }
        atualizar();
      } else if (bt.dataset.es === 'dica') {
        const n = nos.get(escolhido);
        if (!n) return;
        achados = 'buscando'; atualizar();
        try {
          if (n.tipo === 'ator') {
            const lista = (await tmdb.titulosComoAtor(n.id)).filter((t) => !nos.has(K(t))).slice(0, 8);
            achados = { dica: true, rotulo: `Dica: títulos com ${n.nome}.`, itens: lista };
          } else {
            const lista = (await tmdb.elencoCompleto(n.tipo, n.id)).filter((p) => !nos.has(`ator:${p.id}`)).slice(0, 10).map((p) => ({ tipo: 'ator', ...p }));
            achados = { dica: true, rotulo: `Dica: parte do elenco de ${n.titulo}.`, itens: lista };
          }
        } catch { achados = 'erro'; }
        if (ctx.vivo()) atualizar();
      } else if (bt.dataset.es === 'desistir') {
        if (!(await perguntar({ titulo: 'Desistir desta rodada?', texto: 'Você vê um caminho possível, mas não joga de novo até a próxima troca.', sim: 'Desistir', nao: 'Continuar tentando' }))) return;
        if (!ctx.vivo()) return;
        await terminar(false);
      }
    } finally { ocupado = false; }
  };

  desenhar();
}
