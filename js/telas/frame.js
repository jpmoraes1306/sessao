// Frame do dia: um quadro bem de perto de um filme que VOCÊS DOIS já viram. Três chances; a cada erro a
// imagem abre mais e vem uma dica. O quadro do dia fica gravado na conta (quem abre primeiro sorteia), então
// é o mesmo para os dois. Rota: #/frame/hoje.
import * as tmdb from '../tmdb.js';
import * as dados from '../dados.js';
import * as nuvem from '../nuvem.js';
import * as social from '../social.js';
import { $, esc, hoje, toast } from '../ui.js';
import { img } from '../tmdb.js';

const ZOOM = [3.4, 2.1, 1.35]; // quanto a imagem fica ampliada na 1ª, 2ª e 3ª tentativa
const MINIMO = 8;              // filmes em comum para o jogo fazer sentido
const LOCAL = 'sessao:frame';  // tentativas erradas de hoje, para não zerar ao sair e voltar

const numeroDoDia = (iso) => Math.floor(Date.parse(`${iso}T12:00:00Z`) / 864e5);
const sorteio = (n, sal) => (Math.imul(n + sal, 2654435761) >>> 8);
/** Embaralha sempre do mesmo jeito para o mesmo dia. */
const embaralhar = (lista, dia, chave = (x) => x.id) => [...lista].sort((a, b) => sorteio(chave(a), dia) - sorteio(chave(b), dia));
const inicioDe = (titulo) => titulo.toLowerCase().replace(/^(the|a|an) /, '').split(/[\s:]/)[0];

const aviso = (titulo, texto) => `<div class="backdrop curto" style="--a:#5c4a2a;--b:#101419"></div><button class="back" data-acao="voltar" aria-label="Voltar">‹</button>
  <div class="wrap" style="gap:18px"><div class="pessoa-topo" style="margin-top:-40px"><div><div class="eyebrow">Easter egg</div><h1>Frame do dia</h1></div></div>
  <div class="vazio"><b>${titulo}</b>${texto}</div></div>`;

/** Sorteia o quadro de hoje entre os filmes que os dois viram e grava na conta. Devolve a linha gravada (a de quem chegou primeiro). */
async function sortear(b, dia) {
  if (!social.pronto()) await social.carregar();
  if (!social.pronto()) throw new Error('sem os dados do outro');
  const comuns = dados.todos().filter((t) => t.tipo === 'filme' && t.visto && social.doOutro('filme', t.id)?.visto);
  if (comuns.length < MINIMO) return { poucos: comuns.length };
  const info = await dados.resumos(comuns.map((t) => ({ tipo: 'filme', tmdb_id: t.id })));
  const filmes = comuns.map((t) => { const r = info.get(`filme:${t.id}`) || {}; return { id: t.id, titulo: t.titulo || r.titulo || '', ano: t.ano || r.ano || null }; }).filter((f) => f.titulo);
  // não repete filme dos últimos dois meses
  const desde = new Date(Date.now() - 60 * 864e5).toLocaleDateString('sv-SE');
  const { data: recentes } = await b.from('frame_dia').select('tmdb_id').gte('dia', desde);
  const usados = new Set((recentes || []).map((r) => r.tmdb_id));
  const n = numeroDoDia(dia);
  const livres = filmes.filter((f) => !usados.has(f.id));
  const fila = embaralhar(livres.length >= MINIMO ? livres : filmes, n);
  for (const certo of fila.slice(0, 12)) {
    const cenas = await tmdb.cenasDoFilme(certo.id).catch(() => []);
    if (cenas.length < 2) continue;
    // opções erradas: da mesma época quando dá, sem franquia repetida (dois "Harry Potter" entregam a resposta)
    const erradas = [];
    const perto = embaralhar(filmes.filter((f) => f.id !== certo.id && Math.abs((f.ano || 0) - (certo.ano || 0)) <= 10), n + 1);
    const resto = embaralhar(filmes.filter((f) => f.id !== certo.id), n + 2);
    for (const f of [...perto, ...resto]) {
      if (erradas.length === 3) break;
      if ([certo, ...erradas].some((x) => x.id === f.id || inicioDe(x.titulo) === inicioDe(f.titulo))) continue;
      erradas.push(f);
    }
    if (erradas.length < 3) continue;
    const linha = {
      dia, tmdb_id: certo.id, imagem: cenas[sorteio(n, 3) % Math.min(cenas.length, 8)],
      foco: `${30 + (sorteio(n, 5) % 41)}% ${30 + (sorteio(n, 9) % 31)}%`,
      opcoes: [certo, ...erradas].sort((a, c) => a.titulo.localeCompare(c.titulo)),
    };
    await b.from('frame_dia').upsert(linha, { onConflict: 'dia', ignoreDuplicates: true });
    const { data } = await b.from('frame_dia').select('*').eq('dia', dia).maybeSingle();
    return data || linha;
  }
  return { poucos: 0 };
}

