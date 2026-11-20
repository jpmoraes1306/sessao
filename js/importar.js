// Grava na conta o que veio do export do Letterboxd, já casado com o TMDB.
// Pode rodar de novo com um export mais novo: nada duplica (o diário casa por filme + data).
import * as tmdb from './tmdb.js';
import * as nuvem from './nuvem.js';

const BIBLIOTECA_ZIP = 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm';

/** Abre o .zip do Letterboxd no próprio navegador e devolve { 'watched.csv': texto, ... }. */
export async function abrirZip(arquivo) {
  const { default: JSZip } = await import(BIBLIOTECA_ZIP);
  const zip = await JSZip.loadAsync(arquivo);
  const saida = {};
  for (const [caminho, item] of Object.entries(zip.files)) {
    if (item.dir || !caminho.endsWith('.csv') || /^(deleted|orphaned)\//.test(caminho)) continue;
    saida[caminho] = await item.async('string');
  }
  if (!saida['watched.csv'] && !saida['diary.csv'] && !saida['watchlist.csv']) throw new Error('Este .zip não parece ser um export do Letterboxd.');
  return saida;
}

async function emLotes(linhas, tamanho, fn) {
  for (let i = 0; i < linhas.length; i += tamanho) {
    const { error } = await fn(linhas.slice(i, i + tamanho));
    if (error) throw new Error(error.message);
  }
}

/**
 * exp: resultado de letterboxd.lerExport; escolhas: Map "Nome|Ano" -> { tipo, id } (ou null se a pessoa pulou).
 * aoAvancar(etapa, feito, total) atualiza a barra de progresso.
 */
export async function gravar(exp, escolhas, aoAvancar = () => {}, dono = null) {
  const b = nuvem.banco();
  // dono: perfil que vai receber o histórico (o seu, ou o do outro enquanto ele ainda não entrou)
  const user = dono || nuvem.usuario()?.id;
  if (!b || !nuvem.usuario()) throw new Error('Entre na sua conta antes de importar.');
  const alvo = (chave) => escolhas.get(chave) || null;
  const par = (t) => ({ tipo: t.tipo, tmdb_id: t.id });

  /* 1) resumo de cada título (diretor, elenco, duração...) no cache do banco */
  const unicos = new Map();
  for (const f of exp.filmes) { const t = alvo(f.chave); if (t) unicos.set(`${t.tipo}:${t.id}`, t); }
  const lista = [...unicos.values()];
  const resumos = [];
  const fracos = []; // o TMDB não respondeu: resumo reduzido, que não pode cobrir um resumo completo já guardado
  let proximo = 0;
  let feitos = 0;
  await Promise.all(Array.from({ length: 8 }, async () => {
    while (proximo < lista.length) {
      const t = lista[proximo++];
      try { resumos.push({ ...par(t), resumo: await tmdb.resumo(t.tipo, t.id), buscado_em: new Date().toISOString() }); } catch {
        fracos.push({ ...par(t), resumo: { titulo: t.titulo, ano: t.ano ?? null, data: t.data || '', poster: t.poster || '', nota: t.nota || 0, pop: t.pop || 0 }, buscado_em: new Date().toISOString() });
      }
      aoAvancar('Buscando os dados de cada título', ++feitos, lista.length);
    }
  }));
  aoAvancar('Gravando na sua conta', 0, 6);
  await emLotes(resumos, 200, (l) => b.from('cache_titulos').upsert(l, { onConflict: 'tipo,tmdb_id' }));
  await emLotes(fracos, 200, (l) => b.from('cache_titulos').upsert(l, { onConflict: 'tipo,tmdb_id', ignoreDuplicates: true }));

  /* 2) estado de cada título: visto, nota atual, curtido */
  const estado = new Map();
  const de = (chave) => {
    const t = alvo(chave);
    if (!t) return null;
    const k = `${t.tipo}:${t.id}`;
    if (!estado.has(k)) estado.set(k, { user_id: user, ...par(t), visto: true, nota: null, curtido: false, atualizado_em: '1970-01-01' });
    return estado.get(k);
  };
  const maisNovo = (e, data) => { if (data && data > e.atualizado_em) e.atualizado_em = data; };
  for (const v of exp.vistos) { const e = de(v.filme); if (e) maisNovo(e, v.data); }
  for (const n of [...exp.notas].sort((x, y) => x.data.localeCompare(y.data))) { const e = de(n.filme); if (e) { e.nota = n.nota; maisNovo(e, n.data); } }
  for (const dia of exp.diario) { const e = de(dia.filme); if (e) maisNovo(e, dia.data); }
  for (const c of exp.curtidos) { const e = de(c.filme); if (e) { e.curtido = true; maisNovo(e, c.data); } }
  // Segundo import (ou import depois de já usar o app): o que está na conta vale. O Letterboxd só completa
  // o que falta, para não trocar uma nota mudada no app nem tirar um "curtido" dado aqui.
  const jaNaConta = new Map();
  for (let i = 0; ; i += 1000) {
    const { data, error } = await b.from('avaliacoes').select('tipo, tmdb_id, nota, curtido, atualizado_em').eq('user_id', user).order('tipo').order('tmdb_id').range(i, i + 999);
    if (error) throw new Error(error.message);
    for (const a of data) jaNaConta.set(`${a.tipo}:${a.tmdb_id}`, a);
    if (data.length < 1000) break;
  }
  const avaliacoes = [...estado.values()].map((e) => {
    const ja = jaNaConta.get(`${e.tipo}:${e.tmdb_id}`);
    const em = e.atualizado_em === '1970-01-01' ? new Date().toISOString() : `${e.atualizado_em}T12:00:00Z`;
    return ja ? { ...e, nota: ja.nota ?? e.nota, curtido: ja.curtido || e.curtido, atualizado_em: ja.atualizado_em || em } : { ...e, atualizado_em: em };
  });
  // quem não tem nota no Letterboxd vai sem a coluna "nota", para não apagar uma nota já dada no app
  await emLotes(avaliacoes.filter((a) => a.nota != null), 500, (l) => b.from('avaliacoes').upsert(l));
  await emLotes(avaliacoes.filter((a) => a.nota == null).map(({ nota, ...resto }) => resto), 500, (l) => b.from('avaliacoes').upsert(l));
  aoAvancar('Gravando na sua conta', 1, 6);

  /* 3) diário: cada vez que assistiu */
  const diario = new Map();
  for (const dia of exp.diario) {
    const t = alvo(dia.filme);
    if (!t || !dia.data) continue;
    diario.set(`${t.tipo}:${t.id}:${dia.data}`, { user_id: user, ...par(t), data: dia.data, nota: dia.nota, revisto: dia.revisto, origem: 'letterboxd' });
  }
  await emLotes([...diario.values()], 500, (l) => b.from('diario').upsert(l, { onConflict: 'user_id,tipo,tmdb_id,data' }));
  aoAvancar('Gravando na sua conta', 2, 6);

  /* 4) quero ver */
  const quero = new Map();
  for (const q of exp.queroVer) {
    const t = alvo(q.filme);
    if (t && !estado.has(`${t.tipo}:${t.id}`)) quero.set(`${t.tipo}:${t.id}`, { user_id: user, ...par(t), juntos: false, adicionado_em: q.data ? `${q.data}T12:00:00Z` : new Date().toISOString() });
  }
  await emLotes([...quero.values()], 500, (l) => b.from('quero_ver').upsert(l));
  aoAvancar('Gravando na sua conta', 3, 6);

  /* 5) favoritos do perfil */
  // só quando a conta ainda não tem favoritos: os escolhidos no app não são trocados pelos do Letterboxd
  const favoritos = exp.favoritos.map(alvo).filter(Boolean).slice(0, 4).map((t, i) => ({ user_id: user, posicao: i + 1, ...par(t) }));
  const { count: favoritosNaConta } = await b.from('favoritos').select('posicao', { count: 'exact', head: true }).eq('user_id', user);
  if (favoritos.length && !favoritosNaConta) await emLotes(favoritos, 10, (l) => b.from('favoritos').upsert(l));
  aoAvancar('Gravando na sua conta', 4, 6);

  /* 6) listas (os rankings por diretor entram com a ordem) */
  let listasGravadas = 0;
  for (const l of exp.listas) {
    const itens = l.itens.map((i) => ({ ...i, t: alvo(i.filme) })).filter((i) => i.t);
    if (!itens.length) continue;
    const { data, error } = await b.from('listas').upsert({ user_id: user, nome: l.nome.trim(), descricao: l.descricao || '', ranqueada: l.ranqueada, origem: 'letterboxd' }, { onConflict: 'user_id,nome' }).select('id').single();
    if (error) throw new Error(error.message);
    await b.from('lista_itens').delete().eq('lista_id', data.id);
    await emLotes(itens.map((i, n) => ({ lista_id: data.id, posicao: i.posicao || n + 1, ...par(i.t), comentario: i.comentario || '' })), 500, (lote) => b.from('lista_itens').upsert(lote));
    listasGravadas++;
  }
  aoAvancar('Gravando na sua conta', 5, 6);

  /* 7) o que ficou sem casar vai para a lista de pendências, para resolver depois */
  // (título sem ano não é barrado pela regra de "único" do banco, então confere antes para não repetir a cada import)
  const { data: jaPendentes } = await b.from('import_pendencias').select('nome, ano').eq('user_id', user);
  const repetida = new Set((jaPendentes || []).map((x) => `${x.nome}|${x.ano ?? ''}`));
  const pendentes = exp.filmes.filter((f) => !alvo(f.chave) && !repetida.has(`${f.nome}|${f.ano ?? ''}`)).map((f) => ({ user_id: user, nome: f.nome, ano: f.ano, dados: { uri: f.uri }, resolvido: false }));
  if (pendentes.length) await emLotes(pendentes, 200, (l) => b.from('import_pendencias').upsert(l, { onConflict: 'user_id,nome,ano', ignoreDuplicates: true }));
  aoAvancar('Gravando na sua conta', 6, 6);

  return {
    titulos: lista.length, vistos: avaliacoes.length, comNota: avaliacoes.filter((a) => a.nota != null).length,
    diario: diario.size, quero: quero.size, curtidos: avaliacoes.filter((a) => a.curtido).length,
    favoritos: favoritos.length, listas: listasGravadas, pendentes: pendentes.length,
  };
}
