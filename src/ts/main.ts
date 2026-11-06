/**
 * Ground Security Systems — entrada principal.
 * Cada módulo é independente e só age se encontrar seus elementos na página.
 * Sem JavaScript o site continua completo: conteúdo, links, FAQ (<details>) e contatos.
 */
import { initHeader } from './modules/header';
import { initReveal } from './modules/reveal';
import { initTabs } from './modules/tabs';
import { initVideos } from './modules/videos';
import { initMarquee } from './modules/marquee';
import { initFaq } from './modules/faq';
import { initTimeline } from './modules/timeline';
import { initForms } from './modules/form';
import { initFilters, initMaps, initPrefetch, initScrollEffects, initTracking } from './modules/misc';

const boot = (): void => {
  initHeader();
  initReveal();
  initVideos();
  initTabs();
  initMarquee();
  initFaq();
  initTimeline();
  initForms();
  initMaps();
  initFilters();
  initScrollEffects();
  initTracking();
  initPrefetch();
};

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
else boot();
