// Constantes do site que o Worker usa.
export const SITE_URL = 'https://groundsecurity.com.br';
export const SITE_NAME = 'Ground Security Systems';

/** Minutos de leitura: 200 palavras por minuto, no mínimo 2. */
export const readingMinutes = (texto: string) => Math.max(2, Math.round(texto.split(/\s+/).filter(Boolean).length / 200));
