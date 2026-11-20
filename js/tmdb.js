// Cliente do TMDB. Regras do projeto:
// - títulos sempre em inglês (language=en-US); o título brasileiro e a sinopse em português
//   vêm de "translations" na mesma chamada, sem gastar uma consulta a mais;
// - tudo que é buscado fica no cache local com prazo de validade.
import { chave } from './config.js';
import { ler, gravar, DIA, HORA } from './cache.js';

const BASE = 'https://api.themoviedb.org/3/';
export const img = (caminho, tam) => (caminho ? `https://image.tmdb.org/t/p/${tam}${caminho}` : '');

export class ErroApi extends Error {
  constructor(msg, status) { super(msg); this.status = status; }
}

const emCurso = new Map();

async function api(caminho, params = {}, { ttl = DIA, fresco = false, guardar = true } = {}) {
  const qs = new URLSearchParams(Object.entries(params).sort(([a], [b]) => a.localeCompare(b))).toString();
  const k = `tmdb:${caminho}?${qs}`;
  const salvo = await ler(k);
  if (salvo && !fresco && Date.now() - salvo.t < ttl) return salvo.v;
  if (emCurso.has(k)) return emCurso.get(k);
  const pedido = (async () => {
    try {
      if (!chave('tmdb')) throw new ErroApi('Falta a chave do TMDB', 401);
      const r = await fetch(`${BASE}${caminho}?${qs}&api_key=${encodeURIComponent(chave('tmdb'))}`);
      if (!r.ok) throw new ErroApi(`TMDB respondeu ${r.status}`, r.status);
      const j = await r.json();
      if (guardar) gravar(k, j);
      return j;
    } catch (erro) {
      // sem internet (ou TMDB fora do ar): usa o que já estava salvo, mesmo vencido
      if (salvo && !(erro instanceof ErroApi && (erro.status === 401 || erro.status === 404))) return salvo.v;
      throw erro;
    } finally {
      emCurso.delete(k);
    }
  })();
  emCurso.set(k, pedido);
  return pedido;
}

/* ---------- vocabulário em português ---------- */
const GENEROS = {
  28: 'Ação', 12: 'Aventura', 16: 'Animação', 35: 'Comédia', 80: 'Crime', 99: 'Documentário', 18: 'Drama',
  10751: 'Família', 14: 'Fantasia', 36: 'História', 27: 'Terror', 10402: 'Música', 9648: 'Mistério',
  10749: 'Romance', 878: 'Ficção científica', 10770: 'Filme para TV', 53: 'Suspense', 10752: 'Guerra', 37: 'Faroeste',
  10759: 'Ação e aventura', 10762: 'Infantil', 10763: 'Notícias', 10764: 'Reality', 10765: 'Ficção científica e fantasia',
  10766: 'Novela', 10767: 'Talk show', 10768: 'Guerra e política',
};
const STATUS_SERIE = {
  'Returning Series': 'Em exibição', Ended: 'Encerrada', Canceled: 'Cancelada',
  'In Production': 'Em produção', Planned: 'Anunciada', Pilot: 'Piloto',
};
const DEPTOS = {
  Acting: 'Atuação', Directing: 'Direção', Writing: 'Roteiro', Production: 'Produção', Creator: 'Criação',
  Sound: 'Som e música', Camera: 'Fotografia', Editing: 'Montagem', Art: 'Arte', 'Costume & Make-Up': 'Figurino e maquiagem',
  'Visual Effects': 'Efeitos visuais', Lighting: 'Iluminação', Crew: 'Equipe',
};
export const depto = (d) => DEPTOS[d] || d || '';

