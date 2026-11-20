// Editor com ordem: os seus favoritos (#/editar/favoritos), uma lista sua (#/editar/lista-ID) ou uma lista nova
// (#/editar/lista-nova). Arrasta pelo ícone de duas linhas para trocar a ordem; a busca de baixo adiciona títulos.
import * as tmdb from '../tmdb.js';
import * as dados from '../dados.js';
import * as nuvem from '../nuvem.js';
import * as listas from '../listas.js';
import { ligarArrasto } from '../arrastar.js';
import { $, esc, poster, erroFicha, toast, perguntar } from '../ui.js';

const MENOS = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 12h12"/></svg>';
const MAIS = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 6v12M6 12h12"/></svg>';
const PEGA = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 9h14M5 15h14"/></svg>';
const LUPA = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>';
const ALTURA = 64; // altura de cada linha, igual à do CSS (.rk.ed .rk-l)
const MAX_FAVORITOS = 4;
const K = (x) => `${x.tipo}:${x.id}`;
const aviso = (titulo, texto) => `<button class="back" data-acao="voltar" aria-label="Voltar">‹</button><div class="wrap" style="padding-top:90px"><div class="vazio"><b>${titulo}</b>${texto}<div class="actions"><a class="btn small" href="#/perfil">Abrir o Perfil</a></div></div></div>`;

