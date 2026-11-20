// Wikidata (grátis, sem chave): lista de prêmios e indicações de um filme ou série, com o ano.
// A busca é pelo código do IMDb (propriedade P345). Fica 30 dias no cache.
import { ler, gravar, DIA } from './cache.js';

// Ordem de relevância: quanto mais em cima, mais importante.
const PESO = [
  /oscar|óscar|academy award/i,
  /palma de ouro|palme d.or/i,
  /emmy/i,
  /globo de ouro|golden globe/i,
  /bafta/i,
  /leão de ouro|urso de ouro|golden lion|golden bear|festival de (cannes|veneza|berlim)|grand prix/i,
  /screen actors guild|sindicato dos atores/i,
  /critics.? choice/i,
  /directors guild|writers guild|producers guild/i,
  /césar|goya|independent spirit|saturn|hugo|annie|grammy|peabody|aacta|national board of review/i,
];
// Dentro do mesmo prêmio, as categorias principais vêm primeiro.
const CATEGORIA = [/melhor filme|best picture|best film|melhor série|best series|outstanding (drama|comedy|limited)/i, /melhor diretor|melhor direção$|best director|directing/i, /ator|atriz|actor|actress|elenco/i, /roteiro|screenplay|writing/i];
const posicao = (lista, texto) => { const i = lista.findIndex((r) => r.test(texto)); return i < 0 ? lista.length : i; };

function arrumaNome(n) {
  return n
    .replace(/^premiados (e indicados )?(com o |pelo |com a |pela )/i, '')
    .replace(/^Golden Globe Award/i, 'Globo de Ouro')
    .replace(/^Primetime Emmy Award/i, 'Emmy')
    .replace(/^Óscar/i, 'Oscar')
    .replace(/^./, (c) => c.toUpperCase());
}

/** [{ nome, ano, venceu, quem: [..] }] já na ordem de relevância. null se não achou nada. */
export async function premios(imdbId) {
  if (!imdbId) return null;
  const k = `wd:premios:${imdbId}`;
  const salvo = await ler(k);
  if (salvo && Date.now() - salvo.t < 30 * DIA) return salvo.v;
  const consulta = `SELECT ?tipo ?premio ?premioLabel ?data ?quemLabel WHERE {
    ?obra wdt:P345 "${imdbId.replace(/[^a-z0-9]/gi, '')}".
    { ?obra p:P166 ?st. ?st ps:P166 ?premio. BIND("v" AS ?tipo) OPTIONAL { ?st pq:P1346 ?quem } }
    UNION { ?obra p:P1411 ?st. ?st ps:P1411 ?premio. BIND("i" AS ?tipo) OPTIONAL { ?st pq:P2453 ?quem } }
    OPTIONAL { ?st pq:P585 ?data }
    SERVICE wikibase:label { bd:serviceParam wikibase:language "pt-br,pt,en". }
  }`;
  try {
    const r = await fetch(`https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(consulta)}`, { headers: { Accept: 'application/sparql-results+json' } });
    if (!r.ok) throw new Error(`Wikidata respondeu ${r.status}`);
    const linhas = (await r.json()).results.bindings;
    const mapa = new Map();
    for (const b of linhas) {
      const nome = arrumaNome(b.premioLabel?.value || '');
      if (!nome || /^Q\d+$/.test(nome)) continue; // prêmio sem nome cadastrado
      const ano = (b.data?.value || '').slice(0, 4);
      const venceu = b.tipo.value === 'v';
      const chave = `${b.premio.value}|${ano}`;
      const it = mapa.get(chave) || { nome, ano, venceu, quem: [] };
      it.venceu = it.venceu || venceu; // se consta como indicado e como vencedor, venceu
      const quem = b.quemLabel?.value;
      if (quem && !/^Q\d+$/.test(quem) && !it.quem.includes(quem)) it.quem.push(quem);
      mapa.set(chave, it);
    }
    const lista = [...mapa.values()].sort((a, b) =>
      posicao(PESO, a.nome) - posicao(PESO, b.nome)
      || b.venceu - a.venceu
      || posicao(CATEGORIA, a.nome) - posicao(CATEGORIA, b.nome)
      || (b.ano || '0').localeCompare(a.ano || '0')
      || a.nome.localeCompare(b.nome));
    gravar(k, lista);
    return lista;
  } catch {
    return salvo?.v || null;
  }
}
