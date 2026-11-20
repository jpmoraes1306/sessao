// Curiosidades sem IA e sem custo: o próprio texto das seções da Wikipédia (Produção, Recepção, Temas,
// Legado...) e fatos prontos do Wikidata (baseado em, onde foi filmado, onde se passa).
// Em português quando o artigo em português tem a seção; senão, em inglês. Fica 30 dias no cache.
import { ler, gravar, DIA } from './cache.js';

const WD = 'https://www.wikidata.org/w/api.php';
const pedir = async (base, params) => {
  const r = await fetch(`${base}?${new URLSearchParams({ format: 'json', origin: '*', ...params })}`);
  if (!r.ok) throw new Error(`resposta ${r.status}`);
  return r.json();
};

// seções que interessam, na ordem em que aparecem na ficha
const SECOES = {
  pt: [[/^produ[çc][ãa]o|^desenvolvimento/i, 'Produção'], [/^filmagens|^grava[çc][õo]es/i, 'Filmagens'], [/^recep[çc][ãa]o|^cr[íi]tica|^resposta da cr[íi]tica/i, 'Recepção'],
    [/^temas|^an[áa]lise|^interpreta[çc]/i, 'Temas'], [/^legado|^impacto|^influ[êe]ncia/i, 'Legado'], [/^curiosidades/i, 'Curiosidades'], [/^trilha sonora|^m[úu]sica/i, 'Trilha sonora']],
  en: [[/^production|^development/i, 'Produção'], [/^filming/i, 'Filmagens'], [/^reception|^critical (response|reception)/i, 'Recepção'],
    [/^themes|^analysis|^interpretations?/i, 'Temas'], [/^legacy|^cultural impact|^influence/i, 'Legado'], [/^music|^soundtrack/i, 'Trilha sonora']],
};

/** Tira o texto corrido do HTML de uma seção: parágrafos e subtítulos, sem tabelas, imagens nem notas. */
function textoDe(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('sup, style, table, figure, .mw-editsection, .hatnote, .thumb, .navbox, .reference, .noprint, .mw-empty-elt, .gallery').forEach((x) => x.remove());
  const linhas = [];
  let primeiroTitulo = true;
  for (const x of doc.querySelectorAll('h2, h3, h4, p, blockquote, li')) {
    const t = x.textContent.replace(/\s+/g, ' ').replace(/\[\d+\]/g, '').trim();
    if (!t) continue;
    if (/^H[234]$/.test(x.tagName)) { if (primeiroTitulo) { primeiroTitulo = false; continue; } linhas.push(`## ${t}`); } else if (x.tagName === 'LI') { if (t.length > 30 && !x.closest('.references')) linhas.push(`• ${t}`); } else if (t.length > 30) linhas.push(t);
  }
  // subtítulo sem texto embaixo não serve para nada
  return linhas.filter((l, i) => !l.startsWith('## ') || (linhas[i + 1] && !linhas[i + 1].startsWith('## '))).join('\n\n');
}

async function secoesDa(lingua, titulo) {
  const base = `https://${lingua}.wikipedia.org/w/api.php`;
  const indice = await pedir(base, { action: 'parse', page: titulo, prop: 'sections', redirects: 1 });
  const todas = (indice.parse?.sections || []).filter((s) => s.toclevel === 1);
  const escolhidas = [];
  for (const [padrao, rotulo] of SECOES[lingua]) {
    const s = todas.find((x) => padrao.test(x.line.replace(/<[^>]+>/g, '')) && !escolhidas.some((e) => e.index === x.index));
    if (s) escolhidas.push({ index: s.index, rotulo });
  }
  const prontas = await Promise.all(escolhidas.slice(0, 5).map(async (s) => {
    try {
      const r = await pedir(base, { action: 'parse', page: titulo, section: s.index, prop: 'text', redirects: 1, disabletoc: 1 });
      const texto = textoDe(r.parse?.text?.['*'] || '');
      return texto.length > 200 ? { titulo: s.rotulo, texto, lingua } : null;
    } catch { return null; }
  }));
  return prontas.filter(Boolean);
}

/**
 * { fatos: [{ rotulo, texto }], secoes: [{ titulo, texto, lingua }], artigo: { lingua, titulo } | null }
 * ou null se não achou o título no Wikidata.
 */
export async function buscar(imdbId) {
  if (!imdbId) return null;
  const k = `curi:${imdbId}`;
  const salvo = await ler(k);
  if (salvo && Date.now() - salvo.t < 30 * DIA) return salvo.v;
  try {
    const achado = await pedir(WD, { action: 'query', list: 'search', srsearch: `haswbstatement:P345=${imdbId}`, srlimit: 1 });
    const qid = achado.query?.search?.[0]?.title;
    if (!qid) { gravar(k, null); return null; }
    const ent = (await pedir(WD, { action: 'wbgetentities', ids: qid, props: 'sitelinks|claims', sitefilter: 'ptwiki|enwiki' })).entities?.[qid] || {};
    const idsDe = (prop) => (ent.claims?.[prop] || []).map((c) => c.mainsnak?.datavalue?.value?.id).filter(Boolean).slice(0, 6);
    const grupos = [['Baseado em', idsDe('P144')], ['Filmado em', idsDe('P915')], ['Onde se passa', idsDe('P840')]];
    const todos = [...new Set(grupos.flatMap(([, ids]) => ids))];
    let nomes = {};
    if (todos.length) {
      const r = await pedir(WD, { action: 'wbgetentities', ids: todos.join('|'), props: 'labels', languages: 'pt-br|pt|en' });
      for (const [id, e] of Object.entries(r.entities || {})) nomes[id] = e.labels?.['pt-br']?.value || e.labels?.pt?.value || e.labels?.en?.value || '';
    }
    const fatos = grupos.map(([rotulo, ids]) => ({ rotulo, texto: ids.map((id) => nomes[id]).filter(Boolean).join(', ') })).filter((f) => f.texto);

    const pt = ent.sitelinks?.ptwiki?.title;
    const en = ent.sitelinks?.enwiki?.title;
    let secoes = [];
    let artigo = null;
    let incompleto = false; // alguma consulta à Wikipédia falhou
    if (pt) { try { secoes = await secoesDa('pt', pt); if (secoes.length) artigo = { lingua: 'pt', titulo: pt }; } catch { incompleto = true; /* tenta em inglês */ } }
    if (en) {
      // completa com o artigo em inglês as seções que o português não tem
      try {
        const extras = (await secoesDa('en', en)).filter((s) => !secoes.some((x) => x.titulo === s.titulo));
        if (extras.length && !artigo) artigo = { lingua: 'en', titulo: en };
        secoes = [...secoes, ...extras];
      } catch { incompleto = true; /* fica só com o que tem */ }
    }
    const v = { fatos, secoes, artigo };
    if (!incompleto) gravar(k, v); // incompleto: mostra o que veio e tenta de novo na próxima visita
    return v;
  } catch {
    return salvo?.v || null;
  }
}
