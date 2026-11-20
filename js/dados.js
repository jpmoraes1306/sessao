// Dados da pessoa: visto, nota (0 a 10), curtido, quero ver, séries acompanhadas e episódios.
// - Sem login: ficam só neste aparelho (localStorage).
// - Com login: a conta no Supabase é a fonte de verdade. Este módulo guarda uma cópia local para
//   abrir rápido e sem internet, e cada mudança é gravada na conta na hora.
// - O que foi marcado antes do primeiro login sobe para a conta de quem entrar.
import * as nuvem from './nuvem.js';

const K = 'sessao:dados:v2';
const K_ANTIGA = 'sessao:dados:v1';
let d = { dono: null, titulos: {}, series: {}, favoritos: [], pendentes: {} };
try {
  const atual = localStorage.getItem(K);
  if (atual) d = { ...d, ...JSON.parse(atual) };
  else if (localStorage.getItem(K_ANTIGA)) {
    // versão antiga guardava estrelas (0,5 a 5): converte para nota de 0 a 10
    d = { ...d, ...JSON.parse(localStorage.getItem(K_ANTIGA)) };
    for (const t of Object.values(d.titulos)) if (t.nota != null) t.nota *= 2;
    for (const s of Object.values(d.series)) {
      for (const e of Object.values(s.eps || {})) if (e.r != null) e.r *= 2;
      for (const n in (s.temps || {})) s.temps[n] *= 2;
    }
    localStorage.setItem(K, JSON.stringify(d));
    localStorage.removeItem(K_ANTIGA);
  }
} catch { /* começa vazio */ }

const ouvintes = new Set();
/** Avisa quando os dados foram trocados por inteiro (depois de sincronizar com a conta). */
export const aoSincronizar = (fn) => { ouvintes.add(fn); return () => ouvintes.delete(fn); };

function salvar() {
  try { localStorage.setItem(K, JSON.stringify(d)); } catch { /* sem espaço: segue na memória */ }
}

const hoje = () => new Date().toLocaleDateString('sv-SE');
const chaveDe = (tipo, id) => `${tipo}:${id}`;
const ke = (t, e) => `${t}x${e}`;
const eu = () => nuvem.usuario()?.id || null;
const banco = () => (eu() ? nuvem.banco() : null);

/**
 * Grava na conta sem travar a tela. `alvo` = [descrição, chave do que mudou].
 * Se a gravação falhar (sem internet, por exemplo), a chave fica em `d.pendentes` e o estado
 * guardado no aparelho é reenviado quando a internet voltar, antes de qualquer sincronização.
 */
function naConta(alvo, fn) {
  const [descricao, suja] = [].concat(alvo);
  const b = banco();
  if (!b) return;
  const falhou = (motivo) => {
    console.warn(`Não gravou na conta (${descricao}):`, motivo);
    if (suja) { d.pendentes = { ...d.pendentes, [suja]: true }; salvar(); }
  };
  Promise.resolve().then(() => fn(b, eu())).then((r) => {
    const erros = [].concat(r || []).map((x) => x?.error).filter(Boolean);
    if (erros.length) falhou(erros[0].message);
  }).catch((erro) => falhou(erro?.message || erro));
}

/** Quantas marcações estão esperando a internet para subir. */
export const pendencias = () => Object.keys(d.pendentes || {}).length;

