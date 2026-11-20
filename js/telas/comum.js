// Pedaços que a ficha do filme e a página da série têm em comum na fase 3:
// a nota do outro, "Queremos ver juntos", a estrela de favorito e as reviews de vocês dois.
import * as nuvem from '../nuvem.js';
import * as dados from '../dados.js';
import * as social from '../social.js';
import * as curiosidades from '../curiosidades.js';
import { $, esc, nota, notaMinha, dataBR, toast, perguntar, corDe, hoje, IC } from '../ui.js';

const avatar = (p) => {
  const [a, b] = corDe(p.nome);
  return `<span class="ph sm" style="--a:${a};--b:${b}">${esc((p.nome || '?')[0])}${p.foto ? `<img src="${esc(p.foto)}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}</span>`;
};

/** Linha "Thiago deu 8" (só para consulta), com a média de vocês dois quando os dois deram nota. */
function linhaDoOutro(tipo, id) {
  const o = nuvem.outro();
  if (!o) return '';
  const dele = social.doOutro(tipo, id);
  const minha = dados.titulo(tipo, id).nota;
  let frase;
  if (dele?.nota != null) frase = `deu <span class="selo">${notaMinha(dele.nota)}</span>${dele.curtido ? ' <span class="heart">♥</span>' : ''}${dele.temReview ? ' · escreveu review' : ''}`;
  else if (dele?.visto) frase = `viu, sem nota${dele.curtido ? ' <span class="heart">♥</span>' : ''}`;
  else if (dele?.seguindo) frase = 'está acompanhando';
  else if (dele?.quer) frase = 'também quer ver';
  else frase = 'ainda não viu';
  const media = minha != null && dele?.nota != null ? `<span class="media">média de vocês ${nota((minha + dele.nota) / 2)}</span>` : '';
  return `<div class="lin">${avatar(o)}<span class="n">${esc(o.nome)}</span><span class="det">${frase}${media}</span></div>`;
}

/** Grupo "vocês dois" da ficha (só com login): a nota do outro e a chave "Queremos ver juntos". */
export function grupoSocial(meta) {
  if (!nuvem.usuario()) return '';
  const j = social.estaEmJuntos(meta.tipo, meta.id);
  return `<div class="grupo">${linhaDoOutro(meta.tipo, meta.id)}
    <button class="lin" data-acao="juntos" role="switch" aria-checked="${j}"><span class="n">Queremos ver juntos<small>Entra na lista Juntos, do Quero ver</small></span><span class="chave${j ? ' on' : ''}"></span></button>
  </div>`;
}
/** Botão de estrela da ficha, ao lado de Curtir e Quero ver: põe ou tira dos 4 favoritos do perfil. */
export function botaoFavorito(meta) {
  const f = dados.ehFavorito(meta.tipo, meta.id);
  return `<button class="act star ${f ? 'on' : ''}" data-acao="favorito" aria-pressed="${f}">${IC.estrela}${f ? 'Favorito' : 'Favoritar'}</button>`;
}
/** Botão "Vi de novo" (só com login e para o que a pessoa já viu): registra a sessão de hoje no diário como revista. */
export function botaoRever(m) {
  if (!nuvem.usuario() || !(m.visto || m.nota != null)) return '';
  if (m.revistoEm === hoje()) return `<button class="btn small on-seen rever" data-acao="desfazer-rever">${IC.rever}Visto de novo hoje · desfazer</button>`;
  if (m.vistoEm === hoje()) return ''; // viu hoje pela primeira vez: a sessão de hoje já está no diário
  return `<button class="btn small rever" data-acao="rever">${IC.rever}Vi de novo</button>`;
}

