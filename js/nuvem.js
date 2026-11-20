// Ligação com o Supabase: login com Google (só os e-mails permitidos) e acesso ao banco.
// O app continua abrindo sem internet ou sem login; nesse caso fica só com o que está no aparelho.
import { SUPABASE_URL, SUPABASE_CHAVE } from './supabase-config.js';
import { salvarChaves, chave, definirStreamings, SERVICOS } from './config.js';

const BIBLIOTECA = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

let cliente = null;
let sessao = null;
let perfil = null;
let perfis = []; // os dois perfis: { id, nome, foto, ativo }
let erroLogin = '';
let iniciado = false;
const ouvintes = new Set();
const avisar = () => ouvintes.forEach((fn) => fn());

/** Avisa quando alguém entra, sai ou quando as chaves chegam do banco. */
export const aoMudar = (fn) => { ouvintes.add(fn); return () => ouvintes.delete(fn); };
/** Cliente do Supabase (null se a biblioteca não carregou, por exemplo sem internet). */
export const banco = () => cliente;
export const disponivel = () => Boolean(cliente);
export const erroDeLogin = () => erroLogin;
/** A primeira conferência do login guardado já terminou? Antes disso ainda não dá para saber se há alguém logado. */
export const iniciou = () => iniciado;

/** Os perfis do app (você e o outro). `ativo = false` é quem ainda não entrou pela primeira vez. */
export const pessoas = () => perfis.map((p) => ({ ...p, eu: p.id === sessao?.user?.id }));
/** O outro perfil (para "nota do Thiago", lista dele etc.), ou null. */
export const outro = () => pessoas().find((p) => !p.eu) || null;
export const pessoa = (id) => pessoas().find((p) => p.id === id) || null;

/** Quem está logado: { id, email, nome, foto } ou null. */
export function usuario() {
  if (!sessao?.user) return null;
  const u = sessao.user;
  return {
    id: u.id, email: u.email,
    nome: perfil?.nome || u.user_metadata?.full_name || u.user_metadata?.name || u.email.split('@')[0],
    foto: perfil?.foto || u.user_metadata?.avatar_url || '',
  };
}

async function aoEntrar(saiu = false) {
  if (!sessao || !cliente) {
    perfil = null; perfis = [];
    // saiu de verdade: os streamings de quem estava logado não ficam para o próximo. Só "sem sessão ao abrir"
    // (sem internet para renovar o login) não mexe em nada: fica o que estava guardado no aparelho.
    if (saiu) definirStreamings(null);
    return;
  }
  const [{ data: segredos, error: erroSegredos }, { data: todos }] = await Promise.all([
    cliente.from('segredos').select('nome, valor'),
    cliente.from('perfis').select('*').order('criado_em'),
  ]);
  perfis = todos || [];
  perfil = perfis.find((p) => p.id === sessao.user.id) || null;
  // os streamings são de cada perfil: valem os de quem entrou, mesmo que a lista esteja vazia (não assina nenhum).
  // Se a leitura do perfil falhou (sem internet), fica o que estava guardado no aparelho.
  if (perfil) definirStreamings(perfil.streamings || []);
  // Chaves do TMDB e da OMDb: ficam guardadas no banco (só vocês dois leem) e chegam sozinhas
  // depois do login. Se o banco ainda não tem e este aparelho tem, o app guarda as daqui.
  const s = Object.fromEntries((segredos || []).map((x) => [x.nome, x.valor]));
  if (s.tmdb) {
    if (s.tmdb !== chave('tmdb') || (s.omdb || '') !== chave('omdb')) salvarChaves({ tmdb: s.tmdb, omdb: s.omdb || chave('omdb') });
  } else if (chave('tmdb') && !erroSegredos) { // só quando a leitura deu certo e a conta realmente não tem as chaves
    const linhas = [{ nome: 'tmdb', valor: chave('tmdb') }, ...(chave('omdb') ? [{ nome: 'omdb', valor: chave('omdb') }] : [])];
    const { error } = await cliente.from('segredos').upsert(linhas);
    if (error) console.warn('Não deu para guardar as chaves na conta:', error.message);
  }
}

export async function iniciar() {
  // o Supabase devolve o erro do login na própria URL (por exemplo, e-mail fora da lista)
  const volta = new URLSearchParams(location.search);
  if (volta.get('error')) {
    const descricao = volta.get('error_description') || '';
    erroLogin = /database error|não tem acesso/i.test(descricao) ? 'Este e-mail não tem acesso ao Sessão.' : `O login falhou: ${descricao || volta.get('error')}`;
    history.replaceState(null, '', location.pathname + location.hash);
  }
  try {
    const { createClient } = await import(BIBLIOTECA);
    cliente = createClient(SUPABASE_URL, SUPABASE_CHAVE, { auth: { flowType: 'pkce', detectSessionInUrl: true, persistSession: true, autoRefreshToken: true } });
    sessao = (await cliente.auth.getSession()).data.session;
    await aoEntrar();
    cliente.auth.onAuthStateChange((evento, nova) => {
      const mudou = (nova?.user?.id || null) !== (sessao?.user?.id || null);
      sessao = nova;
      if (!mudou && evento !== 'USER_UPDATED') return;
      // fora do retorno de chamada do Supabase, para não travar a troca de token
      setTimeout(async () => { await aoEntrar(evento === 'SIGNED_OUT'); avisar(); }, 0);
    });
  } catch (erro) {
    console.warn('Sem ligação com o Supabase:', erro?.message || erro);
  }
  iniciado = true;
  avisar();
}

export async function entrar() {
  if (!cliente) throw new Error('Sem internet para entrar.');
  erroLogin = '';
  const { error } = await cliente.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: location.origin + location.pathname, queryParams: { prompt: 'select_account' } },
  });
  if (error) throw error;
}

/** Liga ou desliga um serviço de streaming do seu perfil (pelo nome) e grava na conta. */
export async function alternarStreaming(nome) {
  const servico = SERVICOS.find((s) => s.nome === nome);
  if (!servico || !perfil || !cliente) return false;
  const atuais = new Set(perfil.streamings || []);
  const tinha = servico.ids.some((i) => atuais.has(i));
  for (const i of servico.ids) { if (tinha) atuais.delete(i); else atuais.add(i); }
  perfil.streamings = [...atuais];
  definirStreamings(perfil.streamings);
  const { error } = await cliente.from('perfis').update({ streamings: perfil.streamings }).eq('id', sessao.user.id);
  return !error;
}

/** A foto atual foi escolhida no app (e não veio do Google)? */
export const fotoEscolhida = () => Boolean(perfil?.foto?.startsWith('data:'));
/** Troca a foto de perfil: recebe a imagem já reduzida (data URL) ou null para voltar à do Google.
    Fica no perfil, então aparece também para o outro. */
export async function salvarFoto(dataUrl) {
  if (!perfil || !cliente) return false;
  const foto = dataUrl || sessao.user.user_metadata?.avatar_url || null;
  const { error } = await cliente.from('perfis').update({ foto }).eq('id', sessao.user.id);
  if (error) return false;
  perfil.foto = foto;
  avisar();
  return true;
}

export async function sair() {
  // só neste aparelho: o padrão do Supabase encerra a sessão em todos (sair no celular derrubava o computador)
  if (cliente) await cliente.auth.signOut({ scope: 'local' });
}