/** Reenvia o estado guardado no aparelho de tudo que não conseguiu gravar. Devolve true se não sobrou nada. */
async function reenviar() {
  const b = banco();
  const user = eu();
  if (!b) return false;
  for (const chave of Object.keys(d.pendentes || {})) {
    const erros = [];
    const ver = (r) => { if (r?.error) erros.push(r.error); };
    try {
      if (chave === 'favs') {
        ver(await b.from('favoritos').delete().eq('user_id', user));
        if (favoritos().length) ver(await b.from('favoritos').insert(favoritos().map((f, i) => ({ user_id: user, posicao: i + 1, tipo: f.tipo, tmdb_id: f.id }))));
      } else if (chave.startsWith('eps:')) {
        const serie = Number(chave.slice(4));
        const s = d.series[serie] || { eps: {}, temps: {} };
        ver(await b.from('episodios_vistos').delete().match({ user_id: user, serie_id: serie }));
        const eps = Object.entries(s.eps || {}).map(([k, v]) => { const [t, e] = k.split('x').map(Number); return { user_id: user, serie_id: serie, temporada: t, episodio: e, data: v.d || hoje(), nota: v.r ?? null }; });
        if (eps.length) ver(await b.from('episodios_vistos').insert(eps));
        ver(await b.from('notas_temporada').delete().match({ user_id: user, serie_id: serie }));
        const temps = Object.entries(s.temps || {}).map(([t, r]) => ({ user_id: user, serie_id: serie, temporada: Number(t), nota: r }));
        if (temps.length) ver(await b.from('notas_temporada').insert(temps));
      } else {
        const [tipo, id] = chave.split(':');
        const reg = d.titulos[chave];
        const base = { user_id: user, tipo, tmdb_id: Number(id) };
        if (reg && (reg.visto || reg.nota != null || reg.curtido || reg.seguindo || reg.review)) {
          ver(await b.from('cache_titulos').upsert({ tipo, tmdb_id: Number(id), resumo: resumoDe(reg) }, { onConflict: 'tipo,tmdb_id', ignoreDuplicates: true }));
          ver(await b.from('avaliacoes').upsert({ ...base, visto: !!reg.visto, nota: reg.nota ?? null, curtido: !!reg.curtido, seguindo: !!reg.seguindo, review: reg.review || null, spoiler: !!reg.spoiler, review_em: reg.reviewEm || null, atualizado_em: reg.em || new Date().toISOString() }));
          const entraNoDiario = reg.vistoEm && (tipo === 'filme' ? reg.visto : reg.nota != null);
          if (entraNoDiario) ver(await b.from('diario').upsert({ ...base, data: reg.vistoEm, nota: reg.nota ?? null, origem: 'app' }, { onConflict: 'user_id,tipo,tmdb_id,data', ignoreDuplicates: true }));
        } else ver(await b.from('avaliacoes').delete().match(base));
        if (reg?.quero) ver(await b.from('quero_ver').upsert({ ...base, juntos: false, adicionado_em: reg.queroEm || new Date().toISOString() }));
        else ver(await b.from('quero_ver').delete().match({ ...base, juntos: false }));
      }
    } catch { return false; } // ainda sem internet: tenta de novo depois
    if (erros.length) return false;
    delete d.pendentes[chave];
    salvar();
  }
  return true;
}

/** O que guardamos de cada título para listar sem consultar o TMDB de novo. */
const resumoDe = (m) => ({
  titulo: m.titulo, ano: m.ano ?? null, data: m.data || '', poster: m.poster || '', duracao: m.duracao || 0,
  generos: m.generos || [], nota: m.tmdb || 0, pop: m.pop || 0,
  ...(m.diretores ? { diretores: m.diretores } : {}), ...(m.elenco ? { elenco: m.elenco } : {}),
});

/* ---------- títulos ---------- */
/** Registro do título para esta pessoa ({} se ela nunca mexeu nele). */
export const titulo = (tipo, id) => d.titulos[chaveDe(tipo, id)] || {};
export const todos = () => Object.values(d.titulos);