/** Trata os toques nos botões extras. Devolve true se o toque era de um deles. */
export async function tocarExtra(acao, meta, botao) {
  if (acao === 'rever' || acao === 'desfazer-rever') {
    botao.disabled = true;
    const ok = acao === 'rever' ? await dados.verDeNovo(meta) : await dados.desfazerVerDeNovo(meta);
    toast(!ok ? 'Não deu para gravar. Confira a internet.' : acao === 'rever' ? 'Entrou no diário de hoje como visto de novo' : 'Saiu do diário de hoje');
    return true;
  }
  if (acao === 'juntos') {
    const sim = !social.estaEmJuntos(meta.tipo, meta.id);
    const ok = await social.marcarJuntos(meta, sim);
    toast(!ok ? 'Não deu para gravar' : sim ? 'Entrou em "Queremos ver juntos"' : 'Saiu de "Queremos ver juntos"');
    return true;
  }
  if (acao === 'favorito') {
    const era = dados.ehFavorito(meta.tipo, meta.id);
    const ok = dados.alternarFavorito(meta);
    if (ok) { toast(era ? 'Saiu dos favoritos' : 'Entrou nos seus favoritos. Aparece no seu perfil.'); return true; }
    // já são 4: a pessoa escolhe qual sai, na tela de favoritos
    const trocar = await perguntar({ titulo: 'Você já tem 4 favoritos', texto: `Para pôr ${meta.titulo}, tire um dos quatro.`, sim: 'Escolher qual sai', nao: 'Deixar como está' });
    if (trocar) location.hash = '#/editar/favoritos';
    return true;
  }
  return false;
}

/**
 * Seção "Reviews de vocês": a sua (com editor) e a do outro (só leitura, com curtir).
 * Preenche o elemento #reviews-nossas da ficha e cuida dos próprios toques.
 */
