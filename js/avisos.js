// Avisos (notificações push) deste aparelho: episódio novo das séries acompanhadas, estreia
// marcada com "Avisar" e a sessão do dia. Quem manda é a função "avisos" no Supabase.
// No iPhone só funciona com o app instalado na tela de início (iOS 16.4 ou mais novo).
import * as nuvem from './nuvem.js';

export const suportado = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

const chamar = async (acao) => {
  const { data, error } = await nuvem.banco().functions.invoke('avisos', { body: { acao } });
  if (error) throw error;
  return data;
};

/** base64 "de URL" -> bytes (formato que alguns navegadores exigem na inscrição). */
function bytes(base64url) {
  const b64 = base64url.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(base64url.length / 4) * 4, '=');
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

async function inscricao() {
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

/** 'sem-suporte' | 'bloqueado' | 'ligado' | 'desligado' */
export async function estado() {
  if (!suportado()) return 'sem-suporte';
  if (Notification.permission === 'denied') return 'bloqueado';
  try { return (await inscricao()) ? 'ligado' : 'desligado'; } catch { return 'desligado'; }
}

/** Pede a permissão, inscreve o aparelho e guarda a inscrição na conta. Devolve '' ou o texto do problema. */
export async function ligar() {
  if (!suportado()) return 'Este navegador não recebe avisos.';
  if (!nuvem.usuario()) return 'Entre na sua conta primeiro.';
  if ((await Notification.requestPermission()) !== 'granted') return 'A permissão de avisos foi negada.';
  try {
    const { chave } = await chamar('vapid');
    const reg = await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes(chave) });
    const j = sub.toJSON();
    const { error } = await nuvem.banco().from('push_inscricoes').upsert({ endpoint: j.endpoint, chaves: j.keys, user_id: nuvem.usuario().id });
    return error ? 'Não deu para guardar a inscrição.' : '';
  } catch (erro) {
    console.warn('avisos:', erro);
    return 'Não deu para ativar os avisos agora.';
  }
}

export async function desligar() {
  const sub = await inscricao();
  if (!sub) return;
  await nuvem.banco()?.from('push_inscricoes').delete().eq('endpoint', sub.endpoint);
  await sub.unsubscribe();
}

/** Manda um aviso de teste para os seus aparelhos. Devolve quantos receberam. */
export async function testar() {
  return (await chamar('teste')).entregues ?? 0;
}

/* ---------- "Avisar" numa estreia ---------- */
let marcadas = new Set(); // ids dos filmes em que você pediu aviso
let dono = null;

export const pediuAviso = (id) => marcadas.has(Number(id));

export async function alternarEstreia(meta, data) {
  const b = nuvem.banco();
  const eu = nuvem.usuario()?.id;
  if (!b || !eu) return false;
  if (marcadas.has(meta.id)) {
    marcadas.delete(meta.id);
    await b.from('avisos_estreia').delete().match({ user_id: eu, tmdb_id: meta.id });
  } else {
    marcadas.add(meta.id);
    const { error } = await b.from('avisos_estreia').upsert({ user_id: eu, tmdb_id: meta.id, titulo: meta.titulo, data });
    if (error) { marcadas.delete(meta.id); return false; }
  }
  return true;
}

nuvem.aoMudar(async () => {
  const eu = nuvem.usuario()?.id || null;
  if (eu === dono) return;
  dono = eu;
  marcadas = new Set();
  if (!eu) return;
  const { data } = await nuvem.banco().from('avisos_estreia').select('tmdb_id').eq('user_id', eu);
  marcadas = new Set((data || []).map((x) => x.tmdb_id));
});