/* ---------- formatos comuns ---------- */
function cartao(x, tipoPadrao) {
  const tipo = x.media_type === 'tv' ? 'serie' : x.media_type === 'movie' ? 'filme' : tipoPadrao;
  const data = (tipo === 'serie' ? x.first_air_date : x.release_date) || '';
  return {
    tipo, id: x.id,
    titulo: (tipo === 'serie' ? x.name : x.title) || '',
    original: (tipo === 'serie' ? x.original_name : x.original_title) || '',
    idioma: x.original_language || '',
    ano: data ? Number(data.slice(0, 4)) : null, data,
    poster: x.poster_path || '', fundo: x.backdrop_path || '',
    nota: x.vote_average || 0, votos: x.vote_count || 0, pop: x.popularity || 0,
    generos: x.genre_ids || [],
  };
}

/** Nota ponderada: evita que um filme com 3 votos e nota 10 passe na frente de um clássico. */
export const pesoNota = (c) => (c.votos / (c.votos + 150)) * c.nota + (150 / (c.votos + 150)) * 6.2;

const traducao = (d, lingua, pais) =>
  d.translations?.translations?.find((t) => t.iso_639_1 === lingua && (!pais || t.iso_3166_1 === pais))?.data || {};

function textoPt(d, campo) {
  const br = traducao(d, 'pt', 'BR')[campo];
  if (br) return { texto: br, idioma: 'pt' };
  const pt = traducao(d, 'pt')[campo];
  if (pt) return { texto: pt, idioma: 'pt' };
  return { texto: d[campo] || '', idioma: 'en' };
}

function provedoresBR(d) {
  const br = d['watch/providers']?.results?.BR;
  if (!br) return null;
  const arruma = (l) => (l || []).map((p) => ({ id: p.provider_id, nome: p.provider_name, logo: p.logo_path, ordem: p.display_priority }));
  // "free" e "ads" entram junto com o streaming por assinatura, sem repetir provedor
  const stream = [...arruma(br.flatrate), ...arruma(br.free), ...arruma(br.ads)].filter((p, i, l) => l.findIndex((q) => q.id === p.id) === i);
  const alugar = arruma(br.rent);
  const comprar = arruma(br.buy).filter((p) => !alugar.some((q) => q.id === p.id));
  return { stream, alugar, comprar };
}

const reviews = (d) => (d.reviews?.results || []).map((r) => ({
  autor: r.author || r.author_details?.username || 'anônimo',
  nota: r.author_details?.rating ?? null, // já vem de 0 a 10
  texto: (r.content || '').trim(),
  data: (r.created_at || '').slice(0, 10),
}));

/* ---------- busca ---------- */
const semAcento = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const ROTAS = { tudo: 'search/multi', filme: 'search/movie', serie: 'search/tv', pessoa: 'search/person' };
const MIDIA = { filme: 'movie', serie: 'tv', pessoa: 'person' };

