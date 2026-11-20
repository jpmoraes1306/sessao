// Mix: o que ver juntos, misturando o gosto dos dois (ideia do Thiago, no estilo do Blend do Spotify).
// Ordem: (1) o que está no "Quero ver" dos dois; (2) o que está na lista de um e combina com o gosto
// do outro; (3) sugestões do TMDB a partir dos favoritos dos dois que nenhum viu.
// É calculado no aparelho, sem custo, e refeito quando os dados mudam.
import * as tmdb from './tmdb.js';
import * as dados from './dados.js';
import * as social from './social.js';
import * as nuvem from './nuvem.js';

let guardado = null; // { quando, resultado }
const K = (tipo, id) => `${tipo}:${id}`;

/** Média das notas de uma pessoa por gênero e por diretor. */
function gosto(avaliados, info) {
  const g = new Map();
  const dir = new Map();
  let soma = 0;
  let n = 0;
  for (const a of avaliados) {
    if (a.nota == null) continue;
    soma += a.nota; n++;
    const r = info.get(K(a.tipo, a.id)) || {};
    for (const x of (r.generos || [])) { const e = g.get(x) || { s: 0, n: 0 }; e.s += a.nota; e.n++; g.set(x, e); }
    for (const x of (r.diretores || [])) { const e = dir.get(x.id) || { s: 0, n: 0, nome: x.nome }; e.s += a.nota; e.n++; dir.set(x.id, e); }
  }
  return { g, dir, media: n ? soma / n : 7 };
}

/** O quanto um título deve agradar a pessoa (0 a 10), pelos gêneros e pelo diretor. Devolve também o motivo. */
function afinidade(r, gostoDela) {
  const notas = (r.generos || []).map((x) => gostoDela.g.get(x)).filter((e) => e && e.n >= 3).map((e) => e.s / e.n);
  let pontos = notas.length ? notas.reduce((a, b) => a + b, 0) / notas.length : gostoDela.media;
  let motivo = '';
  const melhor = (r.generos || []).map((x) => [x, gostoDela.g.get(x)]).filter(([, e]) => e && e.n >= 5).sort((a, b) => b[1].s / b[1].n - a[1].s / a[1].n)[0];
  if (melhor) motivo = `gosta de ${melhor[0].toLowerCase()}`;
  for (const d of (r.diretores || [])) {
    const e = gostoDela.dir.get(d.id);
    if (e && e.n >= 2) { pontos += (e.s / e.n - gostoDela.media) * 0.6; if (e.s / e.n >= 7.5) motivo = `gosta de ${e.nome}`; }
  }
  return { pontos, motivo };
}

export function esquecer() { guardado = null; }

