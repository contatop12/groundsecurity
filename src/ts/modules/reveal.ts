import { $$, prefersReducedMotion } from '../utils';

/**
 * Revelação ao rolar:
 *  [data-reveal="rise|fade|line"] → classe .is-in ao entrar na viewport
 *  [data-reveal="bands"]           → injeta 5 faixas que recolhem (gesto do domo)
 *  [data-count="130"]              → contador animado (números reais do conteúdo)
 */
export function initReveal(): void {
  const items = $$('[data-reveal]');
  const counters = $$('[data-count]');

  if (prefersReducedMotion() || !('IntersectionObserver' in window)) {
    items.forEach((el) => el.classList.add('is-in'));
    return;
  }

  $$('[data-reveal="bands"]').forEach((el) => {
    const bands = document.createElement('span');
    bands.className = 'reveal-bands';
    bands.setAttribute('aria-hidden', 'true');
    bands.innerHTML = '<i></i><i></i><i></i><i></i><i></i>';
    el.appendChild(bands);
  });

  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('is-in');
        io.unobserve(entry.target);
      }
    },
    { rootMargin: '0px 0px -12% 0px', threshold: 0.08 },
  );
  items.forEach((el) => io.observe(el));

  const countIO = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        countUp(entry.target as HTMLElement);
        countIO.unobserve(entry.target);
      }
    },
    { threshold: 0.6 },
  );
  counters.forEach((el) => countIO.observe(el));
}

function countUp(el: HTMLElement): void {
  const target = Number(el.dataset.count);
  if (!Number.isFinite(target)) return;
  const suffix = el.dataset.suffix ?? '';
  const duration = Math.min(1800, 600 + target * 8);
  const start = performance.now();
  const ease = (t: number): number => 1 - Math.pow(1 - t, 4);
  const frame = (now: number): void => {
    const t = Math.min(1, (now - start) / duration);
    el.textContent = `${Math.round(target * ease(t))}${suffix}`;
    if (t < 1) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