export async function abrir(el, _id, ctx) {
  const u = nuvem.usuario();
  const o = u ? nuvem.outro() : null;
  if (!u || !o) { el.innerHTML = aviso('É um jogo para os dois', 'Entre na sua conta para jogar. O quadro sai dos filmes que você e o outro já viram.<div class="actions"><a class="btn small" href="#/perfil">Abrir o Perfil</a></div>'); return; }
  const b = nuvem.banco();
  const dia = hoje();
  let F; let jogadas; let mes;
  try {
    const { data } = await b.from('frame_dia').select('*').eq('dia', dia).maybeSingle();
    F = data || await sortear(b, dia);
    if (!ctx.vivo()) return;
    if (F.poucos != null) { el.innerHTML = aviso('Ainda faltam filmes em comum', `O jogo usa só filmes que os dois já viram, e precisa de pelo menos ${MINIMO} com cena no TMDB.`); return; }
    const { data: linhas, error } = await b.from('frame_jogadas').select('dia, user_id, tentativas, acertou').gte('dia', `${dia.slice(0, 7)}-01`);
    if (error) throw error;
    mes = linhas || [];
    jogadas = mes.filter((j) => j.dia === dia);
  } catch (erro) {
    console.warn('frame do dia:', erro);
    if (ctx.vivo()) el.innerHTML = aviso('Não deu para carregar', 'Confira a internet e tente de novo.<div class="actions"><button class="btn small" data-acao="recarregar">Tentar de novo</button></div>');
    return;
  }
  if (!ctx.vivo()) return;

  const certo = F.opcoes.find((x) => x.id === F.tmdb_id);
  let minha = jogadas.find((j) => j.user_id === u.id) || null;
  let erradas = [];
  // o aparelho guarda as tentativas de hoje e o resultado; se a gravação na conta falhar, o resultado vale
  // mesmo assim (não dá para jogar de novo) e sobe na próxima vez que a tela abrir
  const guardar = (fim) => { try { localStorage.setItem(LOCAL, JSON.stringify({ dia, de: u.id, erradas, ...(fim ? { fim } : {}) })); } catch { /* vale só nesta visita */ } };
  const gravar = async () => {
    const { error } = await b.from('frame_jogadas').upsert(minha, { onConflict: 'dia,user_id', ignoreDuplicates: true });
    return !error;
  };
  try {
    const g = JSON.parse(localStorage.getItem(LOCAL) || 'null');
    if (g?.dia === dia && g.de === u.id) {
      erradas = [...new Set(g.erradas || [])].filter((id) => F.opcoes.some((x) => x.id === id && id !== F.tmdb_id)).slice(0, 3);
      const fim = g.fim || (erradas.length >= 3 ? { tentativas: 3, acertou: false } : null);
      if (!minha && fim) {
        minha = { dia, user_id: u.id, tentativas: Math.min(3, Math.max(1, Number(fim.tentativas) || 3)), acertou: Boolean(fim.acertou) };
        jogadas.push(minha); mes.push(minha);
        gravar();
      }
    }
  } catch { /* começa do zero */ }
  let diretor = '';
  const buscarDiretor = () => dados.resumos([{ tipo: 'filme', tmdb_id: F.tmdb_id }]).then((m) => { diretor = m.get(`filme:${F.tmdb_id}`)?.diretores?.[0]?.nome || ''; }).catch(() => {});
  if (erradas.length === 2 || minha) await buscarDiretor();
  if (!ctx.vivo()) return;

  const resultado = (j, quem) => (!j ? `${quem} ainda não jogou` : j.acertou ? `${quem} acertou na ${j.tentativas}ª tentativa` : `${quem} errou as três`);
  /** ntes = ampliação que estava na tela, para a imagem abrir com movimento em vez de trocar de uma vez. */
  function desenhar(antes) {
    const fim = Boolean(minha);
    const n = erradas.length;
    const dica = fim ? `<a href="#/filme/${Number(certo.id)}">${esc(certo.titulo)}</a>${certo.ano ? ` (${Number(certo.ano)})` : ''}${diretor ? `, de ${esc(diretor)}` : ''}.`
      : n === 0 ? '' : `Dica: é de ${Number(certo.ano) || 'ano desconhecido'}${n === 2 && diretor ? `, direção de ${esc(diretor)}` : ''}.`;
    const dele = jogadas.find((j) => j.user_id === o.id);
    const pontos = (id) => mes.filter((j) => j.user_id === id && j.acertou).length;
    const [eu, ele] = [pontos(u.id), pontos(o.id)];
    const nomeMes = new Date(`${dia}T12:00:00`).toLocaleDateString('pt-BR', { month: 'long' });
    el.innerHTML = `<div class="backdrop curto" style="--a:#5c4a2a;--b:#101419"></div><button class="back" data-acao="voltar" aria-label="Voltar">‹</button>
    <div class="wrap" style="gap:16px"><div class="pessoa-topo" style="margin-top:-40px"><div><div class="eyebrow">Easter egg</div><h1>Frame do dia</h1></div></div>
      <p class="sub2" style="display:block">De que filme é este quadro? É um dos que você e ${esc(o.nome)} já viram. São 3 chances, e a cada erro a imagem abre mais.</p>
      <div class="frame"><img src="${esc(img(F.imagem, 'w1280'))}" alt="Quadro de um filme para adivinhar" crossorigin="anonymous" draggable="false" style="transform:scale(${fim ? 1 : ZOOM[n]});transform-origin:${esc(F.foco)}">
        <span class="conta">${fim ? (minha.acertou ? `Acertou na ${minha.tentativas}ª` : 'Não foi dessa vez') : `Tentativa ${n + 1} de 3`}</span></div>
      <p class="dica" aria-live="polite">${dica}</p>
      <div class="grupo">${F.opcoes.map((x) => `<button class="lin op${fim && x.id === certo.id ? ' certa' : ''}" data-op="${Number(x.id)}" ${fim || erradas.includes(x.id) ? 'disabled' : ''}><span class="n">${esc(x.titulo)}</span></button>`).join('')}</div>
      ${fim ? `<section><h2>Placar <small>acertos em ${nomeMes}</small></h2>
        <div class="placar"><div class="${eu > ele ? 'lider' : ''}"><b>${eu}</b>você</div><span>${nomeMes}</span><div class="${ele > eu ? 'lider' : ''}"><b>${ele}</b>${esc(o.nome)}</div></div>
        <div class="grupo"><div class="lin"><span class="n">Hoje<small>${resultado(minha, 'Você')} · ${esc(resultado(dele, o.nome))}</small></span></div></div></section>
        <p class="note">Amanhã tem outro quadro. O jogo só usa filmes que os dois já viram.</p>` : ''}
    </div>`;
    const foto = $('.frame img', el);
    if (antes && foto) {
      const final = foto.style.transform;
      foto.style.transition = 'none';
      foto.style.transform = `scale(${antes})`;
      foto.getBoundingClientRect(); // aplica o tamanho de antes para a mudança ser animada
      foto.style.transition = '';
      foto.style.transform = final;
    }
  }

  let ocupado = false; // um toque por vez: dois toques seguidos na mesma opção não gastam duas tentativas
  el.onclick = async (e) => {
    const bt = e.target.closest('button[data-op]');
    if (!bt || minha || ocupado) return;
    const id = Number(bt.dataset.op);
    if (erradas.includes(id)) return;
    ocupado = true;
    try {
      const acertou = id === F.tmdb_id;
      const antes = ZOOM[erradas.length];
      if (!acertou) { erradas.push(id); guardar(); }
      if (acertou || erradas.length >= 3) {
        minha = { dia, user_id: u.id, tentativas: acertou ? erradas.length + 1 : 3, acertou };
        guardar({ tentativas: minha.tentativas, acertou });
        jogadas.push(minha); mes.push(minha);
        const rolagem = el.scrollTop;
        await buscarDiretor();
        if (ctx.vivo()) { desenhar(antes); el.scrollTop = rolagem; }
        if (!(await gravar()) && ctx.vivo()) toast('Sem internet para mandar o resultado. Ele fica guardado e sobe quando você abrir o jogo de novo.');
        return;
      }
      if (erradas.length === 2) await buscarDiretor();
      if (!ctx.vivo()) return;
      const rolagem = el.scrollTop;
      desenhar(antes);
      el.scrollTop = rolagem;
    } finally { ocupado = false; }
  };

  desenhar();
}
