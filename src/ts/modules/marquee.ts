import { $, $$, prefersReducedMotion } from '../utils';

/** Marquee infinito: duplica os itens (aria-hidden) e pausa a animação fora da tela. */
export function initMarquee(): void {
  $$('[data-marquee]').forEach((root) => {
    const track = $('.marquee__track', root);
    if (!track || track.dataset.cloned || prefersReducedMotion()) return;
    Array.from(track.children).forEach((li) => {
      const clone = li.cloneNode(true) as HTMLElement;
      clone.setAttribute('aria-hidden', 'true');
      clone.querySelectorAll('img').forEach((img) => (img.alt = ''));
      track.appendChild(clone);
    });
    track.dataset.cloned = 'true';
    new IntersectionObserver(([e]) => {
      track.style.animationPlayState = e?.isIntersecting ? '' : 'paused';
    }).observe(root);
  });
}
