// Tela de import do Letterboxd (abre por cima, em #/importar/letterboxd).
// Passos: escolher o .zip -> casar com o TMDB -> conferir os duvidosos -> gravar na conta.
import * as letterboxd from '../letterboxd.js';
import * as importar from '../importar.js';
import * as nuvem from '../nuvem.js';
import * as dados from '../dados.js';
import { $, esc, poster, toast } from '../ui.js';

// o que já foi lido fica guardado enquanto o app estiver aberto (sair e voltar da tela não perde o trabalho)
const estado = { passo: 'inicio', dono: null, exp: null, casados: null, escolhas: new Map(), progresso: null, resultado: null, erro: '' };

/** Perfil que vai receber o import: o seu, ou o do outro enquanto ele ainda não entrou no app. */
const destino = () => (estado.dono && nuvem.pessoa(estado.dono)) || null;
const nomeDestino = () => (destino() ? `o perfil de ${destino().nome}` : 'a sua conta');

const barra = (p) => (p ? `<div class="card"><div class="entre"><span>${esc(p.etapa)}</span><span>${p.total ? `${p.feito} de ${p.total}` : ''}</span></div><div class="lbar-big"><i style="width:${p.total ? (p.feito / p.total) * 100 : 0}%"></i></div></div>` : '');

function corpo() {
  const u = nuvem.usuario();
  if (!u) {
    return `<div class="vazio"><b>Entre na sua conta primeiro</b>O import grava o histórico na conta de quem está logado.<a class="btn small" href="#/perfil">Abrir o Perfil</a></div>`;
  }
  if (estado.passo === 'inicio') {
    return `<div class="card"><ol>
        <li>No Letterboxd: Settings → Data → Export your data.</li>
        <li>Ele baixa um .zip. Escolha esse arquivo aqui embaixo, sem descompactar.</li>
        <li>O app casa cada filme com o TMDB, mostra os que deixaram dúvida e grava tudo em <b style="color:var(--fg)">${esc(nomeDestino())}</b>.</li>
      </ol>
      ${nuvem.outro() && !nuvem.outro().ativo ? `<div class="seg" role="group" aria-label="Para quem"><button data-dono="" aria-pressed="${!estado.dono}">Para mim</button><button data-dono="${nuvem.outro().id}" aria-pressed="${estado.dono === nuvem.outro().id}">Para ${esc(nuvem.outro().nome)} (ainda não entrou)</button></div>
        <p class="note">Enquanto ${esc(nuvem.outro().nome)} não fizer o primeiro login, você pode carregar o export dele. Quando ele entrar, o histórico já estará no perfil dele e só ele poderá mexer.</p>` : ''}
      <p>As estrelas viram nota de 0 a 10 (4,5 estrelas = 9). Pode importar de novo depois: nada duplica.</p>
      ${estado.erro ? `<p class="ruim">${esc(estado.erro)}</p>` : ''}
      <label class="btn on-list" style="align-self:flex-start;cursor:pointer">Escolher o arquivo .zip<input type="file" id="zip" accept=".zip,application/zip" hidden></label></div>`;
  }
  if (estado.passo === 'casando' || estado.passo === 'gravando') {
    return `${barra(estado.progresso)}<p class="note">${estado.passo === 'casando' ? 'Procurando cada filme no TMDB pelo título e pelo ano.' : 'Não feche o app até terminar.'}</p>`;
  }
  if (estado.passo === 'conferir') {
    const { exp, casados } = estado;
    const duvidas = exp.filmes.filter((f) => casados.get(f.chave).situacao === 'conferir');
    const nada = exp.filmes.filter((f) => casados.get(f.chave).situacao === 'nada');
    const certos = exp.filmes.length - duvidas.length - nada.length;
    return `
      <div class="stats"><div class="stat"><b>${exp.vistos.length}</b><span>vistos</span></div><div class="stat"><b>${exp.notas.length}</b><span>com nota</span></div><div class="stat"><b>${exp.diario.length}</b><span>no diário</span></div>
        <div class="stat"><b>${exp.queroVer.length}</b><span>quero ver</span></div><div class="stat"><b>${exp.curtidos.length}</b><span>curtidos</span></div><div class="stat"><b>${exp.listas.length}</b><span>listas</span></div></div>
      <div class="card"><p><b style="color:var(--fg)">${certos} de ${exp.filmes.length} títulos</b> casaram com certeza. ${duvidas.length ? `${duvidas.length} precisam da sua conferência.` : 'Nenhum precisa de conferência.'} ${nada.length ? `${nada.length} não foram achados.` : ''}</p></div>
      ${duvidas.length ? `<section><h2>Confira estes <small>${duvidas.length}</small></h2>
        ${duvidas.map((f) => {
          const r = casados.get(f.chave);
          const atual = estado.escolhas.get(f.chave);
          return `<div class="card conf"><div><b style="color:var(--fg)">${esc(f.nome)}</b> <span class="s">${f.ano || 'sem ano'}</span><p class="note">${esc(r.obs || '')}</p></div>
            ${r.candidatos.map((c) => `<label class="opc"><input type="radio" name="${esc(f.chave)}" value="${c.tipo}:${c.id}" ${atual && atual.id === c.id && atual.tipo === c.tipo ? 'checked' : ''}>${poster(c, { tam: 'w154' })}<span><b>${esc(c.titulo)}</b><br>${c.ano || 'sem ano'}${c.tipo === 'serie' ? ' · série' : ''}${c.votos ? ` · ${c.votos} votos` : ''}</span></label>`).join('')}
            <label class="opc"><input type="radio" name="${esc(f.chave)}" value="" ${atual ? '' : 'checked'}><span class="poster" style="--a:var(--raised);--b:var(--bg)"></span><span>Nenhum destes (deixar para depois)</span></label></div>`;
        }).join('')}</section>` : ''}
      ${nada.length ? `<section><h2>Não achei no TMDB <small>${nada.length}</small></h2><div class="card"><p>${nada.map((f) => esc(f.nome)).join(' · ')}</p><p class="note">Costumam ser episódios de série cadastrados como filme no Letterboxd. Dá para marcar na página da série.</p></div></section>` : ''}
      <div class="actions"><button class="btn on-seen" data-acao="gravar">Importar para ${esc(nomeDestino())}</button><button class="btn" data-acao="recomecar">Escolher outro arquivo</button></div>`;
  }
  const r = estado.resultado;
  return `<div class="card"><p class="ok"><b>Import concluído.</b></p>
      <ul><li>${r.vistos} títulos vistos, ${r.comNota} com nota</li><li>${r.diario} entradas no diário</li><li>${r.quero} no Quero ver</li><li>${r.curtidos} curtidos e ${r.favoritos} favoritos</li>
      ${r.listas ? `<li>${r.listas} listas</li>` : ''}${r.pendentes ? `<li>${r.pendentes} ficaram pendentes (sem correspondência)</li>` : ''}</ul>
      <p>Destino: ${esc(nomeDestino())}.</p>
      <div class="actions"><a class="btn small on-seen" href="#/diario">Ver o diário</a><a class="btn small" href="#/lista">Ver o Quero ver</a><button class="btn small" data-acao="recomecar">Importar outro arquivo</button></div></div>`;
}