/** meta = { tipo, id, titulo, ano, data, poster, duracao, tmdb, pop, generos }; mudanca = { visto, nota, curtido, quero, seguindo }. */
export function marcar(meta, mudanca) {
  const k = chaveDe(meta.tipo, meta.id);
  const antes = d.titulos[k] || {};
  const reg = { ...antes, ...meta, ...mudanca, em: new Date().toISOString() };
  if (mudanca.quero && !antes.quero) reg.queroEm = reg.em;
  const deuNota = 'nota' in mudanca && mudanca.nota != null;
  if ((mudanca.visto && !antes.visto) || deuNota) reg.vistoEm = hoje();
  const emUso = reg.visto || reg.nota != null || reg.curtido || reg.quero || reg.seguindo || reg.review;
  if (emUso) d.titulos[k] = reg; else delete d.titulos[k];
  salvar();

  naConta(['título', k], (b, user) => {
    const chave = { user_id: user, tipo: meta.tipo, tmdb_id: meta.id };
    const pedidos = [b.from('cache_titulos').upsert({ tipo: meta.tipo, tmdb_id: meta.id, resumo: resumoDe(reg) }, { onConflict: 'tipo,tmdb_id', ignoreDuplicates: true })];
    const temAvaliacao = reg.visto || reg.nota != null || reg.curtido || reg.seguindo || reg.review;
    pedidos.push(temAvaliacao
      ? b.from('avaliacoes').upsert({ ...chave, visto: !!reg.visto, nota: reg.nota ?? null, curtido: !!reg.curtido, seguindo: !!reg.seguindo, atualizado_em: reg.em })
      : b.from('avaliacoes').delete().match(chave));
    if ('quero' in mudanca && !!mudanca.quero !== !!antes.quero) {
      pedidos.push(mudanca.quero
        ? b.from('quero_ver').upsert({ ...chave, juntos: false, adicionado_em: reg.queroEm })
        : b.from('quero_ver').delete().match({ ...chave, juntos: false }));
    }
    // Diário sem clique a mais (pedido do João): dar nota ou marcar como visto registra sozinho a sessão
    // de hoje, e a atividade aparece no Início para os dois. Se a sessão de hoje já existe, só a nota
    // dela muda. Se o filme já tinha sido visto antes, a sessão entra como "revisto".
    const entraNoDiario = meta.tipo === 'filme' ? reg.visto && (!antes.visto || deuNota) : deuNota; // série: entra quando recebe nota
    if (entraNoDiario) {
      pedidos.push((async () => {
        const deHoje = await b.from('diario').update({ nota: reg.nota ?? null }).match({ ...chave, data: hoje() }).select('id');
        if (deHoje.error || deHoje.data.length) return deHoje;
        return b.from('diario').insert({ ...chave, data: hoje(), nota: reg.nota ?? null, revisto: meta.tipo === 'filme' && !!antes.visto, origem: 'app' });
      })());
    } else if ('nota' in mudanca) {
      // nota retirada: a sessão de hoje (se houver) fica sem nota
      pedidos.push(b.from('diario').update({ nota: null }).match({ ...chave, data: hoje() }));
    }
    if (meta.tipo === 'filme' && antes.visto && mudanca.visto === false && antes.vistoEm === hoje()) {
      pedidos.push(b.from('diario').delete().match({ ...chave, data: hoje(), origem: 'app' }));
    }
    return Promise.all(pedidos);
  });
  return titulo(meta.tipo, meta.id);
}

/** Garante que o resumo do título (pôster, ano...) está no banco, para as listas dos dois. */
export async function garantirResumo(meta) {
  const b = banco();
  if (b) await b.from('cache_titulos').upsert({ tipo: meta.tipo, tmdb_id: meta.id, resumo: resumoDe(meta) }, { onConflict: 'tipo,tmdb_id', ignoreDuplicates: true });
}

/* ---------- diário ---------- */
/** Registra uma sessão (data e se foi revisto). Marca o título como visto se ainda não estava. */
export async function registrarSessao(meta, data, revisto, juntosId = null) {
  const b = banco();
  if (!b) return false;
  const k = chaveDe(meta.tipo, meta.id);
  const reg = { ...d.titulos[k], ...meta, visto: true, quero: false, vistoEm: d.titulos[k]?.vistoEm || data, em: new Date().toISOString() };
  d.titulos[k] = reg;
  salvar();
  const chave = { user_id: eu(), tipo: meta.tipo, tmdb_id: meta.id };
  const r = await Promise.all([
    b.from('cache_titulos').upsert({ tipo: meta.tipo, tmdb_id: meta.id, resumo: resumoDe(reg) }, { onConflict: 'tipo,tmdb_id', ignoreDuplicates: true }),
    b.from('avaliacoes').upsert({ ...chave, visto: true, nota: reg.nota ?? null, curtido: !!reg.curtido, seguindo: !!reg.seguindo, atualizado_em: reg.em }),
    b.from('quero_ver').delete().match({ ...chave, juntos: false }),
    b.from('diario').upsert({ ...chave, data, nota: reg.nota ?? null, revisto: !!revisto, origem: 'app', ...(juntosId ? { juntos_id: juntosId } : {}) }, { onConflict: 'user_id,tipo,tmdb_id,data' }),
  ]);
  return !r.some((x) => x.error);
}

