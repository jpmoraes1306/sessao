// Montar ou editar o seu ranking de uma pessoa (diretor, ator...). Rota: #/ranking/pessoa-ID.
// Começa pela ordem das suas notas; arrasta pelo ícone de duas linhas para trocar. Só entram títulos que você já viu.
import * as tmdb from '../tmdb.js';
import * as dados from '../dados.js';
import * as nuvem from '../nuvem.js';
import * as rankings from '../rankings.js';
import { $, $$, esc, poster, erroFicha, toast, perguntar } from '../ui.js';

const MENOS = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 12h12"/></svg>';
const MAIS = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 6v12M6 12h12"/></svg>';
const PEGA = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 9h14M5 15h14"/></svg>';
const ALTURA = 64; // altura de cada linha, igual à do CSS (.rk.ed .rk-l)
const K = (x) => `${x.tipo}:${x.id}`;

export async function abrir(el, rota, ctx) {
  const id = rota.split('-')[1];
  if (!nuvem.usuario()) { el.innerHTML = '<button class="back" data-acao="voltar" aria-label="Voltar">‹</button><div class="wrap" style="padding-top:90px"><div class="vazio"><b>Entre na sua conta</b>O ranking fica guardado na conta, para vocês dois verem.<div class="actions"><a class="btn small" href="#/perfil">Abrir o Perfil</a></div></div></div>'; return; }
  let p; let existente;
  try {
    p = await tmdb.pessoa(id);
    existente = (await rankings.daPessoa(p)).find((l) => l.user_id === nuvem.usuario().id) || null;
  } catch (erro) { if (ctx.vivo()) el.innerHTML = erroFicha(erro); return; }
  if (!ctx.vivo()) return;

  const vistos = rankings.vistosDaPessoa(p).map((c) => ({ tipo: c.tipo, id: c.id, titulo: c.titulo, ano: c.ano, poster: c.poster }));
  const info = new Map(vistos.map((c) => [K(c), c]));
  // itens de um ranking antigo que não estão entre os vistos (ex.: veio do Letterboxd) continuam na lista
  for (const i of existente?.itens || []) if (!info.has(`${i.tipo}:${i.tmdb_id}`)) info.set(`${i.tipo}:${i.tmdb_id}`, { tipo: i.tipo, id: i.tmdb_id, titulo: i.r.titulo || 'Sem título', ano: i.r.ano, poster: i.r.poster });
  const notaDe = (c) => dados.titulo(c.tipo, c.id).nota ?? null;
  const pelaNota = (lista) => [...lista].sort((a, b) => (notaDe(b) ?? -1) - (notaDe(a) ?? -1) || (b.ano || 0) - (a.ano || 0));
  let ordem = existente ? existente.itens.map((i) => info.get(`${i.tipo}:${i.tmdb_id}`)) : pelaNota(vistos.filter((c) => notaDe(c) != null));
  let mudou = !existente;
  let salvando = false;

  const sub = (c) => `${c.ano || ''}${notaDe(c) != null ? ` · sua nota <i>${notaDe(c)}</i>` : ' · sem nota'}`;
  function desenhar() {
    const dentro = new Set(ordem.map(K));
    const fora = pelaNota([...info.values()].filter((c) => !dentro.has(K(c))));
    el.innerHTML = `<div class="barra-ed"><button data-acao="voltar">Cancelar</button><b>Seu ranking</b><button data-rk="salvar" ${salvando ? 'disabled' : ''}>Salvar</button></div>
    <div class="wrap" style="gap:22px;padding-top:6px">
      <section><p class="sub2" style="display:block">${esc(p.nome)}. Segure no ícone de duas linhas e arraste para trocar a ordem.</p>
        ${ordem.length ? `<div class="rk ed" id="lista-ed">${ordem.map((c, i) => `<div class="rk-l" data-k="${K(c)}">
          <button class="tira" data-tira="${K(c)}" aria-label="Tirar ${esc(c.titulo)} do ranking">${MENOS}</button><span class="pos">${i + 1}</span>${poster(c, { tam: 'w154' })}
          <div class="tt"><b>${esc(c.titulo)}</b><span>${sub(c)}</span></div>
          <button class="pega-l" aria-label="Mover ${esc(c.titulo)}, posição ${i + 1}. Use as setas para cima e para baixo.">${PEGA}</button></div>`).join('')}</div>` : '<p class="note">Nenhum título no ranking. Adicione pelos botões de baixo.</p>'}
        ${ordem.length > 1 ? '<button class="texto" data-rk="pela-nota" style="align-self:flex-start">Ordenar pelas minhas notas</button>' : ''}
      </section>
      ${fora.length ? `<section><h2>Fora do ranking</h2><div class="rk fora">${fora.map((c) => `<div class="rk-l">
          <button class="poe" data-poe="${K(c)}" aria-label="Pôr ${esc(c.titulo)} no ranking">${MAIS}</button>${poster(c, { tam: 'w154' })}
          <div class="tt"><b>${esc(c.titulo)}</b><span>${sub(c)}</span></div></div>`).join('')}</div></section>` : ''}
      <p class="note">Só entram títulos que você já viu. Ao salvar, o ranking aparece para vocês dois na página de ${esc(p.nome)}.</p>
      ${existente ? '<button class="texto" data-rk="apagar" style="align-self:flex-start;color:var(--rt)">Apagar este ranking</button>' : ''}
    </div>`;
  }
  const redesenhar = () => { const r = el.scrollTop; desenhar(); el.scrollTop = r; };

  // arrastar: os outros itens abrem espaço com transform; a ordem só muda de verdade ao soltar
  el.onpointerdown = (e) => {
    const pega = e.target.closest('.pega-l');
    if (!pega) return;
    e.preventDefault();
    const li = pega.closest('.rk-l');
    const itens = $$('#lista-ed .rk-l', el);
    const de = itens.indexOf(li);
    let para = de; let y = e.clientY; let quadro = 0;
    const y0 = e.clientY; const r0 = el.scrollTop;
    li.classList.add('solta');
    const mover = () => {
      const dy = Math.max(-de * ALTURA, Math.min((itens.length - 1 - de) * ALTURA, y - y0 + el.scrollTop - r0));
      para = Math.max(0, Math.min(itens.length - 1, Math.round((de * ALTURA + dy) / ALTURA)));
      li.style.transform = `translateY(${dy}px) scale(1.02)`;
      itens.forEach((o, j) => { if (o !== li) o.style.transform = de < j && j <= para ? `translateY(${-ALTURA}px)` : para <= j && j < de ? `translateY(${ALTURA}px)` : ''; });
    };
    const rolar = () => { if (y < 90) el.scrollTop -= 7; else if (y > window.innerHeight - 90) el.scrollTop += 7; mover(); quadro = requestAnimationFrame(rolar); };
    const aoMover = (ev) => { y = ev.clientY; mover(); };
    const fim = () => {
      cancelAnimationFrame(quadro);
      window.removeEventListener('pointermove', aoMover); window.removeEventListener('pointerup', fim); window.removeEventListener('pointercancel', fim);
      if (para !== de) { ordem.splice(para, 0, ordem.splice(de, 1)[0]); mudou = true; }
      redesenhar();
    };
    window.addEventListener('pointermove', aoMover); window.addEventListener('pointerup', fim); window.addEventListener('pointercancel', fim);
    quadro = requestAnimationFrame(rolar);
  };
  el.onkeydown = (e) => {
    const pega = e.target.closest?.('.pega-l');
    if (!pega || !['ArrowUp', 'ArrowDown'].includes(e.key)) return;
    e.preventDefault();
    const de = $$('#lista-ed .rk-l', el).indexOf(pega.closest('.rk-l'));
    const para = de + (e.key === 'ArrowUp' ? -1 : 1);
    if (para < 0 || para >= ordem.length) return;
    ordem.splice(para, 0, ordem.splice(de, 1)[0]);
    mudou = true;
    redesenhar();
    $$('#lista-ed .pega-l', el)[para]?.focus();
  };

  el.onclick = async (e) => {
    const b = e.target.closest('button');
    if (!b || salvando) return;
    if (b.dataset.tira) { ordem = ordem.filter((c) => K(c) !== b.dataset.tira); mudou = true; redesenhar(); }
    else if (b.dataset.poe) { ordem.push(info.get(b.dataset.poe)); mudou = true; redesenhar(); }
    else if (b.dataset.rk === 'pela-nota') { ordem = pelaNota(ordem); mudou = true; redesenhar(); }
    else if (b.dataset.rk === 'salvar') {
      if (ordem.length < 2) { toast('Ponha pelo menos 2 títulos no ranking'); return; }
      if (!mudou) { history.back(); return; }
      salvando = true;
      const ok = await rankings.salvar(p, ordem, existente);
      salvando = false;
      if (!ok) { toast('Não deu para salvar. Confira a internet.'); return; }
      const o = nuvem.outro();
      toast(o ? `Ranking salvo. ${o.nome} também vê.` : 'Ranking salvo');
      history.back();
    } else if (b.dataset.rk === 'apagar') {
      if (!(await perguntar({ titulo: 'Apagar este ranking?', texto: `O seu ranking de ${p.nome} some para vocês dois. As suas notas continuam.`, sim: 'Apagar', nao: 'Manter' }))) return;
      if (!(await rankings.apagar(existente))) { toast('Não deu para apagar'); return; }
      toast('Ranking apagado');
      history.back();
    }
  };

  desenhar();
}
