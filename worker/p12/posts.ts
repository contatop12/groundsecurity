// Posts do blog como o contrato v3 os vê (`posts.listar`, `post.ler`). Na Ground todo post do blog é do Rankeando (tabela p12_posts do D1):
// o site não tem posts escritos no código. Cada um tem um `id_no_site` estável (worker/p12/ids.ts).
import { SITE_URL } from './constantes';
import type { PostP12 } from './contrato';
import { idDoPostDoPublisher } from './ids';
import type { P12Store } from './store';

/** Um post do blog, como `posts.listar` o mostra. */
export type Entrada = {
  idNoSite: string;
  slug: string;
  /** Endereço público completo (https). */
  url: string;
  titulo: string;
  publicadoEm: string;
  atualizadoEm: string;
  categoriaSlug: string | null;
  /** O id que o Rankeando mandou no `post.publicar`. */
  origem: string;
};

/** Endereço de um post (o do contrato: /blog/<slug>/). */
export const urlDoPost = (slug: string) => `${SITE_URL}/blog/${slug}/`;
const iso = (s: string) => new Date(s).toISOString();

/** Todos os posts do blog, do mais novo ao mais velho (empate pelo `id_no_site`). */
export async function entradas(store: P12Store): Promise<Entrada[]> {
  const resumos = await store.resumos();
  return resumos
    .map((r): Entrada => ({
      idNoSite: idDoPostDoPublisher(r.id), slug: r.slug, url: urlDoPost(r.slug), titulo: r.titulo, publicadoEm: iso(r.publicadoEm), atualizadoEm: iso(r.atualizadoEm),
      categoriaSlug: r.categoria, origem: r.id,
    }))
    .sort((a, b) => (a.publicadoEm < b.publicadoEm ? 1 : a.publicadoEm > b.publicadoEm ? -1 : a.idNoSite < b.idNoSite ? -1 : a.idNoSite > b.idNoSite ? 1 : 0));
}

// ------------------------------------------------------------------------------------------ posts.listar

const MAX_RESPOSTA_LISTA = 60_000;
/** O cursor diz onde o último post da página está na ordem: a data de publicação e o id dele. */
const cursorDe = (e: Entrada) => {
  const bytes = new TextEncoder().encode(`${e.publicadoEm}|${e.idNoSite}`);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
function lerCursor(c: string): { publicadoEm: string; idNoSite: string } | null {
  try {
    const bin = atob(c.replace(/-/g, '+').replace(/_/g, '/'));
    const texto = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(Uint8Array.from(bin, (ch) => ch.charCodeAt(0)));
    const i = texto.indexOf('|');
    return i > 0 && !Number.isNaN(Date.parse(texto.slice(0, i))) && texto.slice(0, i) === new Date(texto.slice(0, i)).toISOString() ? { publicadoEm: texto.slice(0, i), idNoSite: texto.slice(i + 1) } : null;
  } catch {
    return null;
  }
}

export type PedidoDeLista = { limite: number; cursor: string | null; desde: number | null; ate: number | null };
export type PaginaDePosts = { posts: Record<string, unknown>[]; total: number; proximo_cursor: string | null };

/** Uma página da lista, ou null para um cursor que este site não deu. */
export function paginaDePosts(todas: Entrada[], q: PedidoDeLista): PaginaDePosts | null {
  const janela = todas.filter((e) => {
    const t = Date.parse(e.publicadoEm);
    return (q.desde === null || t >= q.desde) && (q.ate === null || t <= q.ate);
  });
  let inicio = 0;
  if (q.cursor !== null) {
    const c = lerCursor(q.cursor);
    if (!c) return null;
    // Primeiro post depois do que o cursor nomeia: mais velho, ou da mesma data com id posterior.
    inicio = janela.findIndex((e) => e.publicadoEm < c.publicadoEm || (e.publicadoEm === c.publicadoEm && e.idNoSite > c.idNoSite));
    if (inicio < 0) inicio = janela.length;
  }
  let fim = Math.min(inicio + q.limite, janela.length);
  const item = (e: Entrada) => ({
    id_no_site: e.idNoSite, slug: e.slug, url: e.url, titulo: e.titulo, publicado_em: e.publicadoEm, atualizado_em: e.atualizadoEm,
    categoria_slug: e.categoriaSlug, origem: e.origem,
  });
  let posts = janela.slice(inicio, fim).map(item);
  // A resposta não passa de 64 KB: uma página de títulos muito longos é encurtada (o cursor aponta para depois do último dado).
  while (posts.length > 1 && JSON.stringify(posts).length > MAX_RESPOSTA_LISTA) {
    fim--;
    posts = posts.slice(0, -1);
  }
  return { posts, total: janela.length, proximo_cursor: fim < janela.length && fim > inicio ? cursorDe(janela[fim - 1]!) : null };
}

// ----------------------------------------------------------------------------------------- post.ler

/** O que `post.ler` responde (ao lado de `ok`): o post como o site o mostra hoje. */
export type PostLido = {
  id_no_site: string;
  slug: string;
  url: string;
  titulo: string;
  conteudo_html: string;
  publicado_em: string;
  atualizado_em: string;
  conteudo_markdown: string;
  seo: { titulo: string; descricao: string; palavra_chave: string };
  faq_jsonld: Record<string, unknown> | null;
  capa?: { url: string; alt: string };
};

/** A entrada com este `id_no_site`, ou null (o id não é do site). */
export const acharEntrada = (todas: Entrada[], idNoSite: string) => todas.find((e) => e.idNoSite === idNoSite) ?? null;

/** O post de uma entrada como `post.ler` o entrega, ou null quando a linha do D1 sumiu. */
export async function lerPostDaEntrada(e: Entrada, store: P12Store): Promise<PostLido | null> {
  const reg = await store.porId(e.origem);
  const p: PostP12 | null = reg ? await store.post(reg.slug) : null;
  if (!p) return null;
  return {
    id_no_site: e.idNoSite, slug: p.slug, url: urlDoPost(p.slug), titulo: p.titulo, conteudo_html: p.conteudo_html, publicado_em: p.publicado_em,
    atualizado_em: p.atualizado_em, conteudo_markdown: p.conteudo_markdown,
    seo: { titulo: p.seo.titulo, descricao: p.seo.descricao, palavra_chave: p.seo.palavra_chave ?? '' },
    faq_jsonld: p.faq_jsonld, ...(p.capa ? { capa: p.capa } : {}),
  };
}
