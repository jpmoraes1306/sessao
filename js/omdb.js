// OMDb: notas do IMDb, Rotten Tomatoes e Metacritic, mais prêmios e bilheteria.
// Limite grátis de 1.000 consultas por dia: cada título fica 7 dias no cache; se ainda faltava a nota
// do IMDb ou do Rotten (filme recém-lançado), só 1 dia, para a nota aparecer assim que existir.
import { chave } from './config.js';
import { ler, gravar, DIA } from './cache.js';

const num = (v) => { const n = parseFloat(String(v || '').replace(/,/g, '')); return Number.isFinite(n) ? n : null; };
const emCurso = new Map();

export async function notas(imdbId) {
  if (!imdbId || !chave('omdb')) return null;
  const k = `omdb:${imdbId}`;
  const salvo = await ler(k);
  const completo = salvo?.v && salvo.v.imdb != null && salvo.v.rotten != null;
  if (salvo && Date.now() - salvo.t < (completo ? 7 : 1) * DIA) return salvo.v;
  if (emCurso.has(k)) return emCurso.get(k);
  const pedido = (async () => {
    try {
      const r = await fetch(`https://www.omdbapi.com/?apikey=${encodeURIComponent(chave('omdb'))}&i=${encodeURIComponent(imdbId)}`);
      if (!r.ok) throw new Error(`OMDb respondeu ${r.status}`);
      const j = await r.json();
      if (j.Response === 'False') return salvo?.v || null;
      const rt = (j.Ratings || []).find((x) => x.Source === 'Rotten Tomatoes');
      const v = {
        imdb: num(j.imdbRating), imdbVotos: num(j.imdbVotes),
        rotten: rt ? num(rt.Value) : null,
        metacritic: num(j.Metascore),
        premios: j.Awards && j.Awards !== 'N/A' ? j.Awards : '',
        bilheteria: j.BoxOffice && j.BoxOffice !== 'N/A' ? j.BoxOffice : '',
      };
      gravar(k, v);
      return v;
    } catch {
      return salvo?.v || null;
    } finally {
      emCurso.delete(k);
    }
  })();
  emCurso.set(k, pedido);
  return pedido;
}
