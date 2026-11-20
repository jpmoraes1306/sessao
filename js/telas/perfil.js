// Aba Perfil: o seu perfil ou o do outro (só leitura), com favoritos, estatísticas e o comparativo
// entre vocês dois. Embaixo ficam a conta e os ajustes.
import * as dados from '../dados.js';
import * as nuvem from '../nuvem.js';
import * as social from '../social.js';
import * as tmdb from '../tmdb.js';
import { img } from '../tmdb.js';
import * as ovo from '../ovo.js';
import { simboloEscondido } from '../ovo.js';
import { chave, salvarChaves, MEUS_STREAMINGS, SERVICOS } from '../config.js';
import * as avisos from '../avisos.js';
import { limpar as limparCache } from '../cache.js';
import { $, esc, nota, notaMinha, selo, tile, poster, toast, corDe, hoje, folha } from '../ui.js';

const mascara = (k) => (k ? `${'•'.repeat(Math.max(0, k.length - 4))}${k.slice(-4)}` : '');
let vendo = null;   // id do perfil na tela (null = o seu)
/** Na próxima vez que o Perfil abrir, mostra o da pessoa com este id (o outro) em vez do seu. */
export const verPerfilDe = (id) => { vendo = id || null; };
let vez = 0;
const fotos = new Map(); // id da pessoa no TMDB -> caminho da foto
const K = (tipo, id) => `${tipo}:${id}`;

const avatar = (p, cls = 'lg') => {
  const [a, b] = corDe(p?.nome || 'Você');
  return `<span class="ph ${cls}" style="--a:${a};--b:${b}">${esc((p?.nome || 'V')[0])}${p?.foto ? `<img src="${esc(p.foto)}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}</span>`;
};

/** Filme conta quando está marcado como visto. Série não tem "visto": conta a que a pessoa acompanha ou já deu nota.
    A regra é a mesma para o seu perfil e para o do outro. */
const contaComoVisto = (t) => Boolean(t.visto || (t.tipo === 'serie' && (t.seguindo || t.nota != null)));
/** O Perfil ainda é a aba na tela? (depois de esperar a internet, a pessoa pode ter ido para outra) */
const naTela = (el) => el.dataset.aba === 'perfil';

/** Títulos vistos cujo resumo na conta está sem elenco e direção (marcados antes de o app guardar isso, ou com a
    internet ruim) não entram em "atores e diretores que você mais vê". Completa aos poucos, sem segurar a tela:
    na próxima visita ao Perfil eles já contam. */
const tentados = new Set(); // um título que o TMDB não devolve não é pedido de novo a cada visita
function completarResumos(vistos, info) {
  const incompletos = vistos.filter((t) => !tentados.has(K(t.tipo, t.id)) && !Array.isArray(info.get(K(t.tipo, t.id))?.elenco)).slice(0, 12);
  for (const t of incompletos) {
    tentados.add(K(t.tipo, t.id));
    tmdb.resumo(t.tipo, t.id).then((r) => dados.guardarResumo(t.tipo, t.id, r, true)).catch(() => {});
  }
}

/** Junta o que é preciso para desenhar o perfil de uma pessoa. */
async function carregar(pid, ehMeu) {
  const b = nuvem.banco();
  const vistos = (ehMeu ? dados.todos() : social.todosDoOutro()).filter(contaComoVisto);
  const [info, diario, favs, listas] = await Promise.all([
    dados.resumos(vistos.map((t) => ({ tipo: t.tipo, tmdb_id: t.id }))),
    b.from('diario').select('tipo, tmdb_id, data, nota, revisto').eq('user_id', pid).order('data', { ascending: false }).order('id', { ascending: false }).limit(1000).then((r) => r.data || []),
    ehMeu ? dados.favoritos() : b.from('favoritos').select('posicao, tipo, tmdb_id').eq('user_id', pid).order('posicao').then((r) => r.data || []),
    b.from('listas').select('id, nome, ranqueada, lista_itens(count)').eq('user_id', pid).order('nome').then((r) => r.data || []),
  ]);
  // o diário pode ter títulos que não estão entre os vistos (algo desmarcado depois): busca o resumo deles também
  const extra = await dados.resumos([...diario.filter((x) => !info.has(K(x.tipo, x.tmdb_id))), ...(ehMeu ? [] : favs)]);
  const res = (tipo, id) => info.get(K(tipo, id)) || extra.get(K(tipo, id)) || {};
  completarResumos(vistos, info);
  return { vistos, info, diario, listas, res, favoritos: ehMeu ? favs : favs.map((f) => ({ tipo: f.tipo, id: f.tmdb_id, ...res(f.tipo, f.tmdb_id) })) };
}

