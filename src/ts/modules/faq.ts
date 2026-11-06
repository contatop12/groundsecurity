import { $, $$, prefersReducedMotion } from '../utils';

/**
 * FAQ com <details>/<summary> nativos (acessível e indexável sem JS).
 * O script só anima a altura na abertura/fechamento e mantém um item aberto por vez.
 */
export function initFaq(): void {
  $$('[data-faq]').forEach((root) => {
    const items = $$<HTMLDetailsElement>('details', root);
    items.forEach((d) => {
      const summary = $('summary', d);
      const body = $('.faq__a', d);
      if (!summary || !body) return;
      summary.addEventListener('click', (e) => {
        if (prefersReducedMotion()) return;
        e.preventDefault();
        if (d.open) close(d, body);
        else {
          items.filter((o) => o !== d && o.open).forEach((o) => {
            const b = $('.faq__a', o);
            if (b) close(o, b);
          });
          open(d, body);
        }
      });
    });
  });
}

const OPTS: KeyframeAnimationOptions = { duration: 420, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' };

function open(d: HTMLDetailsElement, body: HTMLElement): void {
  d.open = true;
  const h = body.scrollHeight;
  body.animate([{ height: '0px', opacity: 0 }, { height: `${h}px`, opacity: 1 }], OPTS);
}

function close(d: HTMLDetailsElement, body: HTMLElement): void {
  const h = body.scrollHeight;
  const anim = body.animate([{ height: `${h}px`, opacity: 1 }, { height: '0px', opacity: 0 }], OPTS);
  anim.onfinish = () => (d.open = false);
}
