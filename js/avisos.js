// Avisos (notificações push) deste aparelho: episódio novo das séries acompanhadas, estreia
// marcada com "Avisar" e o símbolo do dia achado pelo outro. Quem manda é a função "avisos" no Supabase.
// No iPhone só funciona com o app instalado na tela de início (iOS 16.4 ou mais novo).
import * as nuvem from './nuvem.js';

export const suportado = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const RECUSADO = '42501'; // o banco recusou a gravação: a linha existe e é de outra conta

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
  try {
    const sub = await inscricao();
    if (!sub) return 'desligado';
    // O navegador está inscrito, mas a conta pode não ter a inscrição (gravação que falhou, ou outra conta
    // entrou neste aparelho): grava de novo, para "ligado" querer dizer que o aviso chega mesmo.
    const eu = nuvem.usuario()?.id;
    if (eu) {
      const j = sub.toJSON();
      const { error } = await nuvem.banco().from('push_inscricoes').upsert({ endpoint: j.endpoint, chaves: j.keys, user_id: eu });
      if (error?.code === RECUSADO) {
        // a inscrição deste navegador está guardada na conta do outro (ele usou este aparelho e não saiu pelo botão):
        // os avisos dele continuariam chegando aqui. Desfaz a inscrição; "Ativar" cria uma nova, desta conta.
        await sub.unsubscribe().catch(() => {});
        return 'desligado';
      }
      if (error) console.warn('avisos: a inscrição deste aparelho não está na conta:', error.message);
    }
    return 'ligado';
  } catch { return 'desligado'; }
}

/** Pede a permissão, inscreve o aparelho e guarda a inscrição na conta. Devolve '' ou o texto do problema. */
export async function ligar() {
  if (!suportado()) return 'Este navegador não recebe avisos.';
  if (!nuvem.usuario()) return 'Entre na sua conta primeiro.';
  if ((await Notification.requestPermission()) !== 'granted') return 'A permissão de avisos foi negada.';
  try {
    const { chave } = await chamar('vapid');
    const reg = await navigator.serviceWorker.ready;
    const inscrever = () => reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes(chave) });
    const guardar = (s) => { const j = s.toJSON(); return nuvem.banco().from('push_inscricoes').upsert({ endpoint: j.endpoint, chaves: j.keys, user_id: nuvem.usuario().id }); };
    let sub = (await reg.pushManager.getSubscription()) || await inscrever();
    let { error } = await guardar(sub);
    if (error?.code === RECUSADO) { // a inscrição antiga deste navegador é da outra conta: faz uma nova, desta
      await sub.unsubscribe().catch(() => {});
      sub = await inscrever();
      ({ error } = await guardar(sub));
    }
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
    const { error } = await b.from('avisos_estreia').delete().match({ user_id: eu, tmdb_id: meta.id });
    if (error) return false; // sem internet: o aviso continua ligado, e a tela diz que não deu
    marcadas.delete(meta.id);
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
  const avisar = () => { if (typeof window !== 'undefined') window.dispatchEvent(new Event('avisos:carregados')); };
  if (!eu) { avisar(); return; }
  const { data } = await nuvem.banco().from('avisos_estreia').select('tmdb_id').eq('user_id', eu);
  if (dono !== eu) return; // outra pessoa entrou enquanto a resposta vinha: os avisos dela chegam no pedido dela
  marcadas = new Set((data || []).map((x) => x.tmdb_id));
  avisar();
});