/* ---------- review ---------- */
/** Salva (ou apaga, com texto vazio) a review da pessoa para o título. Escrever uma review marca como visto. */
export function salvarReview(meta, texto, spoiler) {
  const k = chaveDe(meta.tipo, meta.id);
  const limpo = (texto || '').trim();
  const agora = new Date().toISOString();
  const reg = { ...d.titulos[k], ...meta, review: limpo || null, spoiler: limpo ? !!spoiler : false, reviewEm: limpo ? agora : null, em: agora };
  if (limpo && !reg.visto) { reg.visto = true; reg.vistoEm = hoje(); reg.quero = false; }
  d.titulos[k] = reg;
  salvar();
  naConta(['review', k], (b, user) => Promise.all([
    b.from('cache_titulos').upsert({ tipo: meta.tipo, tmdb_id: meta.id, resumo: resumoDe(reg) }, { onConflict: 'tipo,tmdb_id', ignoreDuplicates: true }),
    b.from('avaliacoes').upsert({ user_id: user, tipo: meta.tipo, tmdb_id: meta.id, visto: !!reg.visto, nota: reg.nota ?? null, curtido: !!reg.curtido, seguindo: !!reg.seguindo, review: reg.review, spoiler: reg.spoiler, review_em: reg.reviewEm, atualizado_em: agora }),
  ]));
  return reg;
}

/* ---------- favoritos (top 4 do perfil) ---------- */
export const favoritos = () => d.favoritos || [];
export const ehFavorito = (tipo, id) => favoritos().some((f) => f.tipo === tipo && f.id === id);
/** Põe ou tira dos favoritos. Devolve false se já há 4 e a pessoa tentou pôr o quinto. */
export function alternarFavorito(meta) {
  const lista = favoritos().filter((f) => !(f.tipo === meta.tipo && f.id === meta.id));
  if (lista.length === favoritos().length) {
    if (lista.length >= 4) return false;
    lista.push({ tipo: meta.tipo, id: meta.id, titulo: meta.titulo, ano: meta.ano, poster: meta.poster });
  }
  d.favoritos = lista;
  salvar();
  naConta(['favoritos', 'favs'], async (b, user) => {
    await garantirResumo(meta);
    await b.from('favoritos').delete().eq('user_id', user);
    return lista.length ? b.from('favoritos').insert(lista.map((f, i) => ({ user_id: user, posicao: i + 1, tipo: f.tipo, tmdb_id: f.id }))) : null;
  });
  return true;
}

/* ---------- episódios ---------- */
const serieDe = (id) => (d.series[id] = d.series[id] || { eps: {}, temps: {} });

/** { "2x3": { d: "2026-11-19", r: 8 } } */
export const episodios = (serieId) => d.series[serieId]?.eps || {};
export const notaTemporada = (serieId, t) => d.series[serieId]?.temps?.[t] ?? null;

export function marcarEpisodios(serieId, lista, visto) {
  const s = serieDe(serieId);
  for (const { t, e } of lista) {
    const k = ke(t, e);
    if (visto) s.eps[k] = { ...s.eps[k], d: s.eps[k]?.d || hoje() };
    else delete s.eps[k];
  }
  salvar();
  naConta(['episódios', `eps:${serieId}`], (b, user) => {
    if (visto) {
      return b.from('episodios_vistos').upsert(lista.map(({ t, e }) => ({ user_id: user, serie_id: Number(serieId), temporada: t, episodio: e, data: s.eps[ke(t, e)].d, nota: s.eps[ke(t, e)].r ?? null })));
    }
    // apaga por temporada, para não mandar um pedido por episódio
    const porTemp = {};
    for (const { t, e } of lista) (porTemp[t] = porTemp[t] || []).push(e);
    return Promise.all(Object.entries(porTemp).map(([t, eps]) => b.from('episodios_vistos').delete().match({ user_id: user, serie_id: Number(serieId), temporada: Number(t) }).in('episodio', eps)));
  });
}

export function darNotaEpisodio(serieId, t, e, r) {
  const s = serieDe(serieId);
  const k = ke(t, e);
  s.eps[k] = { ...s.eps[k], d: s.eps[k]?.d || hoje() };
  if (r == null) delete s.eps[k].r; else s.eps[k].r = r;
  salvar();
  naConta(['nota do episódio', `eps:${serieId}`], (b, user) => b.from('episodios_vistos').upsert({ user_id: user, serie_id: Number(serieId), temporada: t, episodio: e, data: s.eps[k].d, nota: r ?? null }));
}