/** tipo: 'tudo' | 'filme' | 'serie' | 'pessoa'. Cada tipo usa a busca própria do TMDB (mais resultados). */
export async function buscar(q, tipo = 'tudo') {
  const base = { query: q, include_adult: 'false', page: 1 };
  // duas buscas: em inglês (títulos como aparecem no app) e em português (acha "a chegada", "incendios"...)
  const linguas = tipo === 'pessoa' ? ['en-US'] : ['en-US', 'pt-BR'];
  const [en, pt] = await Promise.all(linguas.map((language) => api(ROTAS[tipo], { ...base, language }, { ttl: DIA })));
  const mapa = new Map();
  for (const [lista, lingua] of [[en, 'en'], [pt, 'pt']]) {
    (lista?.results || []).forEach((x, i) => {
      if (MIDIA[tipo]) x = { ...x, media_type: MIDIA[tipo] };
      if (!['movie', 'tv', 'person'].includes(x.media_type)) return;
      const k = `${x.media_type}:${x.id}`;
      const it = mapa.get(k) || { pos: i };
      it.pos = Math.min(it.pos, i);
      it[lingua] = x;
      mapa.set(k, it);
    });
  }
  // Ordem: a posição que o TMDB deu, corrigida por (1) nome que bate exatamente com o que foi digitado
  // e (2) o quanto o título é conhecido (votos) ou a pessoa é popular. Assim "dark" traz Dark (2017)
  // antes de séries antigas pouco vistas.
  const alvo = semAcento(q);
  const pontos = (it) => {
    const nomes = [it.en, it.pt].filter(Boolean).flatMap((x) => [x.title, x.name, x.original_title, x.original_name]).filter(Boolean).map(semAcento);
    const bate = nomes.includes(alvo) ? 12 : nomes.some((n) => n.startsWith(alvo)) ? 3 : 0;
    const x = it.en || it.pt;
    const fama = x.media_type === 'person' ? Math.log10((x.popularity || 0) + 1) * 4 : Math.log10((x.vote_count || 0) + 1) * 3;
    return it.pos - bate - fama;
  };
  const itens = [...mapa.values()].filter((it) => !(it.en || it.pt).adult).sort((a, b) => pontos(a) - pontos(b));

  let faltaTitulo = 0;
  const saida = await Promise.all(itens.map(async (it) => {
    const x = it.en || it.pt;
    if (x.media_type === 'person') return cartaoPessoa(x);
    const c = cartao(x);
    const br = it.pt ? (it.pt.title || it.pt.name) : '';
    if (!it.en) {
      // só apareceu na busca em português: descobrir o título em inglês
      if (c.idioma === 'en') c.titulo = c.original;
      else if (faltaTitulo++ < 6) {
        try {
          const d = await api(`${c.tipo === 'serie' ? 'tv' : 'movie'}/${c.id}`, { language: 'en-US' }, { ttl: 30 * DIA });
          c.titulo = d.title || d.name || c.original;
        } catch { c.titulo = c.original; }
      } else c.titulo = c.original;
    }
    c.tituloBR = br && br !== c.titulo ? br : '';
    return c;
  }));
  return saida;
}

const cartaoPessoa = (x) => ({
  tipo: 'pessoa', id: x.id, nome: x.name, foto: x.profile_path || '', depto: depto(x.known_for_department),
  conhecido: (x.known_for || []).map((k) => k.title || k.name).filter(Boolean).slice(0, 2),
});
/* ---------- filme ---------- */
export async function filme(id, opc = {}) {
  const d = await api(`movie/${id}`, {
    language: 'en-US',
    append_to_response: 'credits,release_dates,recommendations,watch/providers,reviews,external_ids,translations,alternative_titles',
  }, { ttl: 7 * DIA, ...opc });

  const br = d.release_dates?.results?.find((r) => r.iso_3166_1 === 'BR')?.release_dates || [];
  const estreiaBR = [3, 2, 4, 1, 5, 6].map((t) => br.find((r) => r.type === t)).find(Boolean) || br[0];
  const classificacao = br.map((r) => r.certification).find(Boolean) || '';
  const tituloBR = traducao(d, 'pt', 'BR').title || d.alternative_titles?.titles?.find((t) => t.iso_3166_1 === 'BR')?.title || '';
  const sinopse = textoPt(d, 'overview');
  const data = d.release_date || '';
  return {
    tipo: 'filme', id: d.id,
    titulo: d.title, original: d.original_title, idioma: d.original_language,
    tituloBR: tituloBR && tituloBR !== d.title ? tituloBR : '',
    frase: textoPt(d, 'tagline').texto,
    sinopse: sinopse.texto, sinopseIdioma: sinopse.idioma,
    ano: data ? Number(data.slice(0, 4)) : null, data,
    estreiaBR: estreiaBR?.release_date?.slice(0, 10) || '',
    classificacao, duracao: d.runtime || 0, status: d.status,
    generos: (d.genres || []).map((g) => GENEROS[g.id] || g.name),
    poster: d.poster_path || '', fundo: d.backdrop_path || '',
    imdbId: d.imdb_id || d.external_ids?.imdb_id || '',
    nota: d.vote_average || 0, votos: d.vote_count || 0, pop: d.popularity || 0,
    orcamento: d.budget || 0, bilheteria: d.revenue || 0,
    diretores: (d.credits?.crew || []).filter((c) => c.job === 'Director').map((c) => ({ id: c.id, nome: c.name, foto: c.profile_path || '' })),
    elenco: (d.credits?.cast || []).slice(0, 18).map((c) => ({ id: c.id, nome: c.name, foto: c.profile_path || '', papel: c.character || '' })),
    parecidos: (d.recommendations?.results || []).map((x) => cartao(x, 'filme')).filter((c) => c.poster).slice(0, 14),
    provedores: provedoresBR(d),
    reviews: reviews(d),
  };
}