export async function abrir(el, _id, ctx) {
  const desenhar = () => {
    if (!ctx.vivo()) return;
    el.innerHTML = `<div class="backdrop curto" style="--a:#3d5a73;--b:#101419"></div>
      <button class="back" data-acao="voltar" aria-label="Voltar">‹</button>
      <div class="wrap" style="gap:18px"><div class="pessoa-topo" style="margin-top:-40px"><div><div class="eyebrow">Import</div><h1>Letterboxd</h1></div></div>${corpo()}</div>`;
  };
  desenhar();
  // o login pode terminar de carregar depois que a tela abriu
  const parar = nuvem.aoMudar(() => { if (ctx.vivo()) { if (estado.passo === 'inicio') desenhar(); } else parar(); });

  el.onchange = async (e) => {
    if (e.target.id === 'zip' && e.target.files[0]) {
      estado.erro = '';
      try {
        estado.passo = 'casando';
        estado.progresso = { etapa: 'Abrindo o arquivo', feito: 0, total: 0 };
        desenhar();
        estado.exp = letterboxd.lerExport(await importar.abrirZip(e.target.files[0]));
        let ultimo = 0;
        estado.casados = await letterboxd.casarTodos(estado.exp.filmes, (feito, total) => {
          estado.progresso = { etapa: 'Casando com o TMDB', feito, total };
          if (Date.now() - ultimo > 250 || feito === total) { ultimo = Date.now(); desenhar(); }
        });
        // escolha inicial: o que casou com certeza e o mais provável dos duvidosos
        estado.escolhas = new Map(estado.exp.filmes.map((f) => [f.chave, estado.casados.get(f.chave).escolha]));
        estado.passo = 'conferir';
      } catch (erro) {
        estado.passo = 'inicio';
        estado.erro = erro?.message || 'Não deu para ler o arquivo.';
      }
      desenhar();
    } else if (e.target.type === 'radio') {
      const r = estado.casados.get(e.target.name);
      const [tipo, id] = e.target.value.split(':');
      estado.escolhas.set(e.target.name, e.target.value ? r.candidatos.find((c) => c.tipo === tipo && String(c.id) === id) : null);
    }
  };

  el.onclick = async (e) => {
    const quem = e.target.closest('button[data-dono]');
    if (quem) { estado.dono = quem.dataset.dono || null; desenhar(); return; }
    const b = e.target.closest('button[data-acao]');
    if (!b) return;
    if (b.dataset.acao === 'recomecar') {
      Object.assign(estado, { passo: 'inicio', exp: null, casados: null, escolhas: new Map(), resultado: null, erro: '' });
      desenhar();
    } else if (b.dataset.acao === 'gravar') {
      estado.passo = 'gravando';
      estado.progresso = { etapa: 'Preparando', feito: 0, total: 0 };
      desenhar();
      try {
        let ultimo = 0;
        estado.resultado = await importar.gravar(estado.exp, estado.escolhas, (etapa, feito, total) => {
          estado.progresso = { etapa, feito, total };
          if (Date.now() - ultimo > 250 || feito === total) { ultimo = Date.now(); desenhar(); }
        }, estado.dono);
        if (!estado.dono) await dados.sincronizar();
        estado.passo = 'fim';
        toast('Import concluído');
      } catch (erro) {
        estado.passo = 'conferir';
        toast(`O import parou: ${erro?.message || 'erro desconhecido'}`);
      }
      desenhar();
    }
  };
}
