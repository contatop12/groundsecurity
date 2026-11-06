import { $, $$ } from '../utils';
import { playWhenVisible } from './videos';

/**
 * Console de soluções — abas acessíveis (WAI-ARIA Tabs, ativação automática).
 * Sem JS todos os painéis ficam visíveis (conteúdo indexável); o script esconde os inativos.
 */
export function initTabs(): void {
  $$('[data-tabs]').forEach((root) => {
    const list = $('[role="tablist"]', root);
    const tabs = $$<HTMLButtonElement>('[role="tab"]', root);
    const panels = tabs.map((t) => document.getElementById(t.getAttribute('aria-controls') ?? ''));
    const indicator = $('.console__indicator', root);
    if (!list || tabs.length === 0) return;

    const moveIndicator = (tab: HTMLElement): void => {
      if (!indicator) return;
      indicator.style.setProperty('--y', `${tab.offsetTop}px`);
      indicator.style.setProperty('--h', `${tab.offsetHeight}px`);
    };

    const select = (index: number, focus = false): void => {
      tabs.forEach((tab, i) => {
        const active = i === index;
        const panel = panels[i];
        tab.setAttribute('aria-selected', String(active));
        tab.tabIndex = active ? 0 : -1;
        if (!panel) return;
        if (active) {
          const wasHidden = panel.hidden;
          panel.hidden = false;
          if (wasHidden) {
            panel.classList.remove('is-entering');
            void panel.offsetWidth; // reinicia a animação
            panel.classList.add('is-entering');
          }
        } else {
          panel.hidden = true;
        }
        panel.querySelectorAll('video').forEach((v) => (active ? playWhenVisible(v) : v.pause()));
      });
      const tab = tabs[index];
      if (tab) {
        moveIndicator(tab);
        if (focus) tab.focus();
        // No mobile as abas rolam na horizontal: mantém a ativa visível
        if (list.scrollWidth > list.clientWidth) tab.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      }
    };

    tabs.forEach((tab, i) => {
      tab.addEventListener('click', () => select(i));
      tab.addEventListener('keydown', (e) => {
        const last = tabs.length - 1;
        const map: Record<string, number> = {
          ArrowDown: i === last ? 0 : i + 1,
          ArrowRight: i === last ? 0 : i + 1,
          ArrowUp: i === 0 ? last : i - 1,
          ArrowLeft: i === 0 ? last : i - 1,
          Home: 0,
          End: last,
        };
        const next = map[e.key];
        if (next === undefined) return;
        e.preventDefault();
        select(next, true);
      });
    });

    const initial = Math.max(0, tabs.findIndex((t) => t.getAttribute('aria-selected') === 'true'));
    panels.forEach((p, i) => p && i !== initial && (p.hidden = true));
    select(initial);
    new ResizeObserver(() => {
      const active = tabs.find((t) => t.getAttribute('aria-selected') === 'true');
      if (active) moveIndicator(active);
    }).observe(list);
  });
}
