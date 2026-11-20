// Séries em andamento: em que episódio a pessoa está em cada série que acompanha e quando sai o próximo.
import * as tmdb from './tmdb.js';
import * as dados from './dados.js';

const hoje = () => new Date().toLocaleDateString('sv-SE');

/** Séries que a pessoa acompanha (marcou "Acompanhar" ou já tem episódio visto), da mexida mais recente para a mais antiga. */
export function acompanhadas() {
  return dados.todos().filter((t) => t.tipo === 'serie' && (t.seguindo || Object.keys(dados.episodios(t.id)).length))
    .sort((a, b) => (b.em || '').localeCompare(a.em || ''));
}

/**
 * Situação de uma série para a pessoa:
 * { s, total, vistos, prox: { t, e } | null, ep (dados do próximo episódio), inedito: { t, e, data, nome } | null }
 */
export async function situacao(serieId) {
  const s = await tmdb.serie(serieId);
  const marcados = dados.episodios(serieId);
  const ult = s.ultimo;
  const noAr = [];
  if (ult) {
    for (const t of s.temporadas.filter((x) => x.n > 0)) {
      const n = t.n < ult.t ? t.episodios : t.n === ult.t ? ult.e : 0;
      for (let e = 1; e <= n; e++) noAr.push({ t: t.n, e });
    }
  }
  let ultimoVisto = -1;
  noAr.forEach((x, i) => { if (marcados[`${x.t}x${x.e}`]) ultimoVisto = i; });
  const prox = noAr[ultimoVisto + 1] || null;
  let ep = null;
  if (prox) {
    try {
      const temp = await tmdb.temporada(serieId, prox.t, { recente: s.emExibicao && prox.t >= (ult?.t || 0) });
      ep = temp.episodios.find((x) => x.n === prox.e) || null;
    } catch { /* sem os detalhes do episódio */ }
  }
  const inedito = s.proximo && s.proximo.data >= hoje() ? s.proximo : null;
  return { s, total: noAr.length, vistos: noAr.filter((x) => marcados[`${x.t}x${x.e}`]).length, prox, ep, inedito };
}

/** Episódios (já anunciados) das séries acompanhadas que vão ao ar entre duas datas, para o calendário. */
export async function episodiosEntre(inicio, fim) {
  const saida = [];
  await Promise.all(acompanhadas().map(async (t) => {
    try {
      const s = await tmdb.serie(t.id);
      const temporadas = [...new Set([s.ultimo?.t, s.proximo?.t].filter((n) => n > 0))];
      for (const n of temporadas) {
        const temp = await tmdb.temporada(t.id, n, { recente: true });
        for (const e of temp.episodios) {
          if (e.data >= inicio && e.data <= fim) saida.push({ serie: { tipo: 'serie', id: s.id, titulo: s.titulo, poster: s.poster }, t: n, e: e.n, nome: e.nome, data: e.data });
        }
      }
    } catch { /* série sem dados agora */ }
  }));
  return saida.sort((a, b) => a.data.localeCompare(b.data));
}
