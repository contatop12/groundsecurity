import { $, $$ } from '../utils';

/** Linha do tempo horizontal: botões, arrastar com mouse, teclado e barra de progresso. */
export function initTimeline(): void {
  $$('[data-timeline]').forEach((root) => {
    const track = $('[data-tl-track]', root);
    const prev = $<HTMLButtonElement>('[data-tl-prev]', root);
    const next = $<HTMLButtonElement>('[data-tl-next]', root);
    const bar = $('.timeline__bar span', root);
    if (!track) return;

    const step = (): number => (track.firstElementChild as HTMLElement | null)?.offsetWidth ?? 320;
    const update = (): void => {
      const max = track.scrollWidth - track.clientWidth;
      const p = max > 0 ? track.scrollLeft / max : 1;
      const visible = track.clientWidth / track.scrollWidth;
      bar?.style.setProperty('--p', String(Math.max(visible, p)));
      if (prev) prev.disabled = track.scrollLeft < 4;
      if (next) next.disabled = track.scrollLeft > max - 4;
    };
    prev?.addEventListener('click', () => track.scrollBy({ left: -step() - 20, behavior: 'smooth' }));
    next?.addEventListener('click', () => track.scrollBy({ left: step() + 20, behavior: 'smooth' }));
    track.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update, { passive: true });
    track.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight') track.scrollBy({ left: step(), behavior: 'smooth' });
      if (e.key === 'ArrowLeft') track.scrollBy({ left: -step(), behavior: 'smooth' });
    });

    // Arrastar com mouse (toque já rola nativamente)
    let startX = 0;
    let startScroll = 0;
    let dragging = false;
    let moved = false;
    track.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'mouse') return;
      dragging = true;
      moved = false;
      startX = e.clientX;
      startScroll = track.scrollLeft;
      track.setPointerCapture(e.pointerId);
    });
    track.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const dx = e.clientX - startX;
      if (Math.abs(dx) > 4) {
        moved = true;
        track.classList.add('is-dragging');
      }
      track.scrollLeft = startScroll - dx;
    });
    const end = (): void => {
      if (!dragging) return;
      dragging = false;
      track.classList.remove('is-dragging');
      if (moved) {
        // reencaixa no marco mais próximo
        const s = step() + 20;
        track.scrollTo({ left: Math.round(track.scrollLeft / s) * s, behavior: 'smooth' });
      }
    };
    track.addEventListener('pointerup', end);
    track.addEventListener('pointercancel', end);
    update();
  });
}
