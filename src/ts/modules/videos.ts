import { $$, prefersReducedMotion } from '../utils';

/**
 * Ícones animados (WebM/MP4 de ~5 KB, convertidos dos GIFs antigos).
 * preload="none" no HTML: só baixa quando o vídeo entra na tela; pausa quando sai.
 * Com reduced-motion fica só o pôster estático.
 */
const visible = new WeakMap<HTMLVideoElement, boolean>();
let io: IntersectionObserver | null = null;

function observer(): IntersectionObserver {
  io ??= new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        const v = e.target as HTMLVideoElement;
        visible.set(v, e.isIntersecting);
        if (e.isIntersecting && !v.closest('[hidden]')) void v.play().catch(() => undefined);
        else v.pause();
      }
    },
    { threshold: 0.25 },
  );
  return io;
}

export function playWhenVisible(v: HTMLVideoElement): void {
  if (prefersReducedMotion()) return;
  if (visible.get(v)) void v.play().catch(() => undefined);
}

export function initVideos(): void {
  if (prefersReducedMotion()) return;
  $$<HTMLVideoElement>('video[muted], video[loop]').forEach((v) => {
    v.muted = true; // garante autoplay em iOS
    observer().observe(v);
  });
}