export async function montarReviews(el, ctx, meta, aoSalvar = () => {}) {
  const sec = $('#reviews-nossas', el);
  if (!sec || !nuvem.usuario()) return;
  let lista = [];
  let editando = false;
  let spoilerAberto = false;

  // manterRascunho: o que a pessoa está digitando continua na caixa quando a seção é refeita (chegaram as
  // reviews, ela curtiu a do outro...). Só não vale ao salvar, cancelar ou abrir para editar.
  // Conversa embaixo de uma review: os comentários de vocês dois e a caixa para escrever. `r` é a linha da review.
  const conversa = (r) => {
    if (!r) return '';
    const escondida = r.spoiler && !r.eu && !spoilerAberto; // a conversa de uma review com spoiler só abre junto com ela
    if (escondida) return '';
    return `<div class="coms">${(r.comentarios || []).map((c) => `<div class="com"><div class="who"><b>${c.eu ? 'Você' : esc(c.nome)}</b><span>${dataBR(c.criado_em)}${c.eu ? ` · <button class="texto" data-acao="apagar-comentario" data-id="${Number(c.id)}" data-autor="${esc(r.user_id)}">apagar</button>` : ''}</span></div><div class="txt">${esc(c.texto)}</div></div>`).join('')}
      <div class="com-novo"><input class="com-campo" data-comentario="${esc(r.user_id)}" maxlength="1000" autocomplete="off" placeholder="${r.eu ? 'Responder…' : 'Comentar…'}" aria-label="${r.eu ? 'Responder na sua review' : `Comentar a review de ${esc(r.nome)}`}"><button class="btn small" data-acao="comentar" data-autor="${esc(r.user_id)}">Enviar</button></div></div>`;
  };

  const desenhar = (manterRascunho = true) => {
    const rascunho = manterRascunho ? $('#minha-review', sec)?.value : null;
    const spoilerMarcado = manterRascunho ? $('#tem-spoiler', sec)?.checked : null;
    // o que a pessoa está escrevendo num comentário também continua na caixa (e o cursor fica onde estava)
    const comentando = new Map([...sec.querySelectorAll('[data-comentario]')].map((c) => [c.dataset.comentario, c.value]));
    const focoEm = document.activeElement?.dataset?.comentario || null;
    const minha = dados.titulo(meta.tipo, meta.id);
    const dele = lista.find((r) => !r.eu);
    const minhaLinha = lista.find((r) => r.eu);
    const cartaoDele = dele ? `<div class="fact"><div class="who"><b>${esc(dele.nome)}</b><span>${dele.nota != null ? `<span class="selo">${notaMinha(dele.nota)}</span> · ` : ''}${dataBR(dele.review_em || '')}</span></div>
        ${dele.spoiler && !spoilerAberto ? '<button class="btn small" data-acao="abrir-spoiler">⚠ Tem spoiler. Mostrar</button>' : `<div class="txt">${esc(dele.review)}</div>`}
        <div class="actions" style="margin-top:8px"><button class="btn small ${dele.curtidaPorMim ? 'on-like' : ''}" data-acao="curtir-review" data-autor="${dele.user_id}">${dele.curtidaPorMim ? '♥ Você curtiu' : '♡ Curtir'}</button></div>${conversa(dele)}</div>` : '';
    const meuTexto = minha.review || '';
    const meuCartao = meuTexto && !editando
      ? `<div class="fact"><div class="who"><b>Você</b><span>${minha.nota != null ? `<span class="selo">${notaMinha(minha.nota)}</span> · ` : ''}${dataBR(minha.reviewEm || '')}${minha.spoiler ? ' · ⚠ spoiler' : ''}</span></div><div class="txt">${esc(meuTexto)}</div>
          <div class="actions" style="margin-top:8px"><button class="btn small" data-acao="editar-review">Editar</button>${minhaLinha?.curtidaPeloOutro ? `<span class="note heart">♥ ${esc(nuvem.outro()?.nome || '')} curtiu</span>` : ''}</div>${conversa(minhaLinha)}</div>`
      : `<textarea class="field" id="minha-review" placeholder="O que você achou?">${esc(meuTexto)}</textarea>
          <div class="actions" style="justify-content:space-between;align-items:center"><label class="check"><input type="checkbox" id="tem-spoiler" ${minha.spoiler ? 'checked' : ''}> Contém spoiler</label>
          <span class="actions">${meuTexto ? '<button class="btn small" data-acao="cancelar-review">Cancelar</button>' : ''}<button class="btn small on-seen" data-acao="salvar-review">Salvar review</button></span></div>`;
    sec.innerHTML = `<h2>Reviews de vocês</h2><div class="facts">${cartaoDele}${meuCartao}</div>`;
    if (rascunho != null && $('#minha-review', sec)) { $('#minha-review', sec).value = rascunho; $('#tem-spoiler', sec).checked = Boolean(spoilerMarcado); }
    for (const c of sec.querySelectorAll('[data-comentario]')) {
      if (comentando.get(c.dataset.comentario)) c.value = comentando.get(c.dataset.comentario);
      if (focoEm === c.dataset.comentario) c.focus();
    }
  };

  sec.onclick = async (e) => {
    const b = e.target.closest('button[data-acao]');
    if (!b) return;
    const acao = b.dataset.acao;
    if (acao === 'salvar-review') {
      const texto = $('#minha-review', sec).value;
      const tinha = Boolean(dados.titulo(meta.tipo, meta.id).review);
      if (!texto.trim() && !tinha) { toast('Escreva a review antes de salvar'); return; }
      dados.salvarReview(meta, texto, $('#tem-spoiler', sec).checked);
      editando = false;
      // a review nova já ganha a conversa embaixo, sem esperar a próxima visita à ficha
      const eu = nuvem.usuario();
      if (texto.trim() && !lista.some((r) => r.eu)) lista.push({ user_id: eu.id, eu: true, nome: eu.nome, comentarios: [] });
      toast(texto.trim() ? 'Review salva' : 'Review apagada');
      aoSalvar();
    } else if (acao === 'editar-review') editando = true;
    else if (acao === 'cancelar-review') editando = false;
    else if (acao === 'abrir-spoiler') spoilerAberto = true;
    else if (acao === 'curtir-review') {
      const r = lista.find((x) => x.user_id === b.dataset.autor);
      r.curtidaPorMim = !r.curtidaPorMim;
      social.curtirReview(meta.tipo, meta.id, r.user_id, r.curtidaPorMim);
    } else if (acao === 'comentar') {
      e.stopPropagation();
      const campo = sec.querySelector(`[data-comentario="${CSS.escape(b.dataset.autor)}"]`);
      const r = lista.find((x) => x.user_id === b.dataset.autor);
      if (!campo || !r) return;
      if (!campo.value.trim()) { toast('Escreva o comentário antes de enviar'); campo.focus(); return; }
      b.disabled = true;
      const novo = await social.comentarReview(meta.tipo, meta.id, r.user_id, campo.value);
      if (!ctx.vivo()) return;
      if (!novo) { b.disabled = false; toast('Não deu para enviar. Confira a internet.'); return; }
      r.comentarios = [...(r.comentarios || []), novo];
      campo.value = '';
      toast('Comentário enviado');
      desenhar();
      return;
    } else if (acao === 'apagar-comentario') {
      e.stopPropagation();
      const r = lista.find((x) => x.user_id === b.dataset.autor);
      const ok = await social.apagarComentario(Number(b.dataset.id));
      if (!ctx.vivo()) return;
      if (!ok) { toast('Não deu para apagar'); return; }
      if (r) r.comentarios = (r.comentarios || []).filter((c) => c.id !== Number(b.dataset.id));
      toast('Comentário apagado');
      desenhar();
      return;
    } else return;
    e.stopPropagation();
    desenhar(!['salvar-review', 'cancelar-review', 'editar-review'].includes(acao));
  };

  // Enter na caixa de comentário envia
  sec.onkeydown = (e) => {
    if (e.key !== 'Enter' || !e.target.dataset?.comentario) return;
    e.preventDefault();
    sec.querySelector(`[data-acao="comentar"][data-autor="${CSS.escape(e.target.dataset.comentario)}"]`)?.click();
  };

  desenhar();
  try { lista = await social.reviews(meta.tipo, meta.id); } catch { lista = []; }
  if (ctx.vivo()) desenhar();
}