/** Todas as reviews da comunidade de um título. O TMDB separa por idioma, então são duas buscas
    (português e inglês) juntadas numa lista só: [{ id, idioma: 'pt' | 'en', autor, nota, texto, data }]. */
export async function reviewsTodas(tipo, id) {
  const caminho = `${tipo === 'serie' ? 'tv' : 'movie'}/${id}/reviews`;
  const doIdioma = async (language, idioma) => {
    const saida = [];
    for (let page = 1; page <= 3; page++) {
      const d = await api(caminho, { language, page }, { ttl: DIA });
      saida.push(...(d.results || []).map((r) => ({
        id: r.id, idioma,
        autor: r.author_details?.name || r.author || r.author_details?.username || 'anônimo',
        nota: r.author_details?.rating ?? null, // já vem de 0 a 10
        texto: (r.content || '').replace(/\r/g, '').trim(),
        data: (r.created_at || '').slice(0, 10),
      })));
      if (page >= (d.total_pages || 1)) break;
    }
    return saida;
  };
  const [pt, en] = await Promise.all([doIdioma('pt-BR', 'pt').catch(() => []), doIdioma('en-US', 'en')]);
  const vistas = new Set();
  return [...pt, ...en].filter((r) => r.texto && !vistas.has(r.id) && vistas.add(r.id));
}

/** Cenas de um filme (imagens largas, sem título escrito), para o frame do dia. */
export async function cenasDoFilme(id) {
  const d = await api(`movie/${id}/images`, { include_image_language: 'null' }, { ttl: 30 * DIA });
  return (d.backdrops || []).filter((b) => b.aspect_ratio > 1.7 && b.aspect_ratio < 1.85 && b.width >= 1280).map((b) => b.file_path);
}

/** Filmes dirigidos pela pessoa, da maior nota para a menor. */
export async function filmesDoDiretor(pessoaId) {
  const d = await api(`person/${pessoaId}/movie_credits`, { language: 'en-US' }, { ttl: 7 * DIA });
  const vistos = new Set();
  return (d.crew || []).filter((c) => c.job === 'Director' && !vistos.has(c.id) && vistos.add(c.id))
    .map((c) => cartao(c, 'filme')).filter((c) => c.votos >= 20)
    .sort((a, b) => pesoNota(b) - pesoNota(a));
}

