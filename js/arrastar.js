// Arrastar para trocar a ordem de linhas de altura fixa (favoritos e listas).
// A alça de cada linha é `.pega-l`; com o teclado, as setas para cima e para baixo fazem o mesmo.
import { $$ } from './ui.js';

/**
 * `el` é a área que rola (a ficha); `seletor` acha as linhas, na ordem; `altura` é a altura de cada uma.
 * `aoSoltar(de, para)` é chamado sempre que a pessoa solta (mesmo no mesmo lugar): quem chama troca a ordem e redesenha.
 */
export function ligarArrasto(el, seletor, altura, aoSoltar) {
  el.onpointerdown = (e) => {
    const pega = e.target.closest('.pega-l');
    if (!pega) return;
    e.preventDefault();
    const itens = $$(seletor, el);
    const li = pega.closest(seletor);
    const de = itens.indexOf(li);
    if (de < 0) return;
    let para = de; let y = e.clientY; let quadro = 0;
    const y0 = e.clientY; const r0 = el.scrollTop;
    li.classList.add('solta');
    // os outros abrem espaço com transform; a ordem só muda de verdade ao soltar
    const mover = () => {
      const dy = Math.max(-de * altura, Math.min((itens.length - 1 - de) * altura, y - y0 + el.scrollTop - r0));
      para = Math.max(0, Math.min(itens.length - 1, Math.round((de * altura + dy) / altura)));
      li.style.transform = `translateY(${dy}px) scale(1.02)`;
      itens.forEach((o, j) => { if (o !== li) o.style.transform = de < j && j <= para ? `translateY(${-altura}px)` : para <= j && j < de ? `translateY(${altura}px)` : ''; });
    };
    const rolar = () => { if (y < 90) el.scrollTop -= 7; else if (y > window.innerHeight - 90) el.scrollTop += 7; mover(); quadro = requestAnimationFrame(rolar); };
    const aoMover = (ev) => { y = ev.clientY; mover(); };
    const fim = () => {
      cancelAnimationFrame(quadro);
      window.removeEventListener('pointermove', aoMover); window.removeEventListener('pointerup', fim); window.removeEventListener('pointercancel', fim);
      aoSoltar(de, para);
    };
    window.addEventListener('pointermove', aoMover); window.addEventListener('pointerup', fim); window.addEventListener('pointercancel', fim);
    quadro = requestAnimationFrame(rolar);
  };
  el.onkeydown = (e) => {
    const pega = e.target.closest?.('.pega-l');
    if (!pega || !['ArrowUp', 'ArrowDown'].includes(e.key)) return;
    e.preventDefault();
    const itens = $$(seletor, el);
    const de = itens.indexOf(pega.closest(seletor));
    const para = de + (e.key === 'ArrowUp' ? -1 : 1);
    if (de < 0 || para < 0 || para >= itens.length) return;
    aoSoltar(de, para);
    $$(`${seletor} .pega-l`, el)[para]?.focus();
  };
}
