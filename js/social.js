// O que é do OUTRO (só leitura) e o que é dos dois: nota e review dele, lista dele,
// "Queremos ver juntos", feed de atividade e compatibilidade.
import * as nuvem from './nuvem.js';
import * as dados from './dados.js';

let dele = new Map();        // "filme:123" -> { visto, nota, curtido, seguindo, temReview, em }
let queroDele = new Map();   // "filme:123" -> data em que ele adicionou
let juntos = new Map();      // "filme:123" -> { por, em }
let carregado = false;
const ouvintes = new Set();
export const aoCarregar = (fn) => { ouvintes.add(fn); return () => ouvintes.delete(fn); };
export const pronto = () => carregado;

const k = (tipo, id) => `${tipo}:${id}`;

async function lerTudo(consulta) {
  const linhas = [];
  for (let i = 0; ; i += 1000) {
    const { data, error } = await consulta().range(i, i + 999);
    if (error) throw error;
    linhas.push(...data);
    if (data.length < 1000) return linhas;
  }
}

/** Carrega o que é do outro e a lista "juntos". Chamado no login e depois de um import. */
export async function carregar() {
  const b = nuvem.usuario() ? nuvem.banco() : null;
  if (!b) { dele = new Map(); queroDele = new Map(); juntos = new Map(); carregado = false; return; }
  const o = nuvem.outro();
  try {
    const [av, quero, jun] = await Promise.all([
      o ? lerTudo(() => b.from('avaliacoes').select('tipo, tmdb_id, visto, nota, curtido, seguindo, review_em, atualizado_em').eq('user_id', o.id).order('tmdb_id')) : [],
      o ? lerTudo(() => b.from('quero_ver').select('tipo, tmdb_id, adicionado_em').eq('user_id', o.id).eq('juntos', false).order('tmdb_id')) : [],
      lerTudo(() => b.from('quero_ver').select('tipo, tmdb_id, user_id, adicionado_em').eq('juntos', true).order('tmdb_id')),
    ]);
    dele = new Map(av.map((a) => [k(a.tipo, a.tmdb_id), { visto: a.visto, nota: a.nota == null ? null : Number(a.nota), curtido: a.curtido, seguindo: a.seguindo, temReview: Boolean(a.review_em), em: a.atualizado_em }]));
    queroDele = new Map(quero.map((q) => [k(q.tipo, q.tmdb_id), q.adicionado_em]));
    juntos = new Map(jun.map((j) => [k(j.tipo, j.tmdb_id), { por: j.user_id, em: j.adicionado_em }]));
    carregado = true;
  } catch (erro) {
    // sem avisar as telas: redesenhar sem dado novo só faria a tela piscar (e o frame do dia tentaria de novo sem parar)
    console.warn('Não deu para carregar os dados do outro:', erro?.message || erro);
    return;
  }
  ouvintes.forEach((fn) => fn());
}

/** O que o outro fez com este título: { visto, nota, curtido, seguindo, temReview, quer } ou null. */
export function doOutro(tipo, id) {
  const a = dele.get(k(tipo, id));
  const quer = queroDele.has(k(tipo, id));
  return a || quer ? { ...(a || {}), quer } : null;
}
export const todosDoOutro = () => [...dele.entries()].map(([chave, v]) => { const [tipo, id] = chave.split(':'); return { tipo, id: Number(id), ...v }; });
export const queroDoOutro = () => [...queroDele.entries()].map(([chave, em]) => { const [tipo, id] = chave.split(':'); return { tipo, tmdb_id: Number(id), em }; });

/* ---------- queremos ver juntos ---------- */
export const estaEmJuntos = (tipo, id) => juntos.has(k(tipo, id));
export const listaJuntos = () => [...juntos.entries()].map(([chave, v]) => { const [tipo, id] = chave.split(':'); return { tipo, tmdb_id: Number(id), em: v.em, por: v.por }; });

export async function marcarJuntos(meta, sim) {
  const b = nuvem.banco();
  const eu = nuvem.usuario()?.id;
  if (!b || !eu) return false;
  const chave = k(meta.tipo, meta.id);
  if (sim) {
    juntos.set(chave, { por: eu, em: new Date().toISOString() });
    await dados.garantirResumo(meta);
    const { error } = await b.from('quero_ver').upsert({ user_id: eu, tipo: meta.tipo, tmdb_id: meta.id, juntos: true });
    if (error) { juntos.delete(chave); return false; }
  } else {
    juntos.delete(chave);
    await b.from('quero_ver').delete().match({ tipo: meta.tipo, tmdb_id: meta.id, juntos: true });
  }
  return true;
}

/* ---------- reviews ---------- */
/** Reviews de vocês dois para um título: [{ user_id, nome, eu, nota, review, spoiler, review_em, curtidaPorMim }] */
export async function reviews(tipo, id) {
  const b = nuvem.usuario() ? nuvem.banco() : null;
  if (!b) return [];
  const eu = nuvem.usuario().id;
  const [{ data: linhas }, { data: curtidas }, { data: comentarios }] = await Promise.all([
    b.from('avaliacoes').select('user_id, nota, review, spoiler, review_em').eq('tipo', tipo).eq('tmdb_id', id).not('review', 'is', null),
    b.from('curtidas_review').select('user_id, autor_id').eq('tipo', tipo).eq('tmdb_id', id),
    b.from('comentarios_review').select('id, user_id, autor_id, texto, criado_em').eq('tipo', tipo).eq('tmdb_id', id).order('criado_em'),
  ]);
  return (linhas || []).filter((l) => (l.review || '').trim()).map((l) => ({
    ...l, nota: l.nota == null ? null : Number(l.nota), eu: l.user_id === eu, nome: nuvem.pessoa(l.user_id)?.nome || '',
    curtidaPorMim: (curtidas || []).some((c) => c.user_id === eu && c.autor_id === l.user_id),
    curtidaPeloOutro: (curtidas || []).some((c) => c.user_id !== eu && c.autor_id === l.user_id),
    comentarios: (comentarios || []).filter((c) => c.autor_id === l.user_id).map(comentarioDe),
  }));
}
const comentarioDe = (c) => ({ id: c.id, user_id: c.user_id, eu: c.user_id === nuvem.usuario()?.id, nome: nuvem.pessoa(c.user_id)?.nome || '', texto: c.texto, criado_em: c.criado_em });