/**
 * Seção "Curiosidades e bastidores": fatos do Wikidata e o texto das seções da Wikipédia,
 * dentro do app. Preenche o elemento #curiosidades e some se não houver nada.
 */
export async function montarCuriosidades(el, ctx, imdbId) {
  const sec = $('#curiosidades', el);
  if (!sec || !imdbId) return;
  let c;
  try { c = await curiosidades.buscar(imdbId); } catch { return; }
  if (!ctx.vivo() || !c || !(c.fatos.length + c.secoes.length)) return;
  const abertas = new Set();
  const corpo = (texto) => texto.split('\n\n').map((l) => (l.startsWith('## ') ? `<h4>${esc(l.slice(3))}</h4>` : `<p>${esc(l)}</p>`)).join('');
  const desenhar = () => {
    sec.hidden = false;
    sec.innerHTML = `<h2>Curiosidades e bastidores</h2>
      ${c.fatos.length ? `<div class="facts">${c.fatos.map((f) => `<div class="fact"><em>${esc(f.rotulo)}</em>${esc(f.texto)}</div>`).join('')}</div>` : ''}
      ${c.secoes.map((s, i) => `<div class="temp${abertas.has(i) ? ' aberta' : ''}"><button class="temp-h" data-acao="curiosidade" data-i="${i}" style="grid-template-columns:1fr auto" aria-expanded="${abertas.has(i)}">
          <div><div class="t">${esc(s.titulo)}</div><div class="s">${s.lingua === 'en' ? 'em inglês · ' : ''}${Math.max(1, Math.round(s.texto.split(' ').length / 200))} min de leitura</div></div><span class="seta">›</span></button>
          ${abertas.has(i) ? `<div class="temp-c wiki">${corpo(s.texto)}</div>` : ''}</div>`).join('')}
      <p class="note">${c.secoes.length ? 'Texto: Wikipédia (licença CC BY-SA). ' : ''}${c.fatos.length ? 'Fatos: Wikidata.' : ''}</p>`;
  };
  sec.onclick = (e) => {
    const b = e.target.closest('button[data-acao="curiosidade"]');
    if (!b) return;
    e.stopPropagation();
    const i = Number(b.dataset.i);
    if (abertas.has(i)) abertas.delete(i); else abertas.add(i);
    desenhar();
  };
  desenhar();
}

/** Tela de quem ainda não tem as chaves. Sem login, o caminho é entrar: as chaves vêm da conta. */
export function semChaves(el) {
  if (nuvem.usuario() || !nuvem.disponivel()) {
    el.innerHTML = '<div class="vazio"><b>Falta a chave do TMDB</b>O Sessão busca filmes e séries direto no TMDB. Cole a chave no Perfil para começar.<a class="btn small" href="#/perfil">Abrir o Perfil</a></div>';
    return;
  }
  el.innerHTML = '<div class="vazio"><b>Entre para começar</b>O Sessão é de uso pessoal: só as contas Google cadastradas entram. Depois de entrar, suas notas, listas e diário aparecem aqui.<button class="btn small on-seen" data-acao="entrar-google">Entrar com o Google</button></div>';
  $('[data-acao="entrar-google"]', el).onclick = async (e) => {
    e.currentTarget.disabled = true;
    try { await nuvem.entrar(); } catch { e.target.disabled = false; toast('Não deu para abrir o login'); }
  };
}