/* ---------- série ---------- */
export async function serie(id, opc = {}) {
  const d = await api(`tv/${id}`, {
    language: 'en-US',
    append_to_response: 'aggregate_credits,recommendations,watch/providers,external_ids,translations,content_ratings,reviews',
  }, { ttl: HORA, ...opc });

  const nomeBR = traducao(d, 'pt', 'BR').name || '';
  const sinopse = textoPt(d, 'overview');
  const ep = (e) => (e ? { t: e.season_number, e: e.episode_number, data: e.air_date || '', nome: e.name || '', duracao: e.runtime || 0 } : null);
  const acabou = d.status === 'Ended' || d.status === 'Canceled';
  const ultimo = ep(d.last_episode_to_air);
  const temporadas = (d.seasons || []).map((s) => ({
    n: s.season_number,
    nome: s.season_number === 0 ? 'Especiais' : `Temporada ${s.season_number}`,
    apelido: /^(season \d+|specials)$/i.test(s.name || '') ? '' : (s.name || ''),
    episodios: s.episode_count || 0, data: s.air_date || '', poster: s.poster_path || '', nota: s.vote_average || 0,
  })).sort((a, b) => (a.n === 0) - (b.n === 0) || a.n - b.n);
  const inicio = d.first_air_date || '';
  return {
    tipo: 'serie', id: d.id,
    titulo: d.name, original: d.original_name, idioma: d.original_language,
    tituloBR: nomeBR && nomeBR !== d.name ? nomeBR : '',
    frase: textoPt(d, 'tagline').texto,
    sinopse: sinopse.texto, sinopseIdioma: sinopse.idioma,
    ano: inicio ? Number(inicio.slice(0, 4)) : null, data: inicio,
    anoFim: acabou && d.last_air_date ? Number(d.last_air_date.slice(0, 4)) : null,
    status: STATUS_SERIE[d.status] || d.status || '', acabou, emExibicao: d.status === 'Returning Series' || d.in_production === true,
    classificacao: d.content_ratings?.results?.find((r) => r.iso_3166_1 === 'BR')?.rating || '',
    duracao: d.episode_run_time?.[0] || 0,
    generos: (d.genres || []).map((g) => GENEROS[g.id] || g.name),
    emissoras: (d.networks || []).map((n) => n.name),
    criadores: (d.created_by || []).map((c) => ({ id: c.id, nome: c.name, foto: c.profile_path || '' })),
    poster: d.poster_path || '', fundo: d.backdrop_path || '',
    imdbId: d.external_ids?.imdb_id || '',
    nota: d.vote_average || 0, votos: d.vote_count || 0, pop: d.popularity || 0,
    temporadas, ultimo, proximo: ep(d.next_episode_to_air),
    totalEpisodios: d.number_of_episodes || 0,
    elenco: (d.aggregate_credits?.cast || []).slice(0, 18).map((c) => ({
      id: c.id, nome: c.name, foto: c.profile_path || '', papel: c.roles?.[0]?.character || '', eps: c.total_episode_count || 0,
    })),
    parecidos: (d.recommendations?.results || []).map((x) => cartao(x, 'serie')).filter((c) => c.poster).slice(0, 14),
    provedores: provedoresBR(d),
    reviews: reviews(d),
  };
}

/** Episódios de uma temporada: nomes em inglês, sinopses em português quando existirem. */
export async function temporada(serieId, n, { recente = false, fresco = false } = {}) {
  const opc = { ttl: recente ? HORA : 7 * DIA, fresco };
  const [en, pt] = await Promise.all([
    api(`tv/${serieId}/season/${n}`, { language: 'en-US' }, opc),
    api(`tv/${serieId}/season/${n}`, { language: 'pt-BR' }, opc).catch(() => null),
  ]);
  const sinopsePt = new Map((pt?.episodes || []).map((e) => [e.episode_number, e.overview]));
  return {
    n: en.season_number, sinopse: pt?.overview || en.overview || '',
    episodios: (en.episodes || []).map((e) => ({
      n: e.episode_number, nome: e.name || `Episódio ${e.episode_number}`, data: e.air_date || '',
      duracao: e.runtime || 0, nota: e.vote_average || 0, votos: e.vote_count || 0, still: e.still_path || '',
      sinopse: sinopsePt.get(e.episode_number) || e.overview || '',
      final: e.episode_type === 'finale',
    })),
  };
}

/* ---------- pessoa ---------- */
const NAO_E_PAPEL = /^(self|himself|herself|themselves)\b|archive footage/i;
const SEM_ROTEIRO = new Set([10767, 10763]); // talk shows e noticiários

