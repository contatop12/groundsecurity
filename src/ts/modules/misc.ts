import { $, $$, onScroll, prefersReducedMotion, progressThrough, track } from '../utils';

/** Mapa do Google sob demanda: nenhum script/cookie de terceiro até o usuário pedir. */
export function initMaps(): void {
  $$('[data-map]').forEach((box) => {
    const btn = $('[data-map-load]', box);
    btn?.addEventListener('click', () => {
      const iframe = document.createElement('iframe');
      iframe.src = box.dataset.map ?? '';
      iframe.title = 'Mapa: Ground Security Systems, Av. Marquês de São Vicente, 587, Barra Funda, São Paulo';
      iframe.loading = 'lazy';
      iframe.referrerPolicy = 'no-referrer-when-downgrade';
      iframe.allowFullscreen = true;
      box.replaceChildren(iframe);
      iframe.focus();
    });
  });
}

/** Efeitos ligados ao scroll: parallax do domo, progresso do processo, botão flutuante. */
export function initScrollEffects(): void {
  const hero = $('[data-hero]');
  const process = $('[data-process]');
  const steps = process ? $$('.process__step', process) : [];
  const wa = $('.wa-float');
  const reduce = prefersReducedMotion();
  let hinted = false;

  onScroll((y) => {
    if (hero && !reduce) {
      const p = Math.min(1, Math.max(0, y / Math.max(1, hero.offsetHeight)));
      hero.style.setProperty('--hero-p', p.toFixed(3));
    }
    if (process) {
      const p = progressThrough(process, 0.85, 0.45);
      process.style.setProperty('--progress', p.toFixed(3));
      steps.forEach((s, i) => s.classList.toggle('is-done', p >= i / Math.max(1, steps.length - 1) - 0.02));
    }
    if (wa) {
      const show = y > 480;
      wa.classList.toggle('is-visible', show);
      if (show && !hinted) {
        hinted = true;
        wa.classList.add('is-hint');
        window.setTimeout(() => wa.classList.remove('is-hint'), 3200);
      }
    }
  });
}

/** Cliques de conversão → dataLayer / gtag (se o cliente instalar GTM ou GA4). */
export function initTracking(): void {
  document.addEventListener('click', (e) => {
    const el = (e.target as Element).closest<HTMLElement>('[data-track]');
    if (!el) return;
    const label = el.dataset.track ?? '';
    const kind = label.startsWith('whatsapp') ? 'click_whatsapp' : label.startsWith('telefone') ? 'click_phone' : 'click_cta';
    track(kind, { label, page: location.pathname });
  });
}

/**
 * Pré-carregamento de páginas internas.
 * Chrome/Edge usam as Speculation Rules declaradas no <head>.
 * Nos demais navegadores: prefetch ao passar o mouse ou tocar no link.
 */
export function initPrefetch(): void {
  const supportsRules = HTMLScriptElement.supports?.('speculationrules') ?? false;
  if (supportsRules) return;
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  if (conn?.saveData) return;
  const done = new Set<string>([location.pathname]);
  const prefetch = (a: HTMLAnchorElement): void => {
    const url = new URL(a.href, location.href);
    if (url.origin !== location.origin || done.has(url.pathname) || /\.(pdf|jpg|png|webp|avif)$/i.test(url.pathname)) return;
    done.add(url.pathname);
    const link = document.createElement('link');
    link.rel = 'prefetch';
    link.href = url.pathname;
    document.head.appendChild(link);
  };
  const handler = (e: Event): void => {
    const a = (e.target as Element).closest?.('a[href]') as HTMLAnchorElement | null;
    if (a) prefetch(a);
  };
  document.addEventListener('pointerover', handler, { passive: true });
  document.addEventListener('touchstart', handler, { passive: true });
  document.addEventListener('focusin', handler);
}

/** Filtro do portfólio por solução (botões com aria-pressed). */
export function initFilters(): void {
  $$('[data-filters]').forEach((root) => {
    const buttons = $$<HTMLButtonElement>('button[data-filter]', root);
    const items = $$('[data-tags]', document);
    const count = $('[data-filter-count]');
    const apply = (f: string): void => {
      let n = 0;
      items.forEach((it) => {
        const show = f === 'todos' || (it.dataset.tags ?? '').split(' ').includes(f);
        it.classList.toggle('is-filtered-out', !show);
        if (show) n++;
      });
      buttons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.filter === f)));
      if (count) count.textContent = `${n} ${n === 1 ? 'projeto' : 'projetos'}`;
    };
    buttons.forEach((b) => b.addEventListener('click', () => apply(b.dataset.filter ?? 'todos')));
  });
}
