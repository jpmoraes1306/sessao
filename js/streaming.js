// Filtro "só nos meus streamings": confere, título a título, se está num serviço que a pessoa assina.
// A consulta ao TMDB fica 3 dias no cache, então só a primeira vez demora.
import * as tmdb from './tmdb.js';
import { MEUS_STREAMINGS } from './config.js';

const memoria = new Map(); // "filme:123" -> ids dos serviços que têm o título no Brasil

async function servicosDe(item) {
  const k = `${item.tipo}:${item.id}`;
  if (!memoria.has(k)) {
    try { memoria.set(k, await tmdb.streamingsDe(item.tipo, item.id)); } catch { return []; }
  }
  return memoria.get(k);
}

/** Nome do serviço seu que tem o título (o primeiro), ou '' se nenhum tem. */
export async function ondeTenho(item) {
  const ids = await servicosDe(item);
  const meu = ids.find((id) => MEUS_STREAMINGS.has(id));
  return meu ? MEUS_STREAMINGS.get(meu) : '';
}

/** Devolve só os itens que estão nos seus streamings; cada um ganha `onde` (nome do serviço). */
export async function filtrar(itens, aoAvancar = () => {}) {
  const saida = new Array(itens.length).fill(null);
  let proximo = 0;
  let feitos = 0;
  await Promise.all(Array.from({ length: 8 }, async () => {
    while (proximo < itens.length) {
      const i = proximo++;
      const onde = await ondeTenho(itens[i]);
      if (onde) saida[i] = { ...itens[i], onde };
      aoAvancar(++feitos, itens.length);
    }
  }));
  return saida.filter(Boolean);
}