export async function pessoa(id) {
  const d = await api(`person/${id}`, { language: 'en-US', append_to_response: 'combined_credits,translations' }, { ttl: 7 * DIA });
  const bio = textoPt(d, 'biography');
  const mapa = new Map(); // "filme:123" -> cartão com as categorias em que a pessoa trabalhou
  const soma = (x, categoria, extra) => {
    if (!x.media_type) return;
    const c = cartao(x);
    const k = `${c.tipo}:${c.id}`;
    const it = mapa.get(k) || { ...c, categorias: {} };
    it.categorias[categoria] = it.categorias[categoria] || extra || '';
    mapa.set(k, it);
  };
  const atuacoes = (d.combined_credits?.cast || []);
  const comPapel = atuacoes.filter((x) => !NAO_E_PAPEL.test(x.character || '') && !(x.genre_ids || []).some((g) => SEM_ROTEIRO.has(g)));
  for (const x of (comPapel.length >= 3 ? comPapel : atuacoes)) soma(x, 'Atuação', x.character);
  for (const x of (d.combined_credits?.crew || [])) {
    const categoria = x.department === 'Directing' && x.job !== 'Director' ? 'Equipe de direção' : depto(x.department);
    soma(x, categoria, x.job);
  }
  return {
    id: d.id, nome: d.name, foto: d.profile_path || '',
    depto: depto(d.known_for_department),
    bio: bio.texto.trim(), bioIdioma: bio.idioma,
    nascimento: d.birthday || '', morte: d.deathday || '', local: d.place_of_birth || '',
    creditos: [...mapa.values()],
  };
}

/* ---------- vitrines do início ---------- */
const hoje = () => new Date().toLocaleDateString('sv-SE'); // AAAA-MM-DD no fuso do aparelho

export async function emCartaz() {
  const d = await api('movie/now_playing', { language: 'en-US', region: 'BR', page: 1 }, { ttl: 12 * HORA });
  return d.results.map((x) => cartao(x, 'filme')).filter((c) => c.poster);
}

export async function estreias() {
  const paginas = await Promise.all([1, 2].map((page) => api('movie/upcoming', { language: 'en-US', region: 'BR', page }, { ttl: 12 * HORA }).catch(() => ({ results: [] }))));
  const vistos = new Set();
  return paginas.flatMap((p) => p.results).map((x) => cartao(x, 'filme'))
    .filter((c) => c.data > hoje() && !vistos.has(c.id) && vistos.add(c.id))
    .sort((a, b) => a.data.localeCompare(b.data) || b.pop - a.pop);
}

/** Filmes com estreia nos cinemas do Brasil entre duas datas (para o calendário). */
export async function estreiasEntre(inicio, fim) {
  const paginas = await Promise.all([1, 2].map((page) => api('discover/movie', {
    language: 'en-US', region: 'BR', with_release_type: '2|3', 'release_date.gte': inicio, 'release_date.lte': fim, sort_by: 'popularity.desc', page,
  }, { ttl: 12 * HORA }).catch(() => ({ results: [] }))));
  const vistos = new Set();
  return paginas.flatMap((p) => p.results).map((x) => cartao(x, 'filme'))
    .filter((c) => c.poster && c.data >= inicio && c.data <= fim && !vistos.has(c.id) && vistos.add(c.id))
    .sort((a, b) => a.data.localeCompare(b.data) || b.pop - a.pop);
}

export async function emAlta(tipo) {
  const d = await api(`trending/${tipo === 'serie' ? 'tv' : 'movie'}/week`, { language: 'en-US' }, { ttl: 12 * HORA });
  return d.results.map((x) => cartao(x, tipo)).filter((c) => c.poster);
}

export async function pessoasEmAlta() {
  const d = await api('trending/person/week', { language: 'en-US' }, { ttl: 12 * HORA });
  // só gente conhecida por algum título com bastante voto (tira nomes sem relevância que o TMDB põe em alta)
  return d.results.filter((x) => x.profile_path && !x.adult && (x.known_for || []).some((k) => !k.adult && (k.vote_count || 0) >= 1000)).map(cartaoPessoa);
}

/** Lista fixa de filmes muito bem avaliados (20 páginas = 400 filmes), base do filme do dia sem login. */
export async function bemAvaliados(pagina) {
  const d = await api('movie/top_rated', { language: 'en-US', page: pagina }, { ttl: 7 * DIA });
  return d.results.map((x) => cartao(x, 'filme')).filter((c) => c.poster);
}

