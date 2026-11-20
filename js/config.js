// Chaves das APIs. Ficam só no aparelho (localStorage). Nunca no repositório.
// Em desenvolvimento, app/config.local.js (fora do Git) preenche as chaves sozinho.
const K = 'sessao:chaves';
let chaves = { tmdb: '', omdb: '' };

try { Object.assign(chaves, JSON.parse(localStorage.getItem(K) || '{}')); } catch { /* sem armazenamento */ }

export async function carregarChaves() {
  if (chaves.tmdb && chaves.omdb) return chaves;
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  if (local) {
    try {
      const m = await import('../config.local.js');
      salvarChaves({ tmdb: chaves.tmdb || m.default.tmdb, omdb: chaves.omdb || m.default.omdb });
    } catch { /* sem arquivo local: as chaves entram pela tela do Perfil */ }
  }
  return chaves;
}

export function salvarChaves(novas) {
  chaves = { tmdb: (novas.tmdb || '').trim(), omdb: (novas.omdb || '').trim() };
  try { localStorage.setItem(K, JSON.stringify(chaves)); } catch { /* segue só na memória */ }
}

export const chave = (qual) => chaves[qual] || '';
export const temChaves = () => Boolean(chaves.tmdb);

// Streamings (D8). Casar sempre pelo provider_id do TMDB, nunca pelo nome.
// SERVICOS é o que dá para marcar no Perfil; cada pessoa guarda os seus em perfis.streamings.
export const SERVICOS = [
  { nome: 'Netflix', ids: [8, 1796] }, { nome: 'HBO Max', ids: [1899] }, { nome: 'Prime Video', ids: [119, 2100] },
  { nome: 'Disney+', ids: [337] }, { nome: 'Crunchyroll', ids: [283] }, { nome: 'Apple TV', ids: [350] },
  { nome: 'Globoplay', ids: [307] }, { nome: 'Paramount+', ids: [531] }, { nome: 'MUBI', ids: [11] },
  { nome: 'Claro tv+', ids: [484] }, { nome: 'Looke', ids: [47] },
];
const PADRAO = [8, 1796, 1899, 119, 2100, 337, 283, 350]; // Netflix, HBO Max, Prime Video, Disney+, Crunchyroll e Apple TV

/** provider_id -> nome do serviço, só dos que a pessoa assina. Muda quando o perfil carrega. */
export const MEUS_STREAMINGS = new Map();
export function definirStreamings(ids) {
  MEUS_STREAMINGS.clear();
  for (const s of SERVICOS) if (s.ids.some((i) => (ids || PADRAO).includes(i))) for (const i of s.ids) MEUS_STREAMINGS.set(i, s.nome);
}
definirStreamings(PADRAO);