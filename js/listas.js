// Listas da pessoa guardadas na conta (as do Letterboxd e as criadas no app): ler, salvar e apagar.
// Os rankings por diretor ou ator têm tela própria (rankings.js); aqui é a lista de qualquer coisa.
import * as nuvem from './nuvem.js';
import * as dados from './dados.js';
import * as rankings from './rankings.js';

/** Uma lista com os itens na ordem: { id, nome, ranqueada, user_id, itens: [{ tipo, id, titulo, ano, poster, comentario }] } ou null.
    O comentário de cada item (vem do Letterboxd) não aparece no app, mas acompanha o título quando a ordem muda. */
export async function ler(id) {
  const b = nuvem.banco();
  if (!b) throw new Error('sem ligação com a conta');
  const { data, error } = await b.from('listas').select('id, nome, ranqueada, user_id, pessoa_tmdb_id, lista_itens(posicao, tipo, tmdb_id, comentario)').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const linhas = (data.lista_itens || []).slice().sort((x, y) => x.posicao - y.posicao);
  const info = await dados.resumos(linhas);
  return {
    id: data.id, nome: data.nome, ranqueada: data.ranqueada, user_id: data.user_id, pessoa_tmdb_id: data.pessoa_tmdb_id,
    itens: linhas.map((i) => { const r = info.get(`${i.tipo}:${i.tmdb_id}`) || {}; return { tipo: i.tipo, id: i.tmdb_id, titulo: r.titulo || 'Sem título', ano: r.ano ?? null, poster: r.poster || '', comentario: i.comentario || '' }; }),
  };
}

/**
 * Grava uma lista sua (nova quando não há `id`). Devolve '' se deu certo, ou o texto do problema.
 * A lista editada no app passa a ser "do app": importar o Letterboxd de novo não troca mais ela.
 */
export async function salvar({ id, nome, ranqueada, itens }) {
  const b = nuvem.banco();
  const eu = nuvem.usuario()?.id;
  if (!b || !eu) return 'Entre na sua conta para guardar a lista.';
  const limpo = nome.trim();
  if (!limpo) return 'Dê um nome para a lista.';
  const campos = { nome: limpo, ranqueada: Boolean(ranqueada), origem: 'app' };
  const pedido = id
    ? b.from('listas').update(campos).eq('id', id).eq('user_id', eu).select('id').maybeSingle()
    : b.from('listas').insert({ user_id: eu, ...campos }).select('id').maybeSingle();
  const { data, error } = await pedido;
  if (error) return error.code === '23505' ? 'Você já tem uma lista com esse nome.' : 'Não deu para salvar. Confira a internet.';
  if (!data) return 'Esta lista não existe mais.';
  // grava por cima, posição por posição, e só depois corta o que sobrou: se a internet cair no meio,
  // a lista antiga continua lá em vez de ficar vazia
  if (itens.length) {
    const gravou = await b.from('lista_itens').upsert(itens.map((i, n) => ({ lista_id: data.id, posicao: n + 1, tipo: i.tipo, tmdb_id: i.id, comentario: i.comentario || '' })), { onConflict: 'lista_id,posicao' });
    if (gravou.error) { rankings.esquecer(); return 'A lista foi criada, mas os títulos não foram gravados. Salve de novo.'; }
  }
  const cortou = await b.from('lista_itens').delete().eq('lista_id', data.id).gt('posicao', itens.length);
  rankings.esquecer();
  return cortou.error ? 'Não deu para salvar tudo. Salve de novo.' : '';
}

export async function apagar(id) {
  const b = nuvem.banco();
  const eu = nuvem.usuario()?.id;
  if (!b || !eu) return false;
  const { error } = await b.from('listas').delete().eq('id', id).eq('user_id', eu);
  rankings.esquecer();
  return !error;
}