function estatisticas({ vistos, diario, res }) {
  const filmes = vistos.filter((t) => t.tipo === 'filme');
  const ano = hoje().slice(0, 4);
  const noAno = diario.filter((d) => d.data.startsWith(ano));
  const notasAno = noAno.map((d) => d.nota).filter((n) => n != null).map(Number);
  const hist = Array(11).fill(0);
  for (const t of vistos) if (t.nota != null) hist[Math.round(t.nota)]++;
  const conta = (campo) => {
    const m = new Map();
    for (const t of filmes) {
      for (const p of (res(t.tipo, t.id)[campo] || [])) {
        const e = m.get(p.id) || { id: p.id, nome: p.nome, n: 0, notas: [] };
        e.n++;
        if (t.nota != null) e.notas.push(t.nota);
        m.set(p.id, e);
      }
    }
    return [...m.values()].map((e) => ({ ...e, media: e.notas.length ? e.notas.reduce((a, c) => a + c, 0) / e.notas.length : null }));
  };
  const atores = conta('elenco').sort((a, c) => c.n - a.n || (c.media || 0) - (a.media || 0));
  const diretores = conta('diretores').sort((a, c) => c.n - a.n || (c.media || 0) - (a.media || 0));
  const porChave = (lista) => { const m = {}; for (const x of lista) m[x] = (m[x] || 0) + 1; return Object.entries(m).sort((a, c) => c[1] - a[1]); };
  const comDuracao = filmes.map((t) => ({ ...t, ...res(t.tipo, t.id), tipo: t.tipo, id: t.id })).filter((t) => t.titulo);
  return {
    total: filmes.length, series: vistos.length - filmes.length,
    comNota: vistos.filter((t) => t.nota != null).length,
    media: (() => { const n = vistos.map((t) => t.nota).filter((x) => x != null); return n.length ? n.reduce((a, c) => a + c, 0) / n.length : null; })(),
    ano, noAno: noAno.length, horasAno: Math.round(noAno.reduce((s, d) => s + (res(d.tipo, d.tmdb_id).duracao || 0), 0) / 60),
    mediaAno: notasAno.length ? notasAno.reduce((a, c) => a + c, 0) / notasAno.length : null,
    porMes: Array.from({ length: 12 }, (_, m) => noAno.filter((d) => Number(d.data.slice(5, 7)) === m + 1).length),
    hist, atores: atores.slice(0, 8), diretores: diretores.slice(0, 8),
    melhores: diretores.filter((d) => d.notas.length >= 3).sort((a, c) => c.media - a.media).slice(0, 5),
    generos: porChave(filmes.flatMap((t) => res(t.tipo, t.id).generos || [])).slice(0, 8),
    decadas: porChave(filmes.map((t) => res(t.tipo, t.id).ano).filter(Boolean).map((a) => `${Math.floor(a / 10) * 10}`)).sort((a, c) => c[0].localeCompare(a[0])),
    horas: Math.round(comDuracao.reduce((s, t) => s + (t.duracao || 0), 0) / 60),
    maisLongo: [...comDuracao].sort((a, c) => (c.duracao || 0) - (a.duracao || 0))[0],
    maisAntigo: [...comDuracao].filter((t) => t.ano).sort((a, c) => a.ano - c.ano)[0],
    curtidos: vistos.filter((t) => t.curtido).length,
  };
}

// cada barra é um botão: tocar abre a folha com os títulos daquela barra (ver abrirGrafico)
const barras = (lista, cor = 'var(--seen)', graf = '') => {
  const max = Math.max(...lista.map((x) => x[1]), 1);
  return `<div class="barras">${lista.map(([rotulo, n, v = rotulo]) => `<button class="barra" data-graf="${graf}" data-v="${esc(v)}" aria-label="${esc(rotulo)}: ${n}. Toque para ver quais."><span>${esc(rotulo)}</span><i style="width:${(n / max) * 100}%;background:${cor}"></i><b>${n}</b></button>`).join('')}</div>`;
};
const MESL = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
let grafico = null; // { d, e } do perfil que está na tela, para os toques nos gráficos

