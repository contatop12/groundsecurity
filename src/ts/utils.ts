/** Utilitários compartilhados */

export const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document): T | null =>
  root.querySelector<T>(sel);

export const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document): T[] =>
  Array.from(root.querySelectorAll<T>(sel));

const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
export const prefersReducedMotion = (): boolean => motionQuery.matches;

export const clamp = (v: number, min = 0, max = 1): number => Math.min(max, Math.max(min, v));

/** Progresso (0→1) de um elemento atravessando a viewport. */
export function progressThrough(el: Element, startAt = 1, endAt = 0): number {
  const r = el.getBoundingClientRect();
  const vh = window.innerHeight;
  const start = vh * startAt;
  const end = vh * endAt - r.height;
  return clamp((start - r.top) / (start - end));
}

/** Agenda callbacks de scroll num único requestAnimationFrame (sem layout thrashing). */
type ScrollFn = (y: number) => void;
const scrollFns = new Set<ScrollFn>();
let ticking = false;
function flush(): void {
  ticking = false;
  const y = window.scrollY;
  scrollFns.forEach((fn) => fn(y));
}
export function onScroll(fn: ScrollFn): void {
  if (scrollFns.size === 0) {
    const req = (): void => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(flush);
      }
    };
    window.addEventListener('scroll', req, { passive: true });
    window.addEventListener('resize', req, { passive: true });
  }
  scrollFns.add(fn);
  fn(window.scrollY);
}

/** Registra evento de conversão (GTM/GA4 se existir; silencioso caso contrário). */
type DataLayerWindow = Window & { dataLayer?: unknown[]; gtag?: (...args: unknown[]) => void };
export function track(event: string, params: Record<string, string> = {}): void {
  const w = window as DataLayerWindow;
  w.dataLayer?.push({ event, ...params });
  w.gtag?.('event', event, params);
}