/** Fotos de perfil de uma pessoa (para o "Dafoe e Cage do dia"). */
export async function fotosDaPessoa(id) {
  const d = await api(`person/${id}/images`, {}, { ttl: 30 * DIA });
  return (d.profiles || []).map((p) => p.file_path).sort(); // ordem fixa: o dia escolhe a posição
}

/** Busca simples por título (e ano, se vier), usada pelo import do Letterboxd. Fica 30 dias no cache. */
export async function procurar(tipo, titulo, ano) {
  const serie = tipo === 'serie';
  const params = { query: titulo, language: 'en-US', include_adult: 'true', page: 1 };
  if (ano) params[serie ? 'first_air_date_year' : 'year'] = ano;
  const d = await api(serie ? 'search/tv' : 'search/movie', params, { ttl: 30 * DIA });
  return (d.results || []).map((x) => cartao(x, tipo));
}

/** Resumo de um título para guardar no banco: o suficiente para listas e estatísticas do perfil. */
export async function resumo(tipo, id) {
  const pessoas = (l, n) => (l || []).slice(0, n).map((p) => ({ id: p.id, nome: p.name }));
  if (tipo === 'serie') {
    const d = await api(`tv/${id}`, { language: 'en-US', append_to_response: 'aggregate_credits' }, { ttl: 30 * DIA, guardar: false });
    return {
      titulo: d.name, ano: d.first_air_date ? Number(d.first_air_date.slice(0, 4)) : null, data: d.first_air_date || '',
      poster: d.poster_path || '', duracao: d.episode_run_time?.[0] || 0, generos: (d.genres || []).map((g) => GENEROS[g.id] || g.name),
      diretores: pessoas(d.created_by, 3), elenco: pessoas(d.aggregate_credits?.cast, 8),
      nota: d.vote_average || 0, votos: d.vote_count || 0, pop: d.popularity || 0,
    };
  }
  const d = await api(`movie/${id}`, { language: 'en-US', append_to_response: 'credits' }, { ttl: 30 * DIA, guardar: false });
  return {
    titulo: d.title, ano: d.release_date ? Number(d.release_date.slice(0, 4)) : null, data: d.release_date || '',
    poster: d.poster_path || '', duracao: d.runtime || 0, generos: (d.genres || []).map((g) => GENEROS[g.id] || g.name),
    diretores: pessoas((d.credits?.crew || []).filter((c) => c.job === 'Director'), 3), elenco: pessoas(d.credits?.cast, 8),
    nota: d.vote_average || 0, votos: d.vote_count || 0, pop: d.popularity || 0, imdb: d.imdb_id || '',
  };
}

/** Ids dos serviços por assinatura (ou grátis) que têm o título no Brasil. */
export async function streamingsDe(tipo, id) {
  const d = await api(`${tipo === 'serie' ? 'tv' : 'movie'}/${id}/watch/providers`, {}, { ttl: 3 * DIA });
  const br = d.results?.BR || {};
  return [...(br.flatrate || []), ...(br.free || []), ...(br.ads || [])].map((p) => p.provider_id);
}

/** Caminho da foto de uma pessoa (para os rankings do perfil). */
export async function fotoDaPessoa(id) {
  const d = await api(`person/${id}`, { language: 'en-US' }, { ttl: 30 * DIA });
  return d.profile_path || '';
}

/** Confere se a chave funciona (usado na tela do Perfil). */
/** Código do IMDb de um título (para buscar as notas de fora). Fica 30 dias guardado. */
export async function imdbDe(tipo, id) {
  const j = await api(`${tipo === 'serie' ? 'tv' : 'movie'}/${id}/external_ids`, {}, { ttl: 30 * DIA });
  return j.imdb_id || '';
}

export async function testarChave(k) {
  const r = await fetch(`${BASE}configuration?api_key=${encodeURIComponent(k)}`);
  return r.ok;
}