/** Folha com os títulos de uma barra: nota, mês do ano, gênero ou década. */
function abrirGrafico(tipo, v) {
  const { d, e } = grafico;
  const linhaDe = (t, extra = '') => {
    const r = d.res(t.tipo, t.id);
    return { tipo: t.tipo, id: t.id, titulo: r.titulo || t.titulo || 'Sem título', ano: r.ano ?? t.ano ?? '', poster: r.poster || t.poster || '', nota: t.nota == null ? null : Number(t.nota), extra };
  };
  const filmes = d.vistos.filter((t) => t.tipo === 'filme');
  const porNota = (a, b) => (b.nota ?? -1) - (a.nota ?? -1) || String(a.titulo).localeCompare(String(b.titulo));
  let titulo;
  let itens;
  if (tipo === 'nota') {
    titulo = `Nota ${v}`;
    itens = d.vistos.filter((t) => t.nota != null && Math.round(t.nota) === Number(v)).map((t) => linhaDe(t)).sort((a, b) => (b.ano || 0) - (a.ano || 0));
  } else if (tipo === 'mes') {
    titulo = `${MESL[v - 1]} de ${e.ano}`;
    itens = d.diario.filter((x) => x.data.startsWith(`${e.ano}-${String(v).padStart(2, '0')}`)).map((x) => linhaDe({ tipo: x.tipo, id: x.tmdb_id, nota: x.nota }, `dia ${Number(x.data.slice(8, 10))}${x.revisto ? ' · visto de novo' : ''}`));
  } else if (tipo === 'genero') {
    titulo = v;
    itens = filmes.filter((t) => (d.res(t.tipo, t.id).generos || []).includes(v)).map((t) => linhaDe(t)).sort(porNota);
  } else {
    titulo = `Anos ${v}`;
    itens = filmes.filter((t) => { const a = d.res(t.tipo, t.id).ano; return a && `${Math.floor(a / 10) * 10}` === v; }).map((t) => linhaDe(t)).sort(porNota);
  }
  const corpo = itens.length
    ? `<div class="list">${itens.slice(0, 300).map((t) => `<a class="li" href="#/${t.tipo}/${t.id}">${poster(t, { tam: 'w154' })}<div><div class="t">${esc(t.titulo)}</div><div class="s">${[t.ano, t.extra].filter(Boolean).join(' · ')}</div></div><span class="r">${selo(t.nota)}</span></a>`).join('')}</div>`
    : '<p class="note">Nada nesta barra.</p>';
  folha(titulo, `${itens.length} título${itens.length === 1 ? '' : 's'}`, corpo);
}
const ranking = (lista) => {
  const max = lista[0]?.n || 1;
  return lista.map((p, i) => `<a class="rank" href="#/pessoa/${p.id}"><span class="n">${i + 1}</span>
    <span class="ph sm" data-pessoa="${p.id}" style="--a:${corDe(p.nome)[0]};--b:${corDe(p.nome)[1]}">${esc(p.nome.split(' ').map((w) => w[0]).slice(0, 2).join(''))}${fotos.get(p.id) ? `<img src="${img(fotos.get(p.id), 'w185')}" alt="" crossorigin="anonymous">` : ''}</span>
    <div><div>${esc(p.nome)}</div><div class="lbar" style="width:${(p.n / max) * 100}%"></div></div>
    <span class="c">${p.n} filme${p.n > 1 ? 's' : ''}${p.media != null ? `<br>média ${nota(p.media)}` : ''}</span></a>`).join('');
};