/** { porcento, itens: [{ tipo, id, titulo, ..., grupo: 1|2|3, motivo }] } */
export async function montar() {
  if (guardado && Date.now() - guardado.quando < 30 * 60e3) return guardado.resultado;
  const o = nuvem.outro();
  const meusVistos = dados.todos().filter((t) => t.visto || t.nota != null);
  const deleVistos = social.todosDoOutro().filter((t) => t.visto || t.nota != null);
  const minhaLista = dados.todos().filter((t) => t.quero).map((t) => ({ tipo: t.tipo, tmdb_id: t.id }));
  const listaDele = social.queroDoOutro();
  const info = await dados.resumos([...meusVistos.map((t) => ({ tipo: t.tipo, tmdb_id: t.id })), ...deleVistos.map((t) => ({ tipo: t.tipo, tmdb_id: t.id })), ...minhaLista, ...listaDele]);
  const meuGosto = gosto(meusVistos, info);
  const gostoDele = gosto(deleVistos, info);
  const vi = (tipo, id) => dados.titulo(tipo, id).visto;
  const eleViu = (tipo, id) => social.doOutro(tipo, id)?.visto;
  const cartao = (tipo, id, extra) => {
    const r = info.get(K(tipo, id)) || {};
    return { tipo, id, titulo: r.titulo || 'Sem título', ano: r.ano ?? null, data: r.data || '', poster: r.poster || '', duracao: r.duracao || 0, generos: r.generos || [], tmdb: r.nota || 0, pop: r.pop || 0, ...extra };
  };

  const naMinha = new Set(minhaLista.map((p) => K(p.tipo, p.tmdb_id)));
  const naDele = new Set(listaDele.map((p) => K(p.tipo, p.tmdb_id)));
  const itens = [];

  // (1) nas duas listas, do mais bem avaliado para baixo
  const juntos = new Set(social.listaJuntos().map((j) => K(j.tipo, j.tmdb_id)));
  for (const p of minhaLista) {
    const k = K(p.tipo, p.tmdb_id);
    if (naDele.has(k)) itens.push(cartao(p.tipo, p.tmdb_id, { grupo: 1, motivo: juntos.has(k) ? 'na lista "juntos"' : 'nas duas listas', ordem: (juntos.has(k) ? 100 : 0) + (info.get(k)?.nota || 0) }));
  }
  // (2) na lista de um, combinando com o gosto do outro
  const segundo = [];
  for (const p of minhaLista) {
    const k = K(p.tipo, p.tmdb_id);
    if (naDele.has(k) || eleViu(p.tipo, p.tmdb_id)) continue;
    const a = afinidade(info.get(k) || {}, gostoDele);
    if (a.pontos >= gostoDele.media) segundo.push(cartao(p.tipo, p.tmdb_id, { grupo: 2, motivo: `da sua lista · ${o?.nome || 'o outro'} ${a.motivo || 'deve gostar'}`, ordem: a.pontos }));
  }
  for (const p of listaDele) {
    const k = K(p.tipo, p.tmdb_id);
    if (naMinha.has(k) || vi(p.tipo, p.tmdb_id)) continue;
    const a = afinidade(info.get(k) || {}, meuGosto);
    if (a.pontos >= meuGosto.media) segundo.push(cartao(p.tipo, p.tmdb_id, { grupo: 2, motivo: `da lista de ${o?.nome || 'o outro'} · você ${a.motivo || 'deve gostar'}`, ordem: a.pontos }));
  }
  // intercala: um da sua lista, um da dele, sempre os de maior afinidade
  segundo.sort((a, b) => b.ordem - a.ordem);
  const daMinha = segundo.filter((x) => x.motivo.startsWith('da sua'));
  const daDele = segundo.filter((x) => !x.motivo.startsWith('da sua'));
  const intercalado = [];
  for (let i = 0; i < 20; i++) { if (daMinha[i]) intercalado.push(daMinha[i]); if (daDele[i]) intercalado.push(daDele[i]); }

  // (3) sugestões do TMDB a partir dos favoritos dos dois
  const terceiro = [];
  try {
    const b = nuvem.banco();
    const favDele = o ? (await b.from('favoritos').select('tipo, tmdb_id').eq('user_id', o.id)).data || [] : [];
    const bases = [...dados.favoritos().map((f) => ({ tipo: f.tipo, id: f.id })), ...favDele.map((f) => ({ tipo: f.tipo, id: f.tmdb_id }))].filter((f) => f.tipo === 'filme').slice(0, 8);
    const votos = new Map();
    await Promise.all(bases.map(async (f) => {
      const ficha = await tmdb.filme(f.id);
      for (const c of ficha.parecidos) {
        const k = K(c.tipo, c.id);
        if (vi(c.tipo, c.id) || eleViu(c.tipo, c.id) || naMinha.has(k) || naDele.has(k)) continue;
        const e = votos.get(k) || { c, n: 0, de: ficha.titulo };
        e.n++;
        votos.set(k, e);
      }
    }));
    for (const e of [...votos.values()].sort((a, b) => b.n - a.n || tmdb.pesoNota(b.c) - tmdb.pesoNota(a.c)).slice(0, 12)) {
      terceiro.push({ tipo: e.c.tipo, id: e.c.id, titulo: e.c.titulo, ano: e.c.ano, data: e.c.data, poster: e.c.poster, duracao: 0, generos: [], tmdb: e.c.nota, pop: e.c.pop, grupo: 3, motivo: `parecido com ${e.de}`, ordem: e.n });
    }
  } catch { /* sem internet: fica sem as sugestões */ }

  itens.sort((a, b) => b.ordem - a.ordem);
  const resultado = { porcento: social.compatibilidade()?.porcento ?? null, itens: [...itens, ...intercalado, ...terceiro] };
  guardado = { quando: Date.now(), resultado };
  return resultado;
}
