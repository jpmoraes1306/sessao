// Nota "de fora" de um título, para ordenar listas por nota: a média de IMDb, Rotten Tomatoes e
// Metacritic (tudo de 0 a 10). Só quando nenhum dos três tem nota é que vale a do TMDB.
// As respostas ficam guardadas no aparelho (códigos do IMDb por 30 dias, notas por 7), então a
// primeira ordenação de uma lista grande demora alguns segundos e as seguintes são na hora.
import * as tmdb from './tmdb.js';
import * as omdb from './omdb.js';

export function referencia(n, tmdbNota) {
  const v = [n?.imdb, n?.rotten != null ? n.rotten / 10 : null, n?.metacritic ? n.metacritic / 10 : null].filter((x) => x != null && x > 0);
  return v.length ? { nota: v.reduce((a, b) => a + b, 0) / v.length, deFora: true } : { nota: tmdbNota || 0, deFora: false };
}

const memoria = new Map(); // "tipo:id" -> { nota, deFora }, enquanto o app está aberto
const POR_VEZ = 300; // títulos novos por ordenação, para não estourar o limite diário da OMDb (1.000 consultas)
const chaveDe = (t) => `${t.tipo}:${t.id}`;

/** Quantos títulos da lista ainda não têm a nota de fora na memória. */
export const faltam = (itens) => itens.filter((t) => !memoria.has(chaveDe(t))).length;

/** Busca o que falta e devolve uma função (título) => { nota, deFora }. */
export async function paraLista(itens, aoAvancar = () => {}) {
  const fila = itens.filter((t) => !memoria.has(chaveDe(t))).slice(0, POR_VEZ);
  let feitos = 0;
  let proximo = 0;
  const um = async (t) => {
    let n = null;
    try {
      const imdb = await tmdb.imdbDe(t.tipo, t.id);
      if (imdb) n = await omdb.notas(imdb);
    } catch { /* sem internet ou sem resposta: vale a nota do TMDB */ }
    memoria.set(chaveDe(t), referencia(n, t.tmdb));
    aoAvancar(++feitos, fila.length);
  };
  await Promise.all(Array.from({ length: 6 }, async () => { while (proximo < fila.length) await um(fila[proximo++]); }));
  return (t) => memoria.get(chaveDe(t)) || referencia(null, t.tmdb);
}
