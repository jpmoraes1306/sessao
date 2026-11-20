// Aba Diário: cada vez que a pessoa assistiu, da mais recente para a mais antiga.
// Com login, vem da tabela "diario" da conta (inclui o histórico importado do Letterboxd).
// Sem login, lista o que foi marcado como visto neste aparelho.
import * as dados from '../dados.js';
import * as nuvem from '../nuvem.js';
import { simboloEscondido } from '../ovo.js';
import { esc, selo, poster, IC } from '../ui.js';

const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const MESL = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const POR_VEZ = 150;
let vez = 0;

/** entradas: [{ tipo, id, titulo, ano, poster, data, nota, revisto, curtido }] */
function desenhar(el, entradas, { temMais = false, vazio = '' } = {}) {
  const grupos = {};
  for (const e of entradas) (grupos[e.data.slice(0, 7)] = grupos[e.data.slice(0, 7)] || []).push(e);
  el.innerHTML = `${Object.keys(grupos).map((k) => {
    const [a, m] = k.split('-');
    return `<section><h2>${MESL[m - 1]} ${a} <small>${grupos[k].length} título${grupos[k].length > 1 ? 's' : ''}</small></h2><div class="list">${grupos[k].map((t) => `
      <a class="li" href="#/${t.tipo}/${t.id}" style="grid-template-columns:34px 42px 1fr auto"><div class="date">${Number(t.data.slice(8))}<small>${DIAS[new Date(`${t.data.slice(0, 10)}T12:00:00`).getDay()]}</small></div>${poster(t, { tam: 'w154' })}
        <div><div class="t">${esc(t.titulo)}</div><div class="s">${[t.ano, t.tipo === 'serie' ? 'série' : ''].filter(Boolean).join(' · ')}</div></div>
        <span class="r fim">${t.revisto ? `<span class="rev" title="Visto de novo" aria-label="visto de novo">${IC.rever}</span>` : ''}${t.curtido ? '<span class="heart">♥</span>' : ''}${selo(t.nota)}</span></a>`).join('')}</div></section>`;
  }).join('') || vazio}
  ${temMais ? '<button class="btn" data-acao="mais" style="align-self:center">Mostrar mais antigos</button>' : ''}${simboloEscondido('diario')}`;
}

const VAZIO = `<div class="vazio"><b>Nada no diário ainda</b>Marque um filme como visto ou dê uma nota para ele aparecer aqui.<a class="btn small" href="#/buscar">Buscar um título</a></div>`;

export function render(el) {
  const minhaVez = ++vez;
  const b = nuvem.usuario() ? nuvem.banco() : null;
  if (!b) {
    const vistos = dados.todos().filter((t) => t.visto && t.vistoEm).sort((x, y) => y.vistoEm.localeCompare(x.vistoEm));
    desenhar(el, vistos.map((t) => ({ ...t, data: t.vistoEm })), { vazio: `${VAZIO}<p class="note">Entre na sua conta (aba Perfil) para ver o diário completo e importar o histórico do Letterboxd.</p>` });
    return;
  }
  el.innerHTML = '<div class="skel tit"></div><div class="skel txt"></div><div class="skel txt" style="width:70%"></div>';
  const entradas = [];
  const carregar = async () => {
    const { data, error } = await b.from('diario').select('tipo, tmdb_id, data, nota, revisto').eq('user_id', nuvem.usuario().id)
      .order('data', { ascending: false }).order('id', { ascending: false }).range(entradas.length, entradas.length + POR_VEZ);
    if (minhaVez !== vez) return;
    if (error) { el.innerHTML = '<p class="note">Não deu para carregar o diário. Confira a internet.</p>'; return; }
    const temMais = data.length > POR_VEZ;
    const pagina = data.slice(0, POR_VEZ);
    const info = await dados.resumos(pagina);
    if (minhaVez !== vez) return;
    for (const r of pagina) {
      const res = info.get(`${r.tipo}:${r.tmdb_id}`) || {};
      const meu = dados.titulo(r.tipo, r.tmdb_id);
      entradas.push({ tipo: r.tipo, id: r.tmdb_id, titulo: res.titulo || meu.titulo || 'Sem título', ano: res.ano, poster: res.poster || '', data: r.data, nota: r.nota == null ? null : Number(r.nota), revisto: r.revisto, curtido: meu.curtido });
    }
    desenhar(el, entradas, { temMais, vazio: `${VAZIO}<a class="btn small" href="#/importar/letterboxd" style="align-self:flex-start">Importar do Letterboxd</a>` });
  };
  el.onclick = (e) => { if (e.target.closest('[data-acao="mais"]')) carregar(); };
  carregar();
}
