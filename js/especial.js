// Datas especiais: num dia cadastrado (ex.: 22/07, Dia do Willem Dafoe) o app troca de tema e
// mostra um aviso no Início. Cada pessoa cadastra as suas no Perfil.
import * as nuvem from './nuvem.js';

let previa = false; // "ver como fica", ligado pelo Perfil

/** A data especial de hoje ({ dia, mes, nome, pessoa }) ou null. */
export function deHoje() {
  const d = new Date();
  const lista = nuvem.datasEspeciais();
  return lista.find((x) => x.dia === d.getDate() && x.mes === d.getMonth() + 1) || (previa ? lista[0] || { nome: 'Data especial' } : null);
}

export function aplicarTema() {
  document.body.classList.toggle('tema-dafoe', Boolean(deHoje()));
}

export const emPrevia = () => previa;
export function alternarPrevia() {
  previa = !previa;
  aplicarTema();
  return previa;
}
