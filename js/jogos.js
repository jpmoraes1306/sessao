// Resultados dos jogos (frame e Seis graus) a caminho da conta. O resultado fica guardado no aparelho ANTES do
// envio e só sai de lá quando a conta confirma: se a internet cair na hora, ele sobe na próxima vez que der
// (ao abrir o app ou o jogo), mesmo que a rodada já tenha trocado, e o jogo não pode ser jogado de novo.
import * as nuvem from './nuvem.js';

const LOCAL = 'sessao:jogos:pendentes';
const TABELAS = new Set(['frame_jogadas', 'estrelas_jogadas']);
const VALE = 40; // dias: resultado mais velho que isso não sobe mais (o placar é do mês)

function ler() {
  try {
    const lista = JSON.parse(localStorage.getItem(LOCAL) || '[]');
    const limite = new Date(Date.now() - VALE * 864e5).toLocaleDateString('sv-SE');
    return Array.isArray(lista) ? lista.filter((p) => TABELAS.has(p?.tabela) && typeof p.linha?.dia === 'string' && p.linha.user_id && p.linha.dia.slice(0, 10) >= limite) : [];
  } catch { return []; }
}
const salvar = (lista) => { try { localStorage.setItem(LOCAL, JSON.stringify(lista.slice(-30))); } catch { /* vale só nesta visita */ } };
const mesmo = (p, tabela, linha) => p.tabela === tabela && p.linha.dia === linha.dia && p.linha.user_id === linha.user_id;

async function subir(tabela, linha) {
  const b = nuvem.usuario()?.id === linha.user_id ? nuvem.banco() : null;
  if (!b) return false;
  try {
    const { error } = await b.from(tabela).upsert(linha, { onConflict: 'dia,user_id', ignoreDuplicates: true });
    if (error) { console.warn(`jogos: ${tabela} não subiu:`, error.message); return false; }
  } catch (erro) { console.warn(`jogos: ${tabela} não subiu:`, erro?.message || erro); return false; }
  salvar(ler().filter((p) => !mesmo(p, tabela, linha)));
  return true;
}

/** Guarda o resultado no aparelho e manda para a conta. Devolve true se a conta já confirmou. */
export async function mandar(tabela, linha) {
  salvar([...ler().filter((p) => !mesmo(p, tabela, linha)), { tabela, linha }]);
  return subir(tabela, linha);
}
/** Manda de novo o que ficou para trás (de quem está logado agora). */
export async function reenviar() {
  for (const p of ler()) await subir(p.tabela, p.linha);
}
/** O resultado desta rodada que este aparelho guardou e a conta ainda não confirmou, ou null. */
export function guardado(tabela, dia) {
  const eu = nuvem.usuario()?.id;
  return (eu && ler().find((p) => p.tabela === tabela && p.linha.dia === dia && p.linha.user_id === eu)?.linha) || null;
}

// ao entrar na conta (ou abrir o app já logado), sobe o que ficou para trás
let dono = null;
nuvem.aoMudar(() => {
  const eu = nuvem.usuario()?.id || null;
  if (eu === dono) return;
  dono = eu;
  if (eu) reenviar();
});
