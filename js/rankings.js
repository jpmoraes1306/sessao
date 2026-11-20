// Rankings de vocês por pessoa (diretor, ator...): listas com ordem guardadas na conta.
// Os do Letterboxd vieram pelo import ("Nolan ranked"); os criados no app ficam ligados à pessoa pelo id do TMDB.
import * as nuvem from './nuvem.js';
import * as dados from './dados.js';

let listas = null; // listas com ordem dos dois, com os itens; carrega uma vez por login
let listasDe = null;

/** Depois de salvar ou apagar, a próxima leitura busca de novo na conta. */
export const esquecer = () => { listas = null; };

async function listasComOrdem() {
  const b = nuvem.banco();
  const eu = nuvem.usuario()?.id;
  if (!b || !eu) return [];
  if (listas && listasDe === eu) return listas;
  const { data, error } = await b.from('listas').select('id, nome, user_id, pessoa_tmdb_id, lista_itens(posicao, tipo, tmdb_id)').eq('ranqueada', true);
  if (error) throw error;
  listas = data || [];
  listasDe = eu;
  return listas;
}

const semAcento = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const K = (tipo, id) => `${tipo}:${id}`;

/** A categoria em que a pessoa mais trabalhou (ou a "conhecida por" do TMDB): é dela que sai o ranking. */
export function categoriaPrincipal(p) {
  const conta = {};
  for (const c of p.creditos) for (const cat in c.categorias) conta[cat] = (conta[cat] || 0) + 1;
  const categorias = Object.entries(conta).sort((a, b) => b[1] - a[1]).map(([c]) => c);
  return categorias.includes(p.depto) ? p.depto : categorias[0] || '';
}

/** Títulos da pessoa (na categoria principal) que você já viu: os que podem entrar no seu ranking. */
export function vistosDaPessoa(p) {
  const cat = categoriaPrincipal(p);
  // série não tem "visto": conta a que você acompanha ou já deu nota
  return p.creditos.filter((c) => { const m = dados.titulo(c.tipo, c.id); return cat in c.categorias && (m.visto || (c.tipo === 'serie' && (m.seguindo || m.nota != null))); });
}

/** Rankings de vocês que são desta pessoa. Uma lista é dela quando foi criada no app para ela, ou quando o
    sobrenome está no nome da lista e metade dos títulos é dela ("Nolan ranked"). Só pelos títulos não vale:
    um ranking de franquia ("Harry Potter") apareceria como ranking de cada ator dela, e editar por ali
    trocaria a lista de dono. Cada item ganha `r` (título, ano, pôster). */
export async function daPessoa(p) {
  const feitos = new Map(p.creditos.map((c) => [K(c.tipo, c.id), c]));
  const sobrenome = semAcento(p.nome.trim().split(/\s+/).pop());
  const achadas = [];
  for (const l of await listasComOrdem()) {
    const itens = (l.lista_itens || []).slice().sort((a, b) => a.posicao - b.posicao).map((i) => ({ ...i }));
    if (itens.length < 2) continue;
    const dentro = itens.filter((i) => feitos.has(K(i.tipo, i.tmdb_id))).length / itens.length;
    const noNome = semAcento(l.nome).split(/[^a-z0-9]+/).includes(sobrenome);
    if (l.pessoa_tmdb_id === p.id || (!l.pessoa_tmdb_id && noNome && dentro >= 0.5)) achadas.push({ ...l, itens });
  }
  if (!achadas.length) return [];
  const fora = achadas.flatMap((l) => l.itens).filter((i) => !feitos.has(K(i.tipo, i.tmdb_id)));
  const info = fora.length ? await dados.resumos(fora).catch(() => new Map()) : new Map();
  for (const l of achadas) for (const i of l.itens) i.r = feitos.get(K(i.tipo, i.tmdb_id)) || info.get(K(i.tipo, i.tmdb_id)) || {};
  // as criadas no app para esta pessoa vêm antes das achadas pelo nome
  return achadas.sort((a, b) => (b.pessoa_tmdb_id === p.id) - (a.pessoa_tmdb_id === p.id));
}

/** Grava o seu ranking da pessoa. `itens` = [{ tipo, id }] na ordem; `existente` = a lista que está sendo editada, se houver. */
export async function salvar(p, itens, existente) {
  const b = nuvem.banco();
  const eu = nuvem.usuario()?.id;
  if (!b || !eu) return false;
  let id = existente?.id;
  if (id) {
    const { error } = await b.from('listas').update({ pessoa_tmdb_id: p.id, ranqueada: true }).eq('id', id);
    if (error) return false;
  } else {
    // duas pessoas com o mesmo nome (o ator e o diretor Steve McQueen) não podem dividir a mesma lista
    let nome = `Ranking: ${p.nome}`;
    const { data: mesmoNome, error: erroNome } = await b.from('listas').select('id, pessoa_tmdb_id').eq('user_id', eu).eq('nome', nome).maybeSingle();
    if (erroNome) return false;
    if (mesmoNome && mesmoNome.pessoa_tmdb_id !== p.id) nome = `${nome} (${p.id})`;
    const { data, error } = await b.from('listas').upsert({ user_id: eu, nome, ranqueada: true, pessoa_tmdb_id: p.id, origem: 'app' }, { onConflict: 'user_id,nome' }).select('id').single();
    if (error) return false;
    id = data.id;
  }
  // grava por cima, posição por posição, e só depois corta o que sobrou: se a internet cair no meio,
  // o ranking antigo continua lá em vez de ficar vazio
  const { error } = await b.from('lista_itens').upsert(itens.map((i, n) => ({ lista_id: id, posicao: n + 1, tipo: i.tipo, tmdb_id: i.id, comentario: '' })), { onConflict: 'lista_id,posicao' });
  esquecer();
  if (error) return false;
  const cortou = await b.from('lista_itens').delete().eq('lista_id', id).gt('posicao', itens.length);
  return !cortou.error;
}

export async function apagar(lista) {
  const { error } = await nuvem.banco().from('listas').delete().eq('id', lista.id);
  esquecer();
  return !error;
}
