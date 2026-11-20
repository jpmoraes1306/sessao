// Pedaços que a ficha do filme e a página da série têm em comum na fase 3:
// a nota do outro, "Queremos ver juntos", favorito e as reviews de vocês dois.
import * as nuvem from '../nuvem.js';
import * as dados from '../dados.js';
import * as social from '../social.js';
import * as curiosidades from '../curiosidades.js';
import { $, esc, nota, notaMinha, dataBR, dataCurta, proximaTerca, toast, corDe } from '../ui.js';

const avatar = (p) => {
  const [a, b] = corDe(p.nome);
  return `<span class="ph sm" style="--a:${a};--b:${b}">${esc((p.nome || '?')[0])}${p.foto ? `<img src="${esc(p.foto)}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}</span>`;
};

/** Linha "Thiago deu 8" (sempre visível, só para consulta) + a média de vocês dois. */
export function blocoDupla(tipo, id) {
  const o = nuvem.usuario() && nuvem.outro();
  if (!o) return '';
  const dele = social.doOutro(tipo, id);
  const minha = dados.titulo(tipo, id).nota;
  let frase;
  if (dele?.nota != null) frase = `deu <span class="selo">${notaMinha(dele.nota)}</span>${dele.curtido ? ' <span class="heart">♥</span>' : ''}${dele.temReview ? ' · escreveu review' : ''}`;
  else if (dele?.visto) frase = `viu, sem nota${dele.curtido ? ' <span class="heart">♥</span>' : ''}`;
  else if (dele?.seguindo) frase = 'está acompanhando';
  else if (dele?.quer) frase = '<span style="color:var(--list)">quer ver</span>';
  else frase = `ainda não ${tipo === 'serie' ? 'viu' : 'viu'}`;
  const media = minha != null && dele?.nota != null ? `<span class="media">média de vocês <b>${nota((minha + dele.nota) / 2)}</b></span>` : '';
  return `<div class="dupla">${avatar(o)}<div><b>${esc(o.nome)}</b> ${frase}</div>${media}</div>`;
}

/** Botões "Queremos ver juntos" e "Favorito" (só com login). */
export function botoesExtras(meta, opc = {}) {
  if (!nuvem.usuario()) return '';
  const j = social.estaEmJuntos(meta.tipo, meta.id);
  const f = dados.ehFavorito(meta.tipo, meta.id);
  // sessão para verem juntos: a data sugerida é a primeira terça a partir da estreia (ou de hoje)
  let sessao = '';
  if (meta.tipo === 'filme' && nuvem.outro()) {
    const x = social.sessaoDe(meta.tipo, meta.id);
    const terca = proximaTerca(opc.estreia || '');
    if (!x) sessao = `<button class="btn small" data-acao="sessao" data-data="${terca}">Marcar sessão: ${dataCurta(terca)}</button>`;
    else if (social.estadoDaSessao(x) === 'futura') sessao = `<button class="btn small on-list" data-acao="cancelar-sessao">✓ Sessão ${dataCurta(x.data)} · cancelar</button>`;
    else sessao = `<button class="btn small on-seen" data-acao="vimos-juntos">${social.estadoDaSessao(x) === 'confirmar' ? 'Confirmar que vi junto' : 'Vimos juntos'} · ${dataCurta(x.data)}</button>`;
  }
  return `<div class="actions"><button class="btn small ${j ? 'on-list' : ''}" data-acao="juntos">${j ? '✓ Na lista "juntos"' : '+ Queremos ver juntos'}</button>
    <button class="btn small ${f ? 'on-star' : ''}" data-acao="favorito">${f ? '★ Nos seus favoritos' : '☆ Favorito'}</button>${sessao}</div>`;
}