/** Comenta a review de `autor` sobre o título (pode ser a sua própria, para responder). Devolve o comentário gravado ou null. */
export async function comentarReview(tipo, id, autor, texto) {
  const b = nuvem.banco();
  const eu = nuvem.usuario()?.id;
  const limpo = (texto || '').trim().slice(0, 1000);
  if (!b || !eu || !limpo) return null;
  const { data, error } = await b.from('comentarios_review').insert({ user_id: eu, autor_id: autor, tipo, tmdb_id: id, texto: limpo }).select('id, user_id, autor_id, texto, criado_em').single();
  if (error || !data) return null;
  // o aviso no celular do outro sai pela função do servidor; se falhar, o comentário continua gravado
  b.functions.invoke('avisos', { body: { acao: 'comentou', tipo, tmdb_id: id } }).catch(() => {});
  return comentarioDe(data);
}
/** Apaga um comentário seu. */
export async function apagarComentario(idComentario) {
  const b = nuvem.banco();
  const eu = nuvem.usuario()?.id;
  if (!b || !eu) return false;
  const { error } = await b.from('comentarios_review').delete().eq('id', idComentario).eq('user_id', eu);
  return !error;
}

export async function curtirReview(tipo, id, autor, sim) {
  const b = nuvem.banco();
  const eu = nuvem.usuario()?.id;
  if (!b || !eu) return;
  if (sim) await b.from('curtidas_review').upsert({ user_id: eu, autor_id: autor, tipo, tmdb_id: id });
  else await b.from('curtidas_review').delete().match({ user_id: eu, autor_id: autor, tipo, tmdb_id: id });
}

/* ---------- compatibilidade ---------- */
/** Compara as notas nos títulos que os dois avaliaram. null se ainda não há base. */
export function compatibilidade() {
  const pares = [];
  for (const t of dados.todos()) {
    const o = dele.get(k(t.tipo, t.id));
    if (t.nota != null && o?.nota != null) pares.push({ tipo: t.tipo, id: t.id, titulo: t.titulo, ano: t.ano, poster: t.poster, minha: t.nota, dele: o.nota, dif: Math.abs(t.nota - o.nota) });
  }
  if (pares.length < 5) return null;
  const media = pares.reduce((s, p) => s + p.dif, 0) / pares.length;
  const vistosEmComum = dados.todos().filter((t) => t.visto && dele.get(k(t.tipo, t.id))?.visto).length;
  return {
    porcento: Math.round(Math.max(0, 100 - media * 12.5)), // diferença média de 0 ponto = 100%; de 8 pontos = 0%
    comparados: pares.length, vistosEmComum, diferencaMedia: media,
    iguais: pares.filter((p) => p.dif === 0).length,
    concordam: pares.filter((p) => p.dif === 0).sort((a, b) => b.minha - a.minha).slice(0, 6),
    discordam: [...pares].sort((a, b) => b.dif - a.dif).slice(0, 6),
  };
}

/* ---------- atividade ---------- */
/** Atividade do outro para o Início: só os FILMES que ele viu nos últimos `dias` dias (pelo diário dele), do mais
    recente para o mais antigo, cada filme uma vez. O resto (séries, notas antigas, listas) fica no perfil dele. */
export async function feed(dias = 7) {
  const b = nuvem.usuario() ? nuvem.banco() : null;
  const o = nuvem.outro();
  if (!b || !o) return [];
  const desde = new Date(Date.now() - dias * 864e5).toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
  const { data, error } = await b.from('diario').select('tipo, tmdb_id, data, nota, revisto').eq('user_id', o.id).eq('tipo', 'filme').gte('data', desde)
    .order('data', { ascending: false }).order('id', { ascending: false }).limit(60);
  if (error) throw error; // quem chama esconde a fileira: "não viu nada" só quando a conta respondeu isso
  const vistos = new Set();
  const linhas = data.filter((x) => !vistos.has(x.tmdb_id) && vistos.add(x.tmdb_id));
  const info = await dados.resumos(linhas);
  return linhas.map((x) => {
    const r = info.get(k(x.tipo, x.tmdb_id)) || {};
    return { tipo: x.tipo, tmdb_id: x.tmdb_id, data: x.data, nota: x.nota == null ? null : Number(x.nota), revisto: x.revisto, curtido: Boolean(dele.get(k(x.tipo, x.tmdb_id))?.curtido), nome: o.nome, titulo: r.titulo || 'Sem título', ano: r.ano, poster: r.poster || '' };
  });
}
// carrega quando alguém entra e sempre que os dados da pessoa são sincronizados (login, import)
let quem = null;
nuvem.aoMudar(() => {
  const id = nuvem.usuario()?.id || null;
  if (id !== quem) { quem = id; carregar(); }
});