export async function abrir(el, rota, ctx) {
  const favoritos = rota === 'favoritos';
  const nova = rota === 'lista-nova';
  const idLista = !favoritos && !nova ? Number(rota.split('-')[1]) : null;
  if (!favoritos && !nova && !idLista) { el.innerHTML = aviso('Tela não encontrada', 'Volte ao Perfil e abra a lista por lá.'); return; }
  if (!favoritos && !nuvem.usuario()) { el.innerHTML = aviso('Entre na sua conta', 'As listas ficam guardadas na conta, para vocês dois verem.'); return; }

  let existente = null;
  if (idLista) {
    try { existente = await listas.ler(idLista); } catch (erro) { if (ctx.vivo()) el.innerHTML = erroFicha(erro); return; }
    if (!ctx.vivo()) return;
    if (!existente || existente.user_id !== nuvem.usuario().id) { el.innerHTML = aviso('Esta lista não pode ser editada', 'Ela não existe mais ou é do outro perfil.'); return; }
  }

  let ordem = favoritos ? dados.favoritos().map((f) => ({ ...f })) : (existente?.itens || []);
  let nome = existente?.nome || '';
  let comOrdem = existente ? existente.ranqueada : true;
  let mudou = false;
  let salvando = false;
  let achados = null;      // null = sem busca (mostra sugestões); 'erro'; ou a lista de resultados
  let buscando = false;
  let vezBusca = 0;
  let espera = 0;
  const completando = [];  // resumos completos dos títulos adicionados, a caminho da conta

  const cheio = () => favoritos && ordem.length >= MAX_FAVORITOS;
  const numerada = () => favoritos || comOrdem;
  const titulo = favoritos ? 'Favoritos' : nova ? 'Nova lista' : 'Editar lista';

  function desenharItens() {
    const dica = favoritos
      ? `Até ${MAX_FAVORITOS}. Aparecem no seu perfil nesta ordem.`
      : 'Segure no ícone de duas linhas e arraste para trocar a ordem.';
    $('#ed-itens', el).innerHTML = `<p class="sub2" style="display:block">${dica}</p>
      ${ordem.length ? `<div class="rk ed" id="lista-ed">${ordem.map((c, i) => `<div class="rk-l" data-k="${K(c)}">
        <button class="tira" data-tira="${K(c)}" aria-label="Tirar ${esc(c.titulo)}">${MENOS}</button><span class="pos">${numerada() ? i + 1 : ''}</span>${poster(c, { tam: 'w154' })}
        <div class="tt"><b>${esc(c.titulo)}</b><span>${[c.ano, c.tipo === 'serie' ? 'série' : ''].filter(Boolean).join(' · ')}</span></div>
        <button class="pega-l" aria-label="Mover ${esc(c.titulo)}, posição ${i + 1}. Use as setas para cima e para baixo.">${PEGA}</button></div>`).join('')}</div>`
    : `<p class="note">${favoritos ? 'Nenhum favorito ainda.' : 'Nenhum título na lista.'} Adicione pela busca aqui embaixo.</p>`}`;
  }

  function desenharAchados() {
    const alvo = $('#ed-achados', el);
    const dentro = new Set(ordem.map(K));
    const linha = (c) => `<div class="rk-l"><button class="poe" data-poe="${K(c)}" aria-label="Adicionar ${esc(c.titulo)}" ${cheio() ? 'disabled' : ''}>${MAIS}</button>${poster(c, { tam: 'w154' })}
      <div class="tt"><b>${esc(c.titulo)}</b><span>${[c.ano, c.tipo === 'serie' ? 'série' : '', c.nota != null && c.minha ? `sua nota <i>${c.nota}</i>` : ''].filter(Boolean).join(' · ')}</span></div></div>`;
    const lotado = cheio() ? `<p class="note">Já são ${MAX_FAVORITOS}. Tire um para pôr outro.</p>` : '';
    if (buscando) { alvo.innerHTML = '<div class="skel txt"></div><div class="skel txt" style="width:70%"></div>'; return; }
    if (achados === 'erro') { alvo.innerHTML = '<p class="note">Não deu para buscar. Confira a internet.</p>'; return; }
    if (achados) {
      const fora = achados.filter((c) => !dentro.has(K(c)));
      conhecidos = new Map(fora.map((c) => [K(c), c]));
      alvo.innerHTML = `${lotado}${fora.length ? `<div class="rk fora">${fora.map(linha).join('')}</div>` : `<p class="note">${achados.length ? 'Tudo o que a busca achou já está aqui.' : 'Nada encontrado com esse nome.'}</p>`}`;
      return;
    }
    // sem busca: as suas maiores notas, para adicionar com um toque
    const sugestoes = dados.todos().filter((t) => t.nota != null && t.titulo && !dentro.has(K(t)))
      .sort((a, b) => b.nota - a.nota || (b.ano || 0) - (a.ano || 0)).slice(0, 12)
      .map((t) => ({ tipo: t.tipo, id: t.id, titulo: t.titulo, ano: t.ano, poster: t.poster, nota: t.nota, minha: true }));
    conhecidos = new Map(sugestoes.map((c) => [K(c), c]));
    alvo.innerHTML = `${lotado}${sugestoes.length ? `<p class="note">Sugestões: as suas maiores notas.</p><div class="rk fora">${sugestoes.map(linha).join('')}</div>` : ''}`;
  }
  let conhecidos = new Map(); // o que está na lista de baixo agora (resultado da busca ou sugestões)

  const redesenhar = () => { const r = el.scrollTop; desenharItens(); desenharAchados(); el.scrollTop = r; };
  // volta para a tela de antes; se o editor foi aberto direto (sem tela do app atrás), vai para o Perfil
  const sair = () => { if ((history.state?.sessaoI ?? 0) > 0) history.back(); else location.hash = '#/perfil'; };

  el.innerHTML = `<div class="barra-ed"><button data-acao="voltar">Cancelar</button><b>${titulo}</b><button data-ed="salvar">Salvar</button></div>
    <div class="wrap" style="gap:22px;padding-top:6px">
      ${favoritos ? '' : `<section><label class="campo">Nome da lista<input id="ed-nome" maxlength="80" autocomplete="off" placeholder="Ex.: Melhores finais" value="${esc(nome)}"></label>
        <div class="grupo"><button class="lin" data-ed="ordem" role="switch" aria-checked="${comOrdem}"><span class="n">Lista com ordem<small>Numerada do 1º ao último, como um ranking</small></span><span class="chave${comOrdem ? ' on' : ''}"></span></button></div></section>`}
      <section id="ed-itens"></section>
      <section><h2>Adicionar</h2>
        <label class="search" for="ed-q">${LUPA}<input id="ed-q" type="search" inputmode="search" enterkeyhint="search" placeholder="Buscar filme ou série" autocomplete="off" autocapitalize="off" spellcheck="false"></label>
        <div id="ed-achados" style="display:flex;flex-direction:column;gap:10px"></div></section>
      ${favoritos ? '<p class="note">Você também põe e tira um favorito pela estrela, na ficha do filme ou da série.</p>' : `<p class="note">A lista aparece no perfil de quem criou, para vocês dois.</p>${existente ? '<button class="texto" data-ed="apagar" style="align-self:flex-start;color:var(--rt)">Apagar esta lista</button>' : ''}`}
    </div>`;
  desenharItens();
  desenharAchados();

  ligarArrasto(el, '#lista-ed .rk-l', ALTURA, (de, para) => {
    if (de !== para) { ordem.splice(para, 0, ordem.splice(de, 1)[0]); mudou = true; }
    const r = el.scrollTop; desenharItens(); el.scrollTop = r;
  });

  el.oninput = (e) => {
    if (e.target.id === 'ed-nome') { nome = e.target.value; mudou = true; return; }
    if (e.target.id !== 'ed-q') return;
    clearTimeout(espera);
    const texto = e.target.value.trim();
    const minha = ++vezBusca; // uma resposta antiga que chegar depois não cobre a busca nova
    if (texto.length < 2) { achados = null; buscando = false; desenharAchados(); return; }
    espera = setTimeout(async () => {
      buscando = true;
      desenharAchados();
      let r;
      try { r = (await tmdb.buscar(texto)).filter((c) => c.tipo === 'filme' || c.tipo === 'serie').slice(0, 12); } catch { r = 'erro'; }
      if (minha !== vezBusca || !ctx.vivo()) return;
      buscando = false;
      achados = r;
      desenharAchados();
    }, 350);
  };

  el.onclick = async (e) => {
    const b = e.target.closest('button');
    if (!b || salvando) return;
    if (b.dataset.tira) { ordem = ordem.filter((c) => K(c) !== b.dataset.tira); mudou = true; redesenhar(); return; }
    if (b.dataset.poe) {
      const c = conhecidos.get(b.dataset.poe);
      if (!c || cheio() || ordem.some((x) => K(x) === K(c))) return;
      ordem.push({ tipo: c.tipo, id: c.id, titulo: c.titulo, ano: c.ano ?? null, poster: c.poster || '' });
      mudou = true;
      // o resumo completo (duração, gêneros, elenco) vai para a conta, para o outro ver o título e o pôster
      if (nuvem.usuario()) completando.push(tmdb.resumo(c.tipo, c.id).then((r) => dados.guardarResumo(c.tipo, c.id, r)).catch(() => {}));
      redesenhar();
      return;
    }
    const acao = b.dataset.ed;
    if (acao === 'ordem') {
      comOrdem = !comOrdem; mudou = true;
      b.setAttribute('aria-checked', comOrdem);
      b.querySelector('.chave').classList.toggle('on', comOrdem);
      redesenhar();
    } else if (acao === 'salvar') {
      if (!favoritos && !nome.trim()) { toast('Dê um nome para a lista'); $('#ed-nome', el)?.focus(); return; }
      if (!favoritos && !ordem.length) { toast('Ponha pelo menos um título na lista'); return; }
      if (!mudou) { sair(); return; }
      salvando = true;
      b.disabled = true;
      await Promise.allSettled(completando);
      let problema = '';
      if (favoritos) dados.definirFavoritos(ordem);
      else {
        for (const c of ordem) await dados.garantirResumo(c).catch(() => {}); // sem o completo, vai o básico (título e pôster)
        problema = await listas.salvar({ id: existente?.id, nome, ranqueada: comOrdem, itens: ordem });
      }
      salvando = false;
      if (!ctx.vivo()) return; // a pessoa saiu da tela enquanto salvava
      b.disabled = false;
      if (problema) { toast(problema); return; }
      toast(favoritos ? 'Favoritos salvos' : 'Lista salva');
      sair();
    } else if (acao === 'apagar') {
      if (!(await perguntar({ titulo: 'Apagar esta lista?', texto: `"${existente.nome}" some para vocês dois. As suas notas continuam.`, sim: 'Apagar', nao: 'Manter' }))) return;
      if (!(await listas.apagar(existente.id))) { toast('Não deu para apagar'); return; }
      if (!ctx.vivo()) return;
      toast('Lista apagada');
      sair();
    }
  };
}
