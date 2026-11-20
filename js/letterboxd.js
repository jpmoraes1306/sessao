// Import do Letterboxd: lê os CSVs do export e casa cada filme com o TMDB por título + ano.
// - Notas: as estrelas (0,5 a 5) viram nota de 0 a 10 (x2).
// - O que não casar com certeza vai para a lista "confira estes".
// Este módulo só lê e casa; quem grava no banco é a tela de import (fase 2).
import * as tmdb from './tmdb.js';

/* ---------- CSV ---------- */
/** Lê um CSV (vírgula, aspas duplas, UTF-8) e devolve uma lista de linhas, cada uma uma lista de campos. */
export function lerCsv(texto) {
  const linhas = [];
  let campo = '';
  let linha = [];
  let aspas = false;
  const t = texto.replace(/^﻿/, '');
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (aspas) {
      if (c === '"' && t[i + 1] === '"') { campo += '"'; i++; } else if (c === '"') aspas = false; else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === ',') { linha.push(campo); campo = ''; } else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++;
      linha.push(campo); campo = '';
      linhas.push(linha); linha = [];
    } else campo += c;
  }
  if (campo || linha.length) { linha.push(campo); linhas.push(linha); }
  return linhas;
}

/** Transforma as linhas em objetos usando o cabeçalho. */
function objetos(linhas) {
  const [cab, ...resto] = linhas;
  if (!cab) return [];
  return resto.filter((l) => l.some((c) => c !== '')).map((l) => Object.fromEntries(cab.map((nome, i) => [nome, l[i] ?? ''])));
}

const chaveFilme = (nome, ano) => `${nome}|${ano || ''}`;
const nota10 = (estrelas) => { const n = parseFloat(estrelas); return Number.isFinite(n) ? n * 2 : null; };

/**
 * Recebe os arquivos do export: { 'watched.csv': texto, 'lists/nolan-ranked.csv': texto, ... }
 * e devolve tudo organizado, ainda sem os ids do TMDB.
 */
export function lerExport(arquivos) {
  const tabela = (nome) => (arquivos[nome] ? objetos(lerCsv(arquivos[nome])) : []);
  const filmes = new Map(); // "Nome|Ano" -> { nome, ano, uri }
  const anotar = (r, uri = r['Letterboxd URI']) => {
    const k = chaveFilme(r.Name, r.Year);
    if (!filmes.has(k)) filmes.set(k, { chave: k, nome: r.Name, ano: Number(r.Year) || null, uri: '' });
    if (uri && !filmes.get(k).uri) filmes.get(k).uri = uri;
    return k;
  };

  const vistos = tabela('watched.csv').map((r) => ({ filme: anotar(r), data: r.Date }));
  const notas = tabela('ratings.csv').map((r) => ({ filme: anotar(r), data: r.Date, nota: nota10(r.Rating) }));
  // no diário o link é o da entrada, não o do filme: por isso não serve de link do filme
  const diario = tabela('diary.csv').map((r) => ({
    filme: anotar(r, ''), data: r['Watched Date'] || r.Date, nota: nota10(r.Rating), revisto: r.Rewatch === 'Yes', tags: r.Tags || '',
  }));
  const queroVer = tabela('watchlist.csv').map((r) => ({ filme: anotar(r), data: r.Date }));
  const curtidos = tabela('likes/films.csv').map((r) => ({ filme: anotar(r), data: r.Date }));
  const reviews = tabela('reviews.csv').map((r) => ({
    filme: anotar(r, ''), data: r['Watched Date'] || r.Date, nota: nota10(r.Rating), texto: r.Review || '', spoiler: false,
  })).filter((r) => r.texto);

  // listas: cabeçalho da lista, linha em branco, depois Position,Name,Year,URL,Description
  const listas = [];
  for (const caminho of Object.keys(arquivos)) {
    if (!/^lists\/.+\.csv$/.test(caminho)) continue;
    const linhas = lerCsv(arquivos[caminho]);
    const iCab = linhas.findIndex((l) => l[0] === 'Position');
    const iInfo = linhas.findIndex((l) => l[0] === 'Date' && l[1] === 'Name');
    if (iCab < 0 || iInfo < 0) continue;
    const info = Object.fromEntries(linhas[iInfo].map((n, i) => [n, linhas[iInfo + 1]?.[i] ?? '']));
    const itens = objetos(linhas.slice(iCab)).map((r) => ({ posicao: Number(r.Position), filme: anotar(r, r.URL), comentario: r.Description || '' }));
    listas.push({ nome: info.Name, descricao: info.Description || '', criadaEm: info.Date, ranqueada: /ranked|ranking/i.test(info.Name), itens });
  }

  // favoritos do perfil vêm como links boxd.it: casar com o link dos filmes já vistos
  const perfil = tabela('profile.csv')[0] || {};
  const porUri = new Map([...filmes.values()].filter((f) => f.uri).map((f) => [f.uri, f.chave]));
  const favoritos = (perfil['Favorite Films'] || '').split(',').map((s) => s.trim()).filter(Boolean).map((uri) => porUri.get(uri) || null);

  return { usuario: perfil.Username || '', filmes: [...filmes.values()], vistos, notas, diario, queroVer, curtidos, reviews, listas, favoritos };
}

