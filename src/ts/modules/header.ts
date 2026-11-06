import { $, $$, onScroll } from '../utils';

/** Header fixo: sombra ao rolar, esconde ao descer e reaparece ao subir; dropdown e menu mobile. */
export function initHeader(): void {
  const header = $('[data-header]');
  const progress = $('.scroll-progress');
  if (!header) return;

  let lastY = window.scrollY;
  onScroll((y) => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    progress?.style.setProperty('--progress', String(max > 0 ? y / max : 0));
    header.classList.toggle('is-scrolled', y > 8);
    const menuOpen = document.body.classList.contains('menu-open');
    const goingDown = y > lastY + 4;
    const goingUp = y < lastY - 4;
    if (!menuOpen && !header.contains(document.activeElement)) {
      if (goingDown && y > 320) header.classList.add('is-hidden');
      else if (goingUp || y < 320) header.classList.remove('is-hidden');
    }
    lastY = y;
  });

  initDropdown();
  initMobileMenu();
}

function initDropdown(): void {
  $$<HTMLButtonElement>('.nav__toggle').forEach((btn) => {
    const menu = document.getElementById(btn.getAttribute('aria-controls') ?? '');
    if (!menu) return;
    const set = (open: boolean): void => {
      btn.setAttribute('aria-expanded', String(open));
      menu.classList.toggle('is-open', open);
    };
    btn.addEventListener('click', () => set(btn.getAttribute('aria-expanded') !== 'true'));
    btn.parentElement?.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        set(false);
        btn.focus();
      }
    });
    btn.parentElement?.addEventListener('focusout', (e) => {
      if (!btn.parentElement?.contains(e.relatedTarget as Node)) set(false);
    });
    document.addEventListener('click', (e) => {
      if (!btn.parentElement?.contains(e.target as Node)) set(false);
    });
  });
}

function initMobileMenu(): void {
  const btn = $<HTMLButtonElement>('.menu-btn');
  const menu = $('#menu-mobile');
  if (!btn || !menu) return;

  const focusables = (): HTMLElement[] => $$<HTMLElement>('a, button', menu);
  const set = (open: boolean): void => {
    btn.setAttribute('aria-expanded', String(open));
    btn.setAttribute('aria-label', open ? 'Fechar menu' : 'Abrir menu');
    menu.classList.toggle('is-open', open);
    document.body.classList.toggle('menu-open', open);
    $('[data-header]')?.classList.remove('is-hidden');
    if (open) focusables()[0]?.focus({ preventScroll: true });
  };

  btn.addEventListener('click', () => set(btn.getAttribute('aria-expanded') !== 'true'));
  menu.addEventListener('click', (e) => {
    if ((e.target as Element).closest('a')) set(false);
  });
  document.addEventListener('keydown', (e) => {
    if (!menu.classList.contains('is-open')) return;
    if (e.key === 'Escape') {
      set(false);
      btn.focus();
    }
    // Mantém o foco dentro do menu (diálogo modal)
    if (e.key === 'Tab') {
      const items = [btn, ...focusables()];
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    }
  });
  window.matchMedia('(min-width: 1025px)').addEventListener('change', (m) => m.matches && set(false));
}