function corpoPerfil(pessoa, ehMeu, d, e) {
  const o = nuvem.outro();
  const comp = ehMeu ? social.compatibilidade() : null;
  const nomeDele = esc(o?.nome || '');
  const recentes = d.diario.slice(0, 12).map((x) => ({ tipo: x.tipo, id: x.tmdb_id, ...d.res(x.tipo, x.tmdb_id), nota: x.nota == null ? null : Number(x.nota) })).filter((x) => x.titulo);
  const par = (p) => `<a class="li" href="#/${p.tipo}/${p.id}">${poster(p, { tam: 'w154' })}<div><div class="t">${esc(p.titulo)}</div><div class="s">${p.ano || ''}</div></div><span class="r">você ${selo(p.minha)} · ${nomeDele} ${selo(p.dele)}</span></a>`;
  return `
  ${d.favoritos.length || ehMeu ? `<section><h2>Favoritos <small>${ehMeu ? `até 4 · <a class="link" href="#/editar/favoritos">${d.favoritos.length ? 'Editar' : 'Escolher'}</a>` : ''}</small></h2>
    ${d.favoritos.length ? `<div class="grid4">${d.favoritos.map((f) => tile(f)).join('')}</div>` : `<p class="note">Nenhum favorito ainda.${ehMeu ? ' Toque na estrela na ficha de um filme ou de uma série.' : ''}</p>`}</section>` : ''}
  ${recentes.length ? `<section><h2>Vistos recentemente</h2><div class="row">${recentes.map((t) => tile(t, t.nota != null ? `nota ${selo(t.nota)}` : '')).join('')}</div></section>` : ''}
  <section><h2>Em ${e.ano}</h2>
    <div class="stats"><div class="stat"><b>${e.noAno}</b><span>sessões no diário</span></div><div class="stat"><b>${e.horasAno}</b><span>horas</span></div><div class="stat"><b>${e.mediaAno != null ? nota(e.mediaAno) : '–'}</b><span>nota média</span></div></div>
    ${e.noAno ? `<div><div class="hist meses">${e.porMes.map((n, i) => `<button data-graf="mes" data-v="${i + 1}" aria-label="${MESL[i]}: ${n}. Toque para ver quais."><i style="height:${(n / Math.max(...e.porMes, 1)) * 100}%"></i></button>`).join('')}</div><div class="hist-l">${['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'].map((m) => `<span>${m}</span>`).join('')}</div></div>` : ''}
  </section>
  ${e.comNota ? `<section><h2>Notas <small>${e.comNota} títulos · média ${nota(e.media)}</small></h2>
    <div><div class="hist">${e.hist.map((n, i) => `<button data-graf="nota" data-v="${i}" aria-label="Nota ${i}: ${n}. Toque para ver quais."><i style="height:${(n / Math.max(...e.hist, 1)) * 100}%"></i></button>`).join('')}</div><div class="hist-l">${e.hist.map((_, i) => `<span>${i}</span>`).join('')}</div></div></section>` : ''}
  ${e.atores.length ? `<section><h2>Atores que ${ehMeu ? 'você mais vê' : `${esc(pessoa.nome)} mais vê`}</h2><div>${ranking(e.atores)}</div></section>` : ''}
  ${e.diretores.length ? `<section><h2>Diretores que ${ehMeu ? 'você mais vê' : `${esc(pessoa.nome)} mais vê`}</h2><div>${ranking(e.diretores)}</div></section>` : ''}
  ${e.melhores.length ? `<section><h2>Diretores com a melhor média <small>mínimo de 3 filmes com nota</small></h2><div>${ranking(e.melhores)}</div></section>` : ''}
  ${e.generos.length ? `<section><h2>Gêneros</h2>${barras(e.generos, undefined, 'genero')}</section>` : ''}
  ${e.decadas.length ? `<section><h2>Décadas</h2>${barras(e.decadas.map(([dec, n]) => [`Anos ${dec}`, n, dec]), 'var(--list)', 'decada')}</section>` : ''}
  ${d.listas.length || ehMeu ? `<section><h2>Listas <small>${d.listas.length || ''}${ehMeu ? `${d.listas.length ? ' · ' : ''}<a class="link" href="#/editar/lista-nova">Nova lista</a>` : ''}</small></h2>${d.listas.length ? '' : '<p class="note">Nenhuma lista ainda. Crie uma com os títulos que quiser, com ou sem ordem.</p>'}<div class="listas">${d.listas.map((l) => `<div class="temp" data-lista="${l.id}"><button class="temp-h" data-acao="lista" data-id="${l.id}" style="grid-template-columns:1fr auto"><div><div class="t">${esc(l.nome)}</div><div class="s">${l.lista_itens?.[0]?.count ?? 0} títulos${l.ranqueada ? ' · ranking' : ''}</div></div><span class="seta">›</span></button></div>`).join('')}</div></section>` : ''}
  ${comp ? `<section><h2>Você × ${nomeDele}</h2>
    <div class="card"><div class="entre"><span>Compatibilidade de gosto</span><b class="selo" style="font-size:26px">${comp.porcento}%</b></div><div class="lbar-big"><i style="width:${comp.porcento}%;background:var(--star)"></i></div>
      <p>${comp.vistosEmComum} títulos vistos pelos dois, ${comp.comparados} com nota dos dois. Notas iguais em ${comp.iguais}; diferença média de ${nota(comp.diferencaMedia)} ponto${comp.diferencaMedia >= 2 ? 's' : ''}.</p></div>
    <h2 style="margin-top:6px">Onde mais discordam</h2><div class="list">${comp.discordam.map(par).join('')}</div>
    ${comp.concordam.length ? `<h2 style="margin-top:6px">Mesma nota</h2><div class="list">${comp.concordam.map(par).join('')}</div>` : ''}</section>` : ''}
  ${e.total ? `<section><h2>Marcos</h2><div class="facts">
    <div class="fact"><em>Tempo de tela</em>${e.horas} horas em ${e.total} filmes${e.series ? ` e ${e.series} séries` : ''} · ${e.curtidos} curtidos</div>
    ${e.maisLongo ? `<div class="fact"><em>O mais longo</em><a href="#/filme/${e.maisLongo.id}">${esc(e.maisLongo.titulo)}</a> (${Math.floor(e.maisLongo.duracao / 60)}h ${e.maisLongo.duracao % 60}min)</div>` : ''}
    ${e.maisAntigo ? `<div class="fact"><em>O mais antigo</em><a href="#/filme/${e.maisAntigo.id}">${esc(e.maisAntigo.titulo)}</a> (${e.maisAntigo.ano})</div>` : ''}</div></section>` : ''}`;
}