export function darNotaTemporada(serieId, t, r) {
  const s = serieDe(serieId);
  if (r == null) delete s.temps[t]; else s.temps[t] = r;
  salvar();
  naConta(['nota da temporada', `eps:${serieId}`], (b, user) => (r == null
    ? b.from('notas_temporada').delete().match({ user_id: user, serie_id: Number(serieId), temporada: t })
    : b.from('notas_temporada').upsert({ user_id: user, serie_id: Number(serieId), temporada: t, nota: r })));
}

export const totalEpisodios = () => Object.values(d.series).reduce((a, s) => a + Object.keys(s.eps).length, 0);

export function apagarTudo() {
  d = { dono: d.dono, titulos: {}, series: {}, favoritos: [] };
  salvar();
}

/* ---------- conta ---------- */
/** Lê uma tabela inteira da pessoa, de mil em mil linhas. */
async function lerTudo(consulta) {
  const linhas = [];
  for (let i = 0; ; i += 1000) {
    const { data, error } = await consulta().range(i, i + 999);
    if (error) throw error;
    linhas.push(...data);
    if (data.length < 1000) return linhas;
  }
}

/** Resumos (título, pôster, ano...) de uma lista de { tipo, tmdb_id }, buscados em lotes. */
export async function resumos(pares) {
  const b = nuvem.banco();
  const saida = new Map();
  if (!b) return saida;
  for (const tipo of ['filme', 'serie']) {
    const ids = [...new Set(pares.filter((p) => p.tipo === tipo).map((p) => p.tmdb_id))];
    for (let i = 0; i < ids.length; i += 200) {
      const { data, error } = await b.from('cache_titulos').select('tmdb_id, resumo').eq('tipo', tipo).in('tmdb_id', ids.slice(i, i + 200));
      if (error) throw error;
      for (const r of data) saida.set(chaveDe(tipo, r.tmdb_id), r.resumo);
    }
  }
  return saida;
}

/** Sobe para a conta o que foi marcado neste aparelho antes do login. */
async function subirLocal(b, user) {
  const titulos = Object.values(d.titulos);
  if (titulos.length) {
    await b.from('cache_titulos').upsert(titulos.map((t) => ({ tipo: t.tipo, tmdb_id: t.id, resumo: resumoDe(t) })), { onConflict: 'tipo,tmdb_id', ignoreDuplicates: true });
    const av = titulos.filter((t) => t.visto || t.nota != null || t.curtido || t.seguindo);
    if (av.length) await b.from('avaliacoes').upsert(av.map((t) => ({ user_id: user, tipo: t.tipo, tmdb_id: t.id, visto: !!t.visto, nota: t.nota ?? null, curtido: !!t.curtido, seguindo: !!t.seguindo, atualizado_em: t.em || new Date().toISOString() })), { ignoreDuplicates: true });
    const q = titulos.filter((t) => t.quero);
    if (q.length) await b.from('quero_ver').upsert(q.map((t) => ({ user_id: user, tipo: t.tipo, tmdb_id: t.id, juntos: false, adicionado_em: t.queroEm || t.em || new Date().toISOString() })), { ignoreDuplicates: true });
    const vistosHoje = titulos.filter((t) => t.tipo === 'filme' && t.visto && t.vistoEm);
    if (vistosHoje.length) await b.from('diario').upsert(vistosHoje.map((t) => ({ user_id: user, tipo: t.tipo, tmdb_id: t.id, data: t.vistoEm, nota: t.nota ?? null, origem: 'app' })), { onConflict: 'user_id,tipo,tmdb_id,data', ignoreDuplicates: true });
  }
  const eps = [];
  const temps = [];
  for (const [serie, s] of Object.entries(d.series)) {
    for (const [k, v] of Object.entries(s.eps || {})) { const [t, e] = k.split('x').map(Number); eps.push({ user_id: user, serie_id: Number(serie), temporada: t, episodio: e, data: v.d || hoje(), nota: v.r ?? null }); }
    for (const [t, r] of Object.entries(s.temps || {})) temps.push({ user_id: user, serie_id: Number(serie), temporada: Number(t), nota: r });
  }
  for (let i = 0; i < eps.length; i += 500) await b.from('episodios_vistos').upsert(eps.slice(i, i + 500), { ignoreDuplicates: true });
  if (temps.length) await b.from('notas_temporada').upsert(temps, { ignoreDuplicates: true });
}