/** Trata os toques nos botões extras. Devolve true se o toque era de um deles. */
export async function tocarExtra(acao, meta, botao) {
  if (acao === 'sessao') {
    const ok = await social.marcarSessao(meta, botao.dataset.data);
    toast(ok ? `Sessão marcada para ${dataCurta(botao.dataset.data)}` : 'Não deu para gravar');
    return true;
  }
  if (acao === 'cancelar-sessao' || acao === 'vimos-juntos') {
    const x = social.sessaoDe(meta.tipo, meta.id);
    if (!x) return true;
    if (acao === 'cancelar-sessao') { await social.cancelarSessao(x.id); toast('Sessão cancelada'); } else {
      const ok = await social.vimosJuntos(x, meta);
      toast(ok ? 'Entrou no seu diário. Agora é só dar a nota.' : 'Não deu para gravar');
    }
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
    toast(!ok ? 'Você já tem 4 favoritos. Tire um antes.' : era ? 'Saiu dos favoritos' : 'Entrou nos seus favoritos');
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

  const desenhar = () => {
    const minha = dados.titulo(meta.tipo, meta.id);
    const dele = lista.find((r) => !r.eu);
    const minhaLinha = lista.find((r) => r.eu);
    const cartaoDele = dele ? `<div class="fact"><div class="who"><b>${esc(dele.nome)}</b><span>${dele.nota != null ? `<span class="selo">${notaMinha(dele.nota)}</span> · ` : ''}${dataBR(dele.review_em || '')}</span></div>
        ${dele.spoiler && !spoilerAberto ? '<button class="btn small" data-acao="abrir-spoiler">⚠ Tem spoiler. Mostrar</button>' : `<div class="txt">${esc(dele.review)}</div>`}
        <div class="actions" style="margin-top:8px"><button class="btn small ${dele.curtidaPorMim ? 'on-like' : ''}" data-acao="curtir-review" data-autor="${dele.user_id}">${dele.curtidaPorMim ? '♥ Você curtiu' : '♡ Curtir'}</button></div></div>` : '';
    const meuTexto = minha.review || '';
    const meuCartao = meuTexto && !editando
      ? `<div class="fact"><div class="who"><b>Você</b><span>${minha.nota != null ? `<span class="selo">${notaMinha(minha.nota)}</span> · ` : ''}${dataBR(minha.reviewEm || '')}${minha.spoiler ? ' · ⚠ spoiler' : ''}</span></div><div class="txt">${esc(meuTexto)}</div>
          <div class="actions" style="margin-top:8px"><button class="btn small" data-acao="editar-review">Editar</button>${minhaLinha?.curtidaPeloOutro ? `<span class="note heart">♥ ${esc(nuvem.outro()?.nome || '')} curtiu</span>` : ''}</div></div>`
      : `<textarea class="field" id="minha-review" placeholder="O que você achou?">${esc(meuTexto)}</textarea>
          <div class="actions" style="justify-content:space-between;align-items:center"><label class="check"><input type="checkbox" id="tem-spoiler" ${minha.spoiler ? 'checked' : ''}> Contém spoiler</label>
          <span class="actions">${meuTexto ? '<button class="btn small" data-acao="cancelar-review">Cancelar</button>' : ''}<button class="btn small on-seen" data-acao="salvar-review">Salvar review</button></span></div>`;
    sec.innerHTML = `<h2>Reviews de vocês</h2><div class="facts">${cartaoDele}${meuCartao}</div>`;
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
      toast(texto.trim() ? 'Review salva' : 'Review apagada');
      aoSalvar();
    } else if (acao === 'editar-review') editando = true;
    else if (acao === 'cancelar-review') editando = false;
    else if (acao === 'abrir-spoiler') spoilerAberto = true;
    else if (acao === 'curtir-review') {
      const r = lista.find((x) => x.user_id === b.dataset.autor);
      r.curtidaPorMim = !r.curtidaPorMim;
      social.curtirReview(meta.tipo, meta.id, r.user_id, r.curtidaPorMim);
    } else return;
    e.stopPropagation();
    desenhar();
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