/** Cartão "Caça ao símbolo": qual é o símbolo de hoje, se você já achou, o placar do mês e a dica do lugar. */
function cartaoOvo() {
  const s = ovo.simboloDeHoje();
  const achei = ovo.acheiHoje();
  const placar = ovo.placarDoMes();
  return `<p class="ovo-hoje"><span class="ovo-m">${s.svg}</span><span>Agora o símbolo escondido é <b>${esc(s.nome)}</b>. ${achei ? `Você já achou${typeof achei === 'string' ? ` às ${achei}` : ''}.` : 'Está em algum lugar do app, e quem achar primeiro ganha a rodada.'}</span></p>
    ${placar ? ovo.htmlPlacar(placar, 'Quem achou primeiro, placar') : ''}
    <div class="actions">${achei ? '' : '<button class="btn small" data-acao="dica">Me dá uma dica do lugar</button>'}${placar ? `<a class="btn small on-star" href="#/${ovo.jogoDoDia()}/hoje">Jogo de hoje: ${ovo.NOME_DO_JOGO[ovo.jogoDoDia()]}</a>` : ''}</div>
    <p class="note">Troca duas vezes por dia, ao meio-dia e à meia-noite (a próxima troca é ${ovo.proximaTroca()}). Achar o símbolo mostra o Dafoe e o Cage da vez. Os dois jogos se revezam, um dia cada: Seis graus e Frame do dia.</p>`;
}

// achou o símbolo com o Perfil aberto por baixo: o cartão passa a dizer "você já achou" na hora
window.addEventListener('ovo:achado', () => { const c = document.querySelector('#view[data-aba="perfil"] #cartao-ovo'); if (c) c.innerHTML = cartaoOvo(); });

function ajustes() {
  const u = nuvem.usuario();
  const streamings = [...new Set(MEUS_STREAMINGS.values())];
  // Os streamings são de cada perfil. Quem assina algum vê o bloco aqui; quem não assina nenhum não vê filtro nem
  // destaque em lugar nenhum, e o bloco fica guardado em "Avançado" para o dia em que assinar.
  const blocoStreamings = `<section><h2>${streamings.length ? 'Seus streamings' : 'Streamings que você assina'} <small>${u ? 'toque para ligar ou desligar' : ''}</small></h2>
    <div class="card">${u ? `<div class="seg">${SERVICOS.map((s) => `<button data-streaming="${esc(s.nome)}" aria-pressed="${streamings.includes(s.nome)}">${esc(s.nome)}</button>`).join('')}</div>` : `<p>${esc(streamings.join(' · '))}</p>`}
      <p>${streamings.length ? 'Aparecem primeiro e com destaque em "Onde assistir" e valem para o filtro "Só nos meus streamings" da busca e do Quero ver. Valem só para o seu perfil.' : 'Nenhum ligado. Se você ligar algum, ele ganha destaque em "Onde assistir" e aparece o filtro "Só nos meus streamings" na busca e no Quero ver. Vale só para o seu perfil.'}</p></div>
  </section>`;
  return `
  <section><h2>Conta</h2>
    <div class="card">${u
      ? `<p>Você entrou como <b style="color:var(--fg)">${esc(u.email)}</b>. O que você marca fica guardado na sua conta.</p>
         ${dados.pendencias() ? `<p class="ruim">${dados.pendencias()} marcaç${dados.pendencias() > 1 ? 'ões estão' : 'ão está'} esperando a internet para subir. Sobe${dados.pendencias() > 1 ? 'm' : ''} sozinha${dados.pendencias() > 1 ? 's' : ''} quando a conexão voltar.</p>` : ''}
         <div class="actions"><a class="btn small on-list" href="#/importar/letterboxd">Importar do Letterboxd</a><button class="btn small" data-acao="sair">Sair</button></div>`
      : `<p>Entre com a sua conta Google para guardar notas, diário e listas na sua conta e ver as do outro. Só os e-mails de vocês dois entram, e o app não pede nem guarda senha.</p>
         ${nuvem.erroDeLogin() ? `<p class="ruim">${esc(nuvem.erroDeLogin())}</p>` : ''}
         <div class="actions"><button class="btn on-list" data-acao="entrar" ${nuvem.disponivel() ? '' : 'disabled'}>Entrar com Google</button></div>
         ${nuvem.disponivel() ? '' : '<p class="note">Sem ligação com o servidor agora. Confira a internet.</p>'}`}
    </div>
  </section>
  ${u ? `<section><h2>Avisos neste aparelho</h2>
    <div class="card" id="cartao-avisos"><p>Episódio novo das séries que você acompanha e estreia marcada com "Avisar".</p><div class="skel txt"></div></div>
  </section>` : ''}
  ${streamings.length ? blocoStreamings : ''}
  <section><h2>Caça ao símbolo</h2>
    <div class="card" id="cartao-ovo">${cartaoOvo()}</div>
  </section>
  <details class="avancado" ${chave('tmdb') ? '' : 'open'}><summary><span>Avançado<small>${streamings.length ? '' : 'Streamings, '}${streamings.length ? 'Chaves' : 'chaves'} das APIs e dados deste aparelho. Não é de uso diário.</small></span><svg class="vai" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></summary>
  ${streamings.length || !u ? '' : blocoStreamings}
  <section><h2>Chaves das APIs</h2>
    <form class="card" id="chaves">
      <p>${u ? 'As chaves ficam guardadas na conta e chegam sozinhas em cada aparelho depois do login.' : 'Sem login, as chaves ficam só neste aparelho.'}</p>
      <label class="campo">Chave do TMDB (v3) ${chave('tmdb') ? `<span class="ok">salva: ${mascara(chave('tmdb'))}</span>` : '<span class="ruim">faltando</span>'}
        <input name="tmdb" type="password" autocomplete="off" placeholder="${chave('tmdb') ? 'Colar outra para trocar' : 'Cole a chave aqui'}"></label>
      <label class="campo">Chave da OMDb ${chave('omdb') ? `<span class="ok">salva: ${mascara(chave('omdb'))}</span>` : '<span class="ruim">faltando</span>'}
        <input name="omdb" type="password" autocomplete="off" placeholder="${chave('omdb') ? 'Colar outra para trocar' : 'Cole a chave aqui'}"></label>
      <div class="actions"><button class="btn small on-seen" type="submit">Salvar e testar</button></div>
    </form>
  </section>
  <section><h2>Dados neste aparelho</h2>
    <div class="card"><p>O cache guarda o que já foi buscado para abrir rápido e funcionar sem internet.</p>
      <div class="actions"><button class="btn small" data-acao="limpar-cache">Limpar cache</button>${u ? '' : '<button class="btn small" data-acao="apagar-dados">Apagar minhas marcações</button>'}</div></div>
  </section>
  </details>
  <p class="note">Dados e imagens: The Movie Database (TMDB). Este app usa a API do TMDB, mas não é endossado nem certificado pelo TMDB. Onde assistir: JustWatch. Notas IMDb, Rotten Tomatoes e Metacritic: OMDb API. Prêmios: Wikidata.</p>`;
}