let sincronizando = null;
/** Traz da conta tudo que é da pessoa e troca a cópia local. Chamado no login e depois do import. */
export function sincronizar() {
  if (sincronizando) return sincronizando;
  const b = banco();
  const user = eu();
  if (!b) return Promise.resolve(false);
  sincronizando = (async () => {
    try {
      // o que foi marcado sem internet sobe primeiro; se ainda não der, não sincroniza (para não perder a marcação)
      if (d.dono === user && pendencias() && !(await reenviar())) return false;
      if (d.dono !== user) {
        if (d.dono === null) await subirLocal(b, user); // marcado antes do login: vai para a conta
        else d = { dono: null, titulos: {}, series: {}, favoritos: [] }; // outra pessoa usou este aparelho: começa limpo
      }
      const [av, quero, eps, temps, favs] = await Promise.all([
        lerTudo(() => b.from('avaliacoes').select('tipo, tmdb_id, visto, nota, curtido, seguindo, review, spoiler, review_em, atualizado_em').eq('user_id', user).order('tmdb_id')),
        lerTudo(() => b.from('quero_ver').select('tipo, tmdb_id, adicionado_em').eq('user_id', user).eq('juntos', false).order('tmdb_id')),
        lerTudo(() => b.from('episodios_vistos').select('serie_id, temporada, episodio, data, nota').eq('user_id', user).order('serie_id')),
        lerTudo(() => b.from('notas_temporada').select('serie_id, temporada, nota').eq('user_id', user).order('serie_id')),
        lerTudo(() => b.from('favoritos').select('posicao, tipo, tmdb_id').eq('user_id', user).order('posicao')),
      ]);
      const info = await resumos([...av, ...quero, ...favs]);
      const novo = { dono: user, titulos: {}, series: {}, favoritos: [], pendentes: {} };
      const base = (tipo, id) => {
        const k = chaveDe(tipo, id);
        if (!novo.titulos[k]) {
          const r = info.get(k) || {};
          novo.titulos[k] = { tipo, id, titulo: r.titulo || d.titulos[k]?.titulo || '', ano: r.ano ?? null, data: r.data || '', poster: r.poster || '', duracao: r.duracao || 0, generos: r.generos || [], tmdb: r.nota || 0, pop: r.pop || 0 };
        }
        return novo.titulos[k];
      };
      for (const a of av) {
        Object.assign(base(a.tipo, a.tmdb_id), { visto: a.visto, nota: a.nota == null ? null : Number(a.nota), curtido: a.curtido, seguindo: a.seguindo, review: a.review || null, spoiler: a.spoiler, reviewEm: a.review_em, em: a.atualizado_em, vistoEm: d.titulos[chaveDe(a.tipo, a.tmdb_id)]?.vistoEm });
      }
      for (const q of quero) Object.assign(base(q.tipo, q.tmdb_id), { quero: true, queroEm: q.adicionado_em });
      novo.favoritos = favs.map((f) => { const r = info.get(chaveDe(f.tipo, f.tmdb_id)) || {}; return { tipo: f.tipo, id: f.tmdb_id, titulo: r.titulo || '', ano: r.ano ?? null, poster: r.poster || '' }; });
      for (const e of eps) {
        const s = (novo.series[e.serie_id] = novo.series[e.serie_id] || { eps: {}, temps: {} });
        s.eps[ke(e.temporada, e.episodio)] = { d: e.data, ...(e.nota == null ? {} : { r: Number(e.nota) }) };
      }
      for (const t of temps) {
        const s = (novo.series[t.serie_id] = novo.series[t.serie_id] || { eps: {}, temps: {} });
        s.temps[t.temporada] = Number(t.nota);
      }
      d = novo;
      salvar();
      ouvintes.forEach((fn) => fn());
      return true;
    } catch (erro) {
      console.warn('Não deu para sincronizar com a conta:', erro?.message || erro);
      return false;
    } finally {
      sincronizando = null;
    }
  })();
  return sincronizando;
}

// quando a internet volta, manda o que ficou pendente
if (typeof window !== 'undefined') window.addEventListener('online', () => { if (pendencias()) sincronizar(); });

// ao entrar, sincroniza; ao sair, a cópia local fica (ela é de quem estava logado)
let ultimoDono = null;
nuvem.aoMudar(() => {
  const user = eu();
  if (user && user !== ultimoDono) sincronizar();
  ultimoDono = user;
});
