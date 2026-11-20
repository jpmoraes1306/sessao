// Cache local (IndexedDB) do que já foi buscado no TMDB e na OMDb.
// Na fase 2 o banco ganha a tabela cache_titulos; este cache continua como cópia local.
const NOME = 'sessao';
const LOJA = 'cache';
let abrindo = null;
const memoria = new Map(); // reserva se o IndexedDB não estiver disponível

function abrir() {
  if (abrindo) return abrindo;
  abrindo = new Promise((ok, falha) => {
    const req = indexedDB.open(NOME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(LOJA, { keyPath: 'k' });
    req.onsuccess = () => ok(req.result);
    req.onerror = () => falha(req.error);
  }).catch(() => null);
  return abrindo;
}

function tx(modo, fn) {
  return abrir().then((db) => {
    if (!db) return undefined;
    return new Promise((ok) => {
      const t = db.transaction(LOJA, modo);
      const req = fn(t.objectStore(LOJA));
      t.oncomplete = () => ok(req?.result);
      t.onerror = t.onabort = () => ok(undefined);
    });
  }).catch(() => undefined);
}

/** Devolve { t: quando foi salvo (ms), v: valor } ou undefined. */
export async function ler(k) {
  const r = await tx('readonly', (s) => s.get(k));
  return r || memoria.get(k);
}

export async function gravar(k, v) {
  const reg = { k, t: Date.now(), v };
  memoria.set(k, reg);
  if (memoria.size > 200) memoria.delete(memoria.keys().next().value);
  await tx('readwrite', (s) => s.put(reg));
}

export async function limpar() {
  memoria.clear();
  await tx('readwrite', (s) => s.clear());
}

export const HORA = 3600e3;
export const DIA = 24 * HORA;