export async function render(el) {
  const minhaVez = ++vez;
  const u = nuvem.usuario();
  const o = u ? nuvem.outro() : null;
  if (vendo && (!o || vendo !== o.id)) vendo = null;
  const ehMeu = !vendo;
  const pessoa = ehMeu ? (u || { nome: 'Você' }) : o;
  const local = dados.todos();
  const topo = (numeros) => `
  <section style="align-items:center;text-align:center;gap:10px">
    ${avatar(pessoa)}
    <div style="font-size:24px;font-weight:800;letter-spacing:-.02em;display:flex;align-items:center;gap:8px">${esc(pessoa.nome)}${ehMeu ? simboloEscondido('perfil') : ''}</div>
    ${ehMeu && u ? `<div class="actions" style="justify-content:center;gap:16px;margin-top:-6px"><label class="texto" style="cursor:pointer">Trocar foto<input type="file" accept="image/*" id="nova-foto" hidden></label>${nuvem.fotoEscolhida() ? '<button class="texto" data-acao="foto-google">Usar a do Google</button>' : ''}</div>` : ''}
    ${o ? `<div class="seg" role="group" aria-label="Perfil"><button data-ver="" aria-pressed="${ehMeu}">Você</button><button data-ver="${o.id}" aria-pressed="${!ehMeu}">${esc(o.nome)}${o.ativo ? '' : ' (ainda não entrou)'}</button></div>` : ''}
    <div class="pstats">${numeros}</div>
    ${u ? '' : '<p class="note">Sem login, estes números são só deste aparelho.</p>'}
  </section>`;
  const numerosLocais = `<div><b>${local.filter((x) => x.tipo === 'filme' && x.visto).length}</b><span>Filmes</span></div><div><b>${local.filter((x) => x.tipo === 'serie' && contaComoVisto(x)).length}</b><span>Séries</span></div><div><b>${dados.totalEpisodios()}</b><span>Episódios</span></div><div><b>${local.filter((x) => x.quero).length}</b><span>Quero ver</span></div>`;

  // primeiro o que já está no aparelho; as estatísticas chegam em seguida
  el.innerHTML = `${topo(ehMeu ? numerosLocais : '')}${u ? '<div id="corpo-perfil" style="display:flex;flex-direction:column;gap:28px"><div class="skel tit"></div><div class="skel txt"></div><div class="skel txt" style="width:70%"></div></div>' : ''}${ehMeu ? ajustes() : ''}`;
  ligar(el);
  // o placar da caça ao símbolo chega da conta um instante depois
  // (busca de novo a cada visita: o outro pode ter achado o símbolo depois que o app abriu)
  if (ehMeu) (u ? ovo.atualizar() : ovo.pronto()).then(() => { const c = $('#cartao-ovo', el); if (c && minhaVez === vez && naTela(el)) c.innerHTML = cartaoOvo(); });

  if (!u) return;
  let d;
  try { d = await carregar(ehMeu ? u.id : o.id, ehMeu); } catch (erro) {
    if (minhaVez === vez && naTela(el) && $('#corpo-perfil', el)) $('#corpo-perfil', el).innerHTML = '<p class="note">Não deu para carregar as estatísticas. Confira a internet.</p>';
    return;
  }
  if (minhaVez !== vez || !naTela(el) || !$('#corpo-perfil', el)) return;
  const e = estatisticas(d);
  grafico = { d, e };
  if (!ehMeu) {
    $('.pstats', el).innerHTML = `<div><b>${e.total}</b><span>Filmes</span></div><div><b>${e.series}</b><span>Séries</span></div><div><b>${e.noAno}</b><span>Em ${e.ano}</span></div><div><b>${social.queroDoOutro().length}</b><span>Quero ver</span></div>`;
  }
  $('#corpo-perfil', el).innerHTML = corpoPerfil(pessoa, ehMeu, d, e);

  // fotos dos atores e diretores do ranking (ficam guardadas depois da primeira vez)
  const faltam = [...new Set([...e.atores, ...e.diretores, ...e.melhores].map((p) => p.id))].filter((id) => !fotos.has(id));
  for (const id of faltam) {
    tmdb.fotoDaPessoa(id).then((caminho) => {
      fotos.set(id, caminho || '');
      if (minhaVez !== vez || !caminho) return;
      el.querySelectorAll(`[data-pessoa="${id}"]`).forEach((s) => { if (!s.querySelector('img')) s.insertAdjacentHTML('beforeend', `<img src="${img(caminho, 'w185')}" alt="" crossorigin="anonymous">`); });
    }).catch(() => {});
  }
}

