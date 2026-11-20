// Seis graus: ligar um ator a outro num MAPA de fotos. Você digita um filme ou série em que um ator do mapa atuou e
// ele entra ligado a esse ator; depois digita um ator desse título, e assim o mapa cresce até os dois se encontrarem.
// Menos títulos no caminho, melhor. Há um par por rodada (troca à meia-noite e ao meio-dia de Brasília), tirado do
// elenco dos filmes que VOCÊS DOIS viram e gravado na conta (quem abre primeiro sorteia), então é o mesmo para os dois.
// É o jogo dos dias ímpares; nos pares o jogo é o frame (ver jogoDoDia em ui.js). Rota: #/estrelas/hoje.
import * as tmdb from '../tmdb.js';
import * as dados from '../dados.js';
import * as nuvem from '../nuvem.js';
import * as social from '../social.js';
import * as jogos from '../jogos.js';
import { $, esc, poster, foto, rodada, numeroDaRodada, proximaTroca, jogoDoDia, NOME_DO_JOGO, toast, perguntar } from '../ui.js';

const LOCAL = 'sessao:estrelas';  // o mapa em andamento desta rodada, para não zerar ao sair e voltar
const TIPOS = new Set(['ator', 'filme', 'serie']);
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
  const livres = [...atores.values()].filter((p) => !usados.has(p.id));
  const fila = embaralhar(livres.length >= 6 ? livres : [...atores.values()], n); // biblioteca pequena: os atores podem voltar
  let falhas = 0; // tentativas que pararam por erro (TMDB fora do ar, internet), e não por falta de filme
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
          const gravou = await b.from('estrelas_dia').upsert(linha, { onConflict: 'dia', ignoreDuplicates: true });
          const { data } = await b.from('estrelas_dia').select('*').eq('dia', dia).maybeSingle();
          // só vale o par que está na conta: jogar um par que não foi gravado daria um jogo diferente para cada um
          if (!data) { const erro = new Error(gravou.error?.message || 'o par não foi gravado'); erro.conta = true; throw erro; }
          return data;
        }
      }
    } catch (erro) {
      if (erro?.conta) throw erro;
      falhas++; // este ator não deu: tenta o próximo
    }
  }
  if (falhas) throw new Error('o sorteio parou por erro de rede');
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
    await jogos.reenviar(); // resultado que ficou sem subir (a internet caiu na hora) vai antes de ler o placar
    if (!ctx.vivo()) return;
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
  const A = { tipo: 'ator', id: Number(P.a.id), nome: String(P.a.nome || ''), foto: P.a.foto || '' };
  const B = { tipo: 'ator', id: Number(P.b.id), nome: String(P.b.nome || ''), foto: P.b.foto || '' };
  const nos = new Map();     // "ator:1" / "filme:2" / "serie:3" -> { tipo, id, nome|titulo, foto|poster, ano, x, y }
  let arestas = [];          // [chave do ator, chave do título]
  const elencos = new Map(); // chave do título -> Set com os ids de todo o elenco
  let palpites = 0; let dicas = 0;
  let minha = jogadas.find((j) => j.user_id === u.id) || null;
  if (!minha) { // terminou, mas a conta ainda não confirmou: o jogo desta rodada já está jogado
    minha = jogos.guardado('estrelas_jogadas', dia);
    if (minha) { jogadas.push(minha); mes.push(minha); }
  }
  const por = (x) => { if (!nos.has(K(x))) nos.set(K(x), { ...x }); return nos.get(K(x)); };
  por(A); por(B);
  try {
    const g = JSON.parse(localStorage.getItem(LOCAL) || 'null');
    if (g?.dia === dia && g.de === u.id && Array.isArray(g.nos) && Array.isArray(g.arestas)) {
      for (const x of g.nos) if (TIPOS.has(x?.tipo) && Number(x.id)) por({ tipo: x.tipo, id: Number(x.id), nome: x.nome, titulo: x.titulo, foto: x.foto, poster: x.poster, ano: x.ano });
      arestas = g.arestas.filter((e) => Array.isArray(e) && nos.has(e[0]) && nos.has(e[1]));
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

  /* ----- o mapa vivo: as fotos se ajeitam sozinhas (molas e repulsão), dá para arrastar cada uma, arrastar o
     mapa e abrir ou fechar com dois dedos ----- */
  const ANCORA = { [K(A)]: { x: -100, y: -140 }, [K(B)]: { x: 100, y: 140 } }; // os dois atores puxam para as pontas
  const vista = { s: 1, tx: 0, ty: 0, seguir: true, pronta: false };          // enquadramento do mapa
  const calmo = () => document.hidden || matchMedia('(prefers-reduced-motion: reduce)').matches; // sem animação
  let linhas = [];        // [{ el, a, b }]
  let animacao = 0;       // pedido de quadro em andamento
  let parado = 0;         // quadros seguidos sem movimento
  let pegando = null;     // foto que está sendo arrastada: { no, moveu }
  let arrastouAgora = false;
  const dedos = new Map();

  /** Onde nasce uma foto nova: junto de quem ela está ligada, e dali ela desliza para o lugar. */
  function nascer(n) {
    const a = ANCORA[K(n)];
    if (a) { n.x = a.x; n.y = a.y; n.vx = 0; n.vy = 0; return; }
    const viz = arestas.filter((e) => e[0] === K(n) || e[1] === K(n)).map((e) => nos.get(e[0] === K(n) ? e[1] : e[0])).filter((v) => v && v.x != null);
    const cx = viz.length ? viz.reduce((s, v) => s + v.x, 0) / viz.length : 0;
    const cy = viz.length ? viz.reduce((s, v) => s + v.y, 0) / viz.length : 0;
    const ang = (sorteio(n.id, 3) % 628) / 100;
    n.x = cx * 0.85 + Math.cos(ang) * 26; n.y = cy * 0.85 + Math.sin(ang) * 26; n.vx = 0; n.vy = 0;
  }
  /** Um passo da física. Devolve o quanto as fotos ainda estão se mexendo. */
  function fisica() {
    const lista = [...nos.values()];
    for (const n of lista) {
      n.fx = -n.x * 0.003; n.fy = -n.y * 0.003;
      const a = ANCORA[K(n)];
      if (a) { n.fx += (a.x - n.x) * 0.05; n.fy += (a.y - n.y) * 0.05; }
    }
    for (let i = 0; i < lista.length; i++) for (let j = i + 1; j < lista.length; j++) {
      const p = lista[i]; const q = lista[j];
      let dx = p.x - q.x; let dy = p.y - q.y;
      if (!dx && !dy) { dx = 0.5; dy = 0.5; }
      const d2 = Math.max(dx * dx + dy * dy, 500);
      const d = Math.sqrt(d2); const f = 5600 / d2;
      p.fx += (dx / d) * f; p.fy += (dy / d) * f; q.fx -= (dx / d) * f; q.fy -= (dy / d) * f;
    }
    for (const [kp, kt] of arestas) {
      const p = nos.get(kp); const q = nos.get(kt);
      const dx = q.x - p.x; const dy = q.y - p.y;
      const d = Math.hypot(dx, dy) || 1; const f = (d - 108) * 0.03;
      p.fx += (dx / d) * f; p.fy += (dy / d) * f; q.fx -= (dx / d) * f; q.fy -= (dy / d) * f;
    }
    let energia = 0;
    for (const n of lista) {
      if (pegando?.no === n) { n.vx = 0; n.vy = 0; continue; }
      n.vx = Math.max(-11, Math.min(11, (n.vx + n.fx) * 0.8));
      n.vy = Math.max(-11, Math.min(11, (n.vy + n.fy) * 0.8));
      n.x += n.vx; n.y += n.vy;
      energia += Math.abs(n.vx) + Math.abs(n.vy);
    }
    return energia;
  }
  /** O enquadramento que mostra o mapa inteiro. */
  function enquadrar(quadro) {
    const lista = [...nos.values()];
    const x0 = Math.min(...lista.map((n) => n.x)) - 50; const x1 = Math.max(...lista.map((n) => n.x)) + 50;
    const y0 = Math.min(...lista.map((n) => n.y)) - 44; const y1 = Math.max(...lista.map((n) => n.y)) + 70;
    const L = quadro.clientWidth || 340; const H = quadro.clientHeight || 380;
    const s = Math.max(0.42, Math.min(1.15, L / (x1 - x0), H / (y1 - y0)));
    return { s, tx: L / 2 - ((x0 + x1) / 2) * s, ty: H / 2 - ((y0 + y1) / 2) * s };
  }
  function pintar() {
    const camada = $('.mp-camada', el);
    if (!camada) return;
    camada.style.transform = `translate3d(${vista.tx.toFixed(2)}px,${vista.ty.toFixed(2)}px,0) scale(${vista.s.toFixed(4)})`;
    for (const n of nos.values()) if (n.el) n.el.style.transform = `translate3d(${n.x.toFixed(2)}px,${n.y.toFixed(2)}px,0)`;
    for (const l of linhas) { l.el.setAttribute('x1', l.a.x.toFixed(1)); l.el.setAttribute('y1', l.a.y.toFixed(1)); l.el.setAttribute('x2', l.b.x.toFixed(1)); l.el.setAttribute('y2', l.b.y.toFixed(1)); }
  }
  let tiques = 0;         // quadros de animação já desenhados
  let vigia = 0;
  /** Põe tudo no lugar de uma vez, sem animação. */
  function assentar() {
    const quadro = $('#mapa', el);
    if (!quadro) return;
    for (let i = 0; i < 260; i++) fisica();
    if (vista.seguir) { Object.assign(vista, enquadrar(quadro)); vista.pronta = true; }
    pintar();
  }
  function tique() {
    animacao = 0; tiques++;
    const quadro = $('#mapa', el);
    if (!ctx.vivo() || !quadro) return;
    const energia = fisica();
    let ajustando = false;
    if (vista.seguir && !dedos.size) {
      const alvo = enquadrar(quadro);
      if (!vista.pronta) { Object.assign(vista, alvo); vista.pronta = true; } else {
        ajustando = Math.abs(alvo.tx - vista.tx) + Math.abs(alvo.ty - vista.ty) + Math.abs(alvo.s - vista.s) * 300 > 0.6;
        vista.s += (alvo.s - vista.s) * 0.14; vista.tx += (alvo.tx - vista.tx) * 0.14; vista.ty += (alvo.ty - vista.ty) * 0.14;
      }
    }
    pintar();
    parado = energia < 0.05 * nos.size && !ajustando && !pegando && !dedos.size ? parado + 1 : 0;
    if (parado < 30) animacao = requestAnimationFrame(tique);
  }
  /** Põe o mapa em movimento. Com a tela escondida (ou com "reduzir movimento" ligado), já mostra tudo no lugar. */
  function acordar() {
    parado = 0;
    const quadro = $('#mapa', el);
    if (!quadro) return;
    if (calmo()) { assentar(); return; }
    if (!vista.pronta) { Object.assign(vista, enquadrar(quadro)); vista.pronta = true; pintar(); } // já nasce enquadrado
    if (!animacao) animacao = requestAnimationFrame(tique);
    // se o navegador não der quadros de animação (aba em segundo plano, economia de bateria), o mapa não pode
    // ficar fora do lugar: passado um instante sem nenhum quadro, tudo vai para o lugar de uma vez
    clearTimeout(vigia);
    const marca = tiques;
    vigia = setTimeout(() => { if (tiques === marca && ctx.vivo() && !pegando && !dedos.size) assentar(); }, 450);
  }
  /** Deixa o que está na tela igual ao mapa: cria as fotos novas, refaz as linhas e marca o caminho. */
  function sincronizarMapa() {
    const camada = $('.mp-camada', el); const svg = $('.mp-linhas', el);
    if (!camada || !svg) return;
    const noCaminho = new Set((caminhoMaisCurto() || []).map(K));
    for (const n of nos.values()) {
      if (n.x == null) nascer(n);
      if (!n.el || !n.el.isConnected) {
        n.el = document.createElement('button');
        n.el.dataset.no = K(n);
        n.el.setAttribute('aria-label', nomeDe(n));
        n.el.innerHTML = `<span class="mp-c">${n.tipo === 'ator' ? foto(n, '') : poster(n, { tam: 'w154' })}<small>${esc(nomeDe(n))}</small></span>`;
        camada.append(n.el);
      }
      n.el.className = ['mp-no', n.tipo === 'ator' ? 'ator' : 'tit', K(n) === K(A) ? 'ponta' : '', K(n) === K(B) ? 'ponta alvo' : '', noCaminho.has(K(n)) ? 'caminho' : '', escolhido === K(n) ? 'sel' : ''].filter(Boolean).join(' ');
    }
    svg.innerHTML = arestas.map(([p, t]) => `<line data-a="${p}" data-b="${t}" class="${noCaminho.has(p) && noCaminho.has(t) ? 'caminho' : ''}"/>`).join('');
    linhas = [...svg.querySelectorAll('line')].map((l) => ({ el: l, a: nos.get(l.dataset.a), b: nos.get(l.dataset.b) }));
    pintar();
    acordar();
  }
  /** Liga os gestos do mapa: arrastar uma foto, arrastar o fundo, abrir e fechar com dois dedos, roda do mouse. */
  function ligarMapa() {
    const quadro = $('#mapa', el);
    if (!quadro) return;
    const ponto = (e) => { const r = quadro.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    const noMundo = (p) => ({ x: (p.x - vista.tx) / vista.s, y: (p.y - vista.ty) / vista.s });
    const zoom = (fator, centro) => {
      const s = Math.max(0.35, Math.min(2.2, vista.s * fator));
      vista.tx = centro.x - ((centro.x - vista.tx) * s) / vista.s; vista.ty = centro.y - ((centro.y - vista.ty) * s) / vista.s;
      vista.s = s; vista.seguir = false;
    };
    let gesto = null; // { tipo: 'no' | 'fundo' | 'dois', ... }
    const mover = (e) => {
      if (!dedos.has(e.pointerId)) return;
      const antes = dedos.get(e.pointerId); const agora = ponto(e);
      dedos.set(e.pointerId, agora);
      if (dedos.size >= 2) {
        const [p, q] = [...dedos.values()];
        const dist = Math.hypot(p.x - q.x, p.y - q.y) || 1;
        const meio = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
        if (gesto?.tipo === 'dois') { zoom(dist / gesto.dist, meio); vista.tx += meio.x - gesto.meio.x; vista.ty += meio.y - gesto.meio.y; }
        gesto = { tipo: 'dois', dist, meio };
        pegando = null;
      } else if (gesto?.tipo === 'no' && pegando) {
        if (!pegando.moveu && Math.hypot(agora.x - gesto.ini.x, agora.y - gesto.ini.y) < 7) return;
        pegando.moveu = true; arrastouAgora = true;
        const m = noMundo(agora); pegando.no.x = m.x; pegando.no.y = m.y;
      } else if (gesto?.tipo === 'fundo') {
        vista.tx += agora.x - antes.x; vista.ty += agora.y - antes.y; vista.seguir = false;
      }
      pintar(); // a foto (ou o mapa) acompanha o dedo na hora
      acordar();
    };
    const soltar = (e) => {
      dedos.delete(e.pointerId);
      if (dedos.size) { gesto = { tipo: 'fundo' }; return; }
      window.removeEventListener('pointermove', mover); window.removeEventListener('pointerup', soltar); window.removeEventListener('pointercancel', soltar);
      pegando = null; gesto = null;
      setTimeout(() => { arrastouAgora = false; }, 0); // o toque que vem depois de arrastar não conta como escolha
      acordar();
    };
    quadro.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.mp-centro, .mp-info')) return;
      if (!dedos.size) { window.addEventListener('pointermove', mover); window.addEventListener('pointerup', soltar); window.addEventListener('pointercancel', soltar); }
      dedos.set(e.pointerId, ponto(e));
      const noEl = e.target.closest('.mp-no');
      if (dedos.size === 1 && noEl) { pegando = { no: nos.get(noEl.dataset.no), moveu: false }; gesto = { tipo: 'no', ini: ponto(e) }; } else if (dedos.size === 1) { gesto = { tipo: 'fundo' }; } else { pegando = null; gesto = null; }
    });
    // o quadro mudou de tamanho (girou o celular, abriu o teclado): enquadra de novo
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => { if (vista.seguir) acordar(); }).observe(quadro);
    quadro.addEventListener('wheel', (e) => { e.preventDefault(); zoom(e.deltaY < 0 ? 1.12 : 1 / 1.12, ponto(e)); pintar(); acordar(); }, { passive: false });
  }

  let escolhido = null;      // foto tocada (para a dica)
  let achados = null;        // sugestões da busca ou da dica: { rotulo, itens, dica } | 'buscando' | 'erro' | null
  let recado = '';           // o que aconteceu com o último palpite
  let vezBusca = 0; let espera = 0;
  let ocupado = false;

  const linhaSugestao = (c) => (c.tipo === 'pessoa' || c.tipo === 'ator'
    ? `<button class="lin es-op" data-palpite="ator:${Number(c.id)}">${foto(c, 'sm')}<span class="n">${esc(c.nome)}<small>ator ou atriz</small></span></button>`
    : `<button class="lin es-op" data-palpite="${c.tipo}:${Number(c.id)}">${poster(c, { tam: 'w154' })}<span class="n">${esc(c.titulo)}<small>${[c.ano, c.tipo === 'serie' ? 'série' : 'filme'].filter(Boolean).join(' · ')}</small></span></button>`);
  function achadosHtml() {
    if (achados === 'buscando') return '<div class="es-cx"><div class="skel txt"></div><div class="skel txt" style="width:70%"></div></div>';
    if (achados === 'erro') return '<div class="es-cx"><p class="note">Não deu para buscar. Confira a internet.</p></div>';
    if (!achados) return '';
    return `<div class="es-cx">${achados.rotulo ? `<p class="note">${esc(achados.rotulo)}</p>` : ''}${achados.itens.length ? achados.itens.map(linhaSugestao).join('') : '<p class="note">Nada encontrado.</p>'}</div>`;
  }
  const elo = (x) => (x.tipo === 'ator'
    ? `<span class="es-elo" title="${esc(x.nome)}">${foto(x, 'sm')}<small>${esc(x.nome)}</small></span>`
    : `<span class="es-elo filme" title="${esc(x.titulo)}">${poster(x, { tam: 'w154' })}<small>${esc(x.titulo)}</small></span>`);
  const cadeia = (lista) => `<div class="es-cadeia">${lista.map(elo).join('<i>›</i>')}</div>`;
  const texto = (j, quem) => (!j ? `${quem} ainda não jogou` : j.conseguiu ? `${quem} ligou com ${j.filmes} título${j.filmes > 1 ? 's' : ''}` : `${quem} não conseguiu`);
  const contagem = () => { const t = [...nos.values()].filter((x) => x.tipo !== 'ator').length; return `<span><b>${nos.size - t}</b> atores</span><span><b>${t}</b> título${t === 1 ? '' : 's'}</span><span><b>${palpites}</b> palpite${palpites === 1 ? '' : 's'}</span>`; };
  const recadoPadrao = () => (nos.size > 2 ? 'Toque numa foto se precisar de uma dica. Arraste para arrumar o mapa.' : `Comece por um filme ou série com ${A.nome} ou com ${B.nome}.`);

  function painelDoNo() {
    const n = escolhido ? nos.get(escolhido) : null;
    if (!n || minha) return '';
    return `<span class="n">${esc(nomeDe(n))}</span><button class="btn small" data-es="dica">Dica</button>`;
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
    for (const n of nos.values()) n.el = null; // a tela vai ser refeita: as fotos são criadas de novo, no mesmo lugar
    el.innerHTML = `<button class="back" data-acao="voltar" aria-label="Voltar">‹</button>
    <div class="wrap es-jogo"${fim ? '' : ' data-sem-refazer'}>
      <div class="es-topo"><div class="eyebrow">Jogo de hoje</div><h1>Seis graus</h1>
        <div class="es-par">${foto(A, 'sm')}<b>${esc(A.nome)}</b><i>até</i>${foto(B, 'sm')}<b class="alvo">${esc(B.nome)}</b></div></div>
      ${fim ? '' : `<div class="es-busca"><label class="search" for="es-q"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>
          <input id="es-q" type="search" inputmode="search" enterkeyhint="search" placeholder="Digite um filme, série ou ator" autocomplete="off" autocapitalize="off" spellcheck="false"></label>
        <div id="es-achados">${achadosHtml()}</div></div>`}
      ${!fim || temMapa ? `<div class="mapa" id="mapa"><div class="mp-camada"><svg class="mp-linhas" width="2" height="2" aria-hidden="true"></svg></div>
          <button class="mp-centro" data-es="centro" aria-label="Enquadrar o mapa inteiro"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg></button>
          <div class="mp-info" id="es-painel" ${escolhido && !fim ? '' : 'hidden'}>${painelDoNo()}</div></div>` : ''}
      ${fim ? `<p class="dica">${minha.conseguiu ? `Ligou com ${minha.filmes} título${minha.filmes > 1 ? 's' : ''}${palpites ? ` (${palpites} palpite${palpites > 1 ? 's' : ''}${dicas ? `, ${dicas} dica${dicas > 1 ? 's' : ''}` : ''})` : ''}.` : 'Não foi dessa vez.'}</p>
        ${minha.conseguiu && minha.caminho?.length && !temMapa ? cadeia(minha.caminho) : ''}
        ${minha.conseguiu && minha.filmes <= 2 ? '' : `<section><h2>Um caminho possível <small>com 2 títulos</small></h2>${cadeia([A, ...P.solucao, B])}</section>`}
        ${dele?.conseguiu && dele.caminho?.length ? `<section><h2>O caminho de ${esc(o.nome)}</h2>${cadeia(dele.caminho)}</section>` : ''}
        <section><h2>Placar <small>rodadas ganhas em ${nomeMes}</small></h2>
          <div class="placar"><div class="${pontos(u.id) > pontos(o.id) ? 'lider' : ''}"><b>${pontos(u.id)}</b>você</div><span>${nomeMes}</span><div class="${pontos(o.id) > pontos(u.id) ? 'lider' : ''}"><b>${pontos(o.id)}</b>${esc(o.nome)}</div></div>
          <div class="grupo"><div class="lin"><span class="n">Nesta rodada<small>${texto(minha, 'Você')} · ${esc(texto(dele, o.nome))}</small></span></div></div></section>
        <p class="note">Ganha a rodada quem liga com menos títulos. O próximo par sai ${proximaTroca()}; amanhã o jogo é o frame.</p>`
    : `<p class="dica" id="es-recado" aria-live="polite">${esc(recado || recadoPadrao())}</p>
        <div class="es-conta" id="es-conta">${contagem()}</div>
        <p class="note">Um título só entra se alguém do mapa atuou nele; um ator só entra se atuou num título do mapa. Menos títulos no caminho, melhor.</p>
        <div class="actions"><button class="texto" data-es="desistir" style="color:var(--muted)">Desistir desta rodada</button></div>`}
    </div>`;
    el.scrollTop = rolagem;
    vista.pronta = false; vista.seguir = true;
    ligarMapa();
    sincronizarMapa();
  }
  /** Atualiza o mapa e os avisos sem mexer no campo de busca (a pessoa pode estar digitando). */
  function atualizar() {
    if (!$('#mapa', el)) { desenhar(); return; }
    sincronizarMapa();
    const r = $('#es-recado', el); if (r) r.textContent = recado || recadoPadrao();
    const c = $('#es-conta', el); if (c) c.innerHTML = contagem();
    const p = $('#es-painel', el); if (p) { p.innerHTML = painelDoNo(); p.hidden = !escolhido || Boolean(minha); }
    const a = $('#es-achados', el); if (a) a.innerHTML = achadosHtml();
  }

  async function terminar(conseguiu) {
    const caminho = conseguiu ? caminhoMaisCurto() : null;
    const titulos = caminho ? caminho.filter((x) => x.tipo !== 'ator').length : 6;
    minha = { dia, user_id: u.id, filmes: Math.max(1, Math.min(99, titulos)), conseguiu, caminho: (caminho || []).map((x) => ({ tipo: x.tipo, id: x.id, nome: x.nome, titulo: x.titulo, foto: x.foto, poster: x.poster, ano: x.ano })) };
    jogadas.push(minha); mes.push(minha);
    escolhido = null; achados = null;
    clearTimeout(espera); vezBusca++;
    guardar();
    desenhar();
    el.scrollTop = 0;
    // o resultado fica guardado no aparelho antes de subir: sem internet, vale mesmo assim e sobe depois
    if (!(await jogos.mandar('estrelas_jogadas', minha)) && ctx.vivo()) toast('Sem internet para mandar o resultado. Ele fica guardado e sobe sozinho depois.');
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
    recado = novo.tipo === 'ator' ? `${novo.nome} entrou no mapa. Agora um título com ele ou ela.` : `${novo.titulo} entrou no mapa. Agora alguém do elenco.`;
    vista.seguir = true; // o mapa se enquadra de novo para mostrar a foto nova
  }

  el.oninput = (e) => {
    if (e.target.id !== 'es-q') return;
    clearTimeout(espera);
    const q = e.target.value.trim();
    const minhaVez = ++vezBusca; // uma resposta antiga que chegar depois não cobre a busca nova
    if (q.length < 2) { achados = null; const caixa = $('#es-achados', el); if (caixa) caixa.innerHTML = ''; return; }
    espera = setTimeout(async () => {
      const caixa = $('#es-achados', el);
      if (!caixa || minha || !ctx.vivo()) return;
      achados = 'buscando';
      caixa.innerHTML = achadosHtml();
      let r;
      try { r = { rotulo: '', itens: (await tmdb.buscar(q)).slice(0, 7) }; } catch { r = 'erro'; }
      if (minhaVez !== vezBusca || !ctx.vivo() || minha) return;
      achados = r;
      const alvo = $('#es-achados', el); if (alvo) alvo.innerHTML = achadosHtml();
    }, 320);
  };

  el.onclick = async (e) => {
    const bt = e.target.closest('button');
    if (!bt || ocupado) return;
    if (bt.dataset.es === 'centro') { vista.seguir = true; acordar(); return; }
    if (bt.dataset.no) { // tocou numa foto do mapa: mostra o nome e a opção de dica
      if (minha || arrastouAgora) return;
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
        clearTimeout(espera); vezBusca++; // uma busca a caminho não reabre a lista por cima do palpite
        try { await tentar({ ...c, tipo: tipo === 'ator' ? 'ator' : tipo === 'serie' ? 'serie' : 'filme', id: Number(id) }); } catch { recado = 'Não deu para conferir agora. Confira a internet.'; palpites--; }
        if (daDica) dicas++;
        guardar(); // antes de qualquer saída: o palpite vale mesmo que a pessoa tenha saído da tela no meio
        if (!ctx.vivo()) return;
        achados = null; escolhido = null;
        const campo = $('#es-q', el); if (campo) { campo.value = ''; campo.blur(); } // fecha o teclado para o mapa aparecer
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
        if (!ctx.vivo()) return;
        atualizar();
        $('.es-busca', el)?.scrollIntoView({ block: 'start', behavior: calmo() ? 'auto' : 'smooth' }); // a lista da dica abre embaixo do campo
      } else if (bt.dataset.es === 'desistir') {
        if (!(await perguntar({ titulo: 'Desistir desta rodada?', texto: 'Você vê um caminho possível, mas não joga de novo até a próxima troca.', sim: 'Desistir', nao: 'Continuar tentando' }))) return;
        if (!ctx.vivo()) return;
        await terminar(false);
      }
    } finally { ocupado = false; }
  };

  // o mapa guardado já liga os dois (o palpite final foi conferido, mas a pessoa saiu antes de a tela fechar o jogo)
  if (!minha && caminhoMaisCurto()) await terminar(true);
  else desenhar();
}