/* ---------- casar com o TMDB ---------- */
const ROMANOS = { ii: '2', iii: '3', iv: '4', vi: '6', vii: '7', viii: '8', ix: '9' };
/** Deixa os títulos comparáveis: sem acento, sem pontuação, "colour" = "color", "III" = "3", sem "the" na frente. */
const limpo = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/&/g, 'and')
  .replace(/[^a-z0-9]+/g, ' ').trim().replace(/\bcolour/g, 'color')
  .split(' ').map((p) => ROMANOS[p] || p).join(' ').replace(/^the /, '');

/** Entre candidatos parecidos, fica com o muito mais votado; se for parelho, devolve null (a pessoa escolhe). */
function dominante(cands, peso = () => 1) {
  const v = (c) => c.votos * peso(c);
  const o = [...cands].sort((x, y) => v(y) - v(x));
  if (!o.length) return null;
  if (o.length === 1) return o[0];
  return v(o[0]) >= 20 && v(o[0]) >= v(o[1]) * 8 ? o[0] : null;
}

/**
 * Procura um filme do Letterboxd no TMDB.
 * Devolve { situacao: 'certo' | 'conferir' | 'nada', escolha, candidatos, obs }.
 * O Letterboxd usa o ano da primeira exibição (festival) e o TMDB o da estreia, então o ano pode
 * diferir; e alguns títulos vêm abreviados ("Glass Onion"). As regras abaixo cobrem esses casos.
 */
export async function casar(filme) {
  const alvo = limpo(filme.nome);
  const tentar = async (tipo, comAno) => {
    try { return await tmdb.procurar(tipo, filme.nome, comAno ? filme.ano : null); } catch { return []; }
  };
  const [comAno, semAno] = await Promise.all([filme.ano ? tentar('filme', true) : [], tentar('filme', false)]);
  const lista = [...comAno, ...semAno.filter((c) => !comAno.some((x) => x.id === c.id))];
  const dif = (c) => (!filme.ano ? 0 : c.ano == null ? 99 : Math.abs(c.ano - filme.ano));
  const igual = (c) => limpo(c.titulo) === alvo || limpo(c.original) === alvo;
  const contem = (c) => { const t = limpo(c.titulo); return t.startsWith(`${alvo} `) || t.endsWith(` ${alvo}`); };
  const certo = (escolha, obs = '') => ({ situacao: 'certo', escolha, candidatos: [escolha], obs });
  const porVotos = (l) => [...l].sort((x, y) => y.votos - x.votos);

  // 1) título igual e ano igual ou vizinho
  let grupo = lista.filter((c) => igual(c) && dif(c) <= 1);
  if (grupo.length) {
    const d = dominante(grupo, (c) => (dif(c) === 0 ? 8 : 1)); // o ano exato pesa mais que o vizinho
    const ordem = [...grupo].sort((x, y) => dif(x) - dif(y) || y.votos - x.votos); // sugestão: ano exato, depois o mais votado
    return d ? certo(d) : { situacao: 'conferir', escolha: ordem[0], candidatos: ordem.slice(0, 5), obs: 'Há mais de um filme com esse título perto desse ano.' };
  }
  // 2) o Letterboxd também tem minisséries e especiais cadastrados como "filme"
  const series = await tentar('serie', false);
  const serie = dominante(series.filter((c) => igual(c) && dif(c) <= 1));
  if (serie) return certo(serie, 'No TMDB é uma série.');
  // 3) título igual, ano mais distante (até 7 anos)
  const longe = dominante(lista.filter((c) => igual(c) && dif(c) <= 7));
  if (longe && longe.votos >= 50) return certo(longe, `Ano diferente: ${filme.ano} no Letterboxd, ${longe.ano} no TMDB.`);
  // 4) título abreviado no Letterboxd, mesmo ano ("Glass Onion" = "Glass Onion: A Knives Out Mystery")
  const abreviado = dominante(lista.filter((c) => contem(c) && dif(c) === 0));
  if (abreviado && abreviado.votos >= 50) return certo(abreviado, `Título no TMDB: ${abreviado.titulo}.`);
  // 5) sobrou dúvida: mostra os mais prováveis para a pessoa escolher
  const provaveis = [...lista].sort((x, y) => igual(y) - igual(x) || dif(x) - dif(y) || y.votos - x.votos).concat(series.slice(0, 2)).slice(0, 5);
  return provaveis.length
    ? { situacao: 'conferir', escolha: provaveis[0], candidatos: provaveis, obs: 'Não achei um título igual.' }
    : { situacao: 'nada', escolha: null, candidatos: [], obs: 'Não está no TMDB como filme. Pode ser um episódio de série.' };
}
/** Casa uma lista inteira, alguns por vez, avisando o progresso. Devolve Map chave -> resultado. */
export async function casarTodos(filmes, aoAvancar = () => {}, simultaneos = 8) {
  const saida = new Map();
  let proximo = 0;
  let feitos = 0;
  await Promise.all(Array.from({ length: simultaneos }, async () => {
    while (proximo < filmes.length) {
      const f = filmes[proximo++];
      saida.set(f.chave, await casar(f));
      aoAvancar(++feitos, filmes.length);
    }
  }));
  return saida;
}