/** Preenche o cartão de avisos conforme o estado deste aparelho. */
async function cartaoAvisos(el) {
  const c = $('#cartao-avisos', el);
  if (!c) return;
  const e = await avisos.estado();
  const texto = {
    'sem-suporte': 'Este navegador não recebe avisos. No iPhone, instale o app na tela de início (Compartilhar → Adicionar à Tela de Início) e abra por lá.',
    bloqueado: 'Os avisos estão bloqueados para este site nas configurações do navegador.',
    ligado: 'Ligados neste aparelho.',
    desligado: 'Desligados neste aparelho.',
  }[e];
  const botoes = { ligado: '<button class="btn small" data-acao="aviso-teste">Mandar um aviso de teste</button><button class="btn small" data-acao="avisos-desligar">Desligar</button>', desligado: '<button class="btn small on-seen" data-acao="avisos-ligar">Ativar avisos</button>' }[e] || '';
  if (!$('#cartao-avisos', el)) return;
  c.innerHTML = `<p>Episódio novo das séries que você acompanha e estreia marcada com "Avisar". Chegam às 9h.</p>
    <p class="${e === 'ligado' ? 'ok' : ''}" style="${e === 'ligado' ? '' : 'color:var(--fg)'}">${texto}</p>${botoes ? `<div class="actions">${botoes}</div>` : ''}`;
}

/** Reduz a imagem escolhida para um quadrado pequeno (recorte pelo centro), para caber no perfil. */
async function reduzirFoto(arquivo, lado = 256) {
  const url = URL.createObjectURL(arquivo);
  try {
    const im = new Image();
    await new Promise((ok, erro) => { im.onload = ok; im.onerror = erro; im.src = url; });
    const menor = Math.min(im.naturalWidth, im.naturalHeight);
    const tela = document.createElement('canvas');
    tela.width = tela.height = lado;
    tela.getContext('2d').drawImage(im, (im.naturalWidth - menor) / 2, (im.naturalHeight - menor) / 2, menor, menor, 0, 0, lado, lado);
    return tela.toDataURL('image/jpeg', 0.82);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function ligar(el) {
  cartaoAvisos(el);
  const novaFoto = $('#nova-foto', el);
  if (novaFoto) {
    novaFoto.onchange = async () => {
      const arquivo = novaFoto.files?.[0];
      if (!arquivo) return;
      let foto;
      try { foto = await reduzirFoto(arquivo); } catch { toast('Não deu para ler essa imagem'); return; }
      toast((await nuvem.salvarFoto(foto)) ? 'Foto trocada' : 'Não deu para gravar a foto');
    };
  }
  const form = $('#chaves', el);
  if (form) {
    form.onsubmit = async (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      const nova = { tmdb: String(f.get('tmdb') || '').trim() || chave('tmdb'), omdb: String(f.get('omdb') || '').trim() || chave('omdb') };
      if (!nova.tmdb) { toast('Cole a chave do TMDB'); return; }
      let ok = false;
      try { ok = await tmdb.testarChave(nova.tmdb); } catch { toast('Sem internet para testar a chave'); return; }
      if (!ok) { toast('O TMDB recusou essa chave'); return; }
      salvarChaves(nova);
      if (nuvem.usuario()) await nuvem.banco().from('segredos').upsert([{ nome: 'tmdb', valor: nova.tmdb }, ...(nova.omdb ? [{ nome: 'omdb', valor: nova.omdb }] : [])]);
      toast('Chaves salvas');
      if (naTela(el)) render(el);
    };
  }

  el.onclick = async (e) => {
    const barra = e.target.closest('[data-graf]');
    if (barra) { if (grafico) abrirGrafico(barra.dataset.graf, barra.dataset.v); return; }
    const st = e.target.closest('button[data-streaming]');
    if (st) {
      const ok = await nuvem.alternarStreaming(st.dataset.streaming);
      if (!ok) toast('Não deu para gravar');
      if (naTela(el)) render(el);
      return;
    }
    const ver = e.target.closest('button[data-ver]');
    if (ver) { vendo = ver.dataset.ver || null; render(el); window.scrollTo(0, 0); return; }
    const b = e.target.closest('button[data-acao]');
    if (!b) return;
    const acao = b.dataset.acao;
    if (acao === 'entrar') {
      b.disabled = true;
      try { await nuvem.entrar(); } catch { b.disabled = false; toast('Não deu para abrir o login'); }
    } else if (acao === 'foto-google') {
      toast((await nuvem.salvarFoto(null)) ? 'Voltou para a foto do Google' : 'Não deu para gravar');
    } else if (acao === 'sair') {
      // os avisos são de quem está logado: ao sair, este aparelho deixa de recebê-los (e não fica preso à conta anterior)
      await avisos.desligar().catch(() => {});
      await nuvem.sair();
      toast('Você saiu');
    } else if (acao === 'avisos-ligar') {
      b.disabled = true;
      const problema = await avisos.ligar();
      toast(problema || 'Avisos ligados neste aparelho');
      cartaoAvisos(el);
    } else if (acao === 'avisos-desligar') {
      await avisos.desligar();
      toast('Avisos desligados neste aparelho');
      cartaoAvisos(el);
    } else if (acao === 'aviso-teste') {
      b.disabled = true;
      try { const n = await avisos.testar(); toast(n ? 'Aviso de teste enviado' : 'Nenhum aparelho recebeu. Desligue e ative de novo.'); } catch { toast('Não deu para mandar o teste'); }
      b.disabled = false;
    } else if (acao === 'dica') {
      b.outerHTML = `<p style="color:var(--fg)">Agora está ${ovo.dicaDeHoje()}.</p>`;
    } else if (acao === 'limpar-cache') {
      await limparCache();
      toast('Cache limpo');
    } else if (acao === 'apagar-dados') {
      if (b.dataset.certeza) { dados.apagarTudo(); toast('Marcações apagadas'); render(el); } else { b.dataset.certeza = '1'; b.textContent = 'Toque de novo para apagar'; b.classList.add('on-list'); }
    } else if (acao === 'lista') {
      // abre ou fecha uma lista (ranking): os títulos vêm na ordem
      const caixa = b.closest('.temp');
      if (caixa.classList.toggle('aberta')) {
        caixa.insertAdjacentHTML('beforeend', '<div class="temp-c"><div class="skel txt"></div></div>');
        const { data } = await nuvem.banco().from('lista_itens').select('posicao, tipo, tmdb_id').eq('lista_id', b.dataset.id).order('posicao');
        const info = await dados.resumos(data || []);
        const corpo = caixa.querySelector('.temp-c');
        // a lista é sua: dá para trocar a ordem, pôr e tirar títulos
        const editar = vendo ? '' : `<a class="texto" href="#/editar/lista-${Number(b.dataset.id)}" style="display:block;padding:4px 0 8px">Editar esta lista</a>`;
        if (corpo) corpo.innerHTML = editar + ((data || []).map((i) => { const r = info.get(K(i.tipo, i.tmdb_id)) || {}; const meu = dados.titulo(i.tipo, i.tmdb_id); return `<a class="li" href="#/${i.tipo}/${i.tmdb_id}" style="grid-template-columns:26px 36px 1fr auto"><span class="date" style="font-size:18px">${i.posicao}</span>${poster({ titulo: r.titulo || '', poster: r.poster }, { tam: 'w154' })}<div><div class="t">${esc(r.titulo || 'Sem título')}</div><div class="s">${r.ano || ''}</div></div><span class="r">${meu.nota != null ? `você ${selo(meu.nota)}` : meu.visto ? 'visto' : ''}</span></a>`; }).join('') || '<p class="note">Lista vazia.</p>');
      } else caixa.querySelector('.temp-c')?.remove();
    }
  };
}
