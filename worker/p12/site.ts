// As páginas do site que passam pelo Worker. Tudo o que não é do blog sai do jeito que o build fez (arquivos estáticos):
//   /blog/                   lista dos posts do Rankeando (paginada com ?page=N) e chips das categorias
//   /blog/<slug>/            um post do Rankeando (D1), com o cabeçalho, o rodapé e o CSS reais do site
//   /blog/categoria/<slug>/  uma categoria do Rankeando
//   /sitemap.xml, /feed.xml  o sitemap do build com os posts e as categorias; o RSS do blog
// Enquanto não há post nenhum, /blog/ leva a /imprensa-e-eventos/ com 302 (temporário: o link "Blog" do menu passa a abrir o blog no 1º post).
import { SLUG } from './contrato';
import { prepararConteudo } from './conteudo';
import { urlDoPost } from './posts';
import {
  chipsDasCategorias, familiaDaCategoria, feedXml, paginaDaCategoria, paginaDoBlog, paginaDoPost, sitemapMesclado, cartaoHtml, POR_PAGINA,
} from './render';
import { D1Store, type Cartao } from './store';
import { SLUGS_RESERVADOS } from './webhook';

export type SiteEnv = { ASSETS: Fetcher; DB: D1Database };

const asset = (env: SiteEnv, origin: string, path: string) => env.ASSETS.fetch(new Request(new URL(path, origin)));
const log = (message: string, e: unknown) => console.error({ message, error: e instanceof Error ? e.message : String(e) });
// Sem cache no navegador: um slug antigo pode virar outro post depois.
const redirect = (location: string, status = 301) => new Response(null, { status, headers: { location, 'cache-control': 'no-cache' } });
/** A página 404 do site (not_found_handling), com o status 404. */
const naoExiste = (env: SiteEnv, origin: string) => asset(env, origin, '/p12-nao-existe/');

const indisponivel = () =>
  new Response('Página temporariamente indisponível. Tente de novo em instantes.', {
    status: 503,
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', 'retry-after': '60' },
  });

/** Cabeçalhos do modelo (segurança e cache de _headers). O CSP libera imagens e vídeos de outros endereços https: os posts trazem imagens do Rankeando. */
function cabecalhosDaPagina(modelo: Response): Headers {
  const headers = new Headers(modelo.headers);
  for (const h of ['content-length', 'content-encoding', 'etag', 'last-modified']) headers.delete(h);
  headers.set('content-type', 'text/html; charset=utf-8');
  const csp = headers.get('content-security-policy');
  if (csp) {
    headers.set(
      'content-security-policy',
      csp.replace("img-src 'self' data:", "img-src 'self' data: https:").replace('frame-src https://www.google.com', 'frame-src https://www.google.com https://www.youtube-nocookie.com'),
    );
  }
  return headers;
}

/** Uma página montada a partir do modelo, com os cabeçalhos dele. */
const pagina = (corpo: string, modelo: Response, request: Request, status = 200) =>
  new Response(request.method === 'HEAD' ? null : corpo, { status, headers: cabecalhosDaPagina(modelo) });

/** O modelo de página do build (cabeçalho, rodapé e CSS reais do site). Só um deploy o muda; um deploy começa isolates novos. */
let modeloDoDeploy: string | null = null;
async function carregarModelo(env: SiteEnv, origin: string): Promise<{ texto: string; res: Response }> {
  const res = await asset(env, origin, '/p12-kit/');
  if (!res.ok) throw new Error(`modelo de página do blog respondeu ${res.status}`);
  modeloDoDeploy ??= await res.clone().text();
  return { texto: modeloDoDeploy, res };
}

const cartoesDe = async (store: D1Store, ids: string[]): Promise<Cartao[]> => {
  const mapa = new Map((await store.cartoes(ids)).map((c) => [c.id, c]));
  // A ordem da página é a dos ids (o D1 não garante a ordem do IN)
  return ids.flatMap((id) => (mapa.has(id) ? [mapa.get(id)!] : []));
};

/** ?page=N válido (1 a 9999), ou 0 quando está errado. */
const numeroDaPagina = (url: URL) => {
  const bruto = url.searchParams.get('page');
  return bruto === null ? 1 : /^[1-9]\d{0,3}$/.test(bruto) ? Number(bruto) : 0;
};

// ---------------------------------------------------------------------------------------------------- /blog/

async function servirBlog(env: SiteEnv, url: URL, request: Request): Promise<Response> {
  const store = new D1Store(env.DB);
  try {
    const [resumos, categorias] = await Promise.all([store.resumos(), store.categorias()]);
    // Sem posts, o blog ainda não existe: redireciona, mas com 302 para o navegador não guardar.
    if (!resumos.length) return redirect('/imprensa-e-eventos/', 302);
    const paginas = Math.ceil(resumos.length / POR_PAGINA);
    const numero = numeroDaPagina(url);
    if (!numero || numero > paginas) return await naoExiste(env, url.origin);
    const { texto, res } = await carregarModelo(env, url.origin);
    const cartoes = await cartoesDe(store, resumos.slice((numero - 1) * POR_PAGINA, numero * POR_PAGINA).map((r) => r.id));
    const html = paginaDoBlog(texto, { cartoes: cartoes.map((c) => cartaoHtml(c, 'h2')), chips: chipsDasCategorias(categorias), total: resumos.length, numero, paginas });
    return pagina(html, res, request);
  } catch (e) {
    log('p12: /blog/ indisponível', e);
    return indisponivel();
  }
}

// -------------------------------------------------------------------------------- /blog/categoria/<slug>/

async function servirCategoria(env: SiteEnv, url: URL, request: Request, slug: string): Promise<Response> {
  const store = new D1Store(env.DB);
  try {
    const [resumos, categorias] = await Promise.all([store.resumos(), store.categorias()]);
    const categoria = categorias.find((x) => x.slug === slug);
    const familia = new Set(familiaDaCategoria(categorias, slug));
    const daCategoria = resumos.filter((r) => r.categoria && familia.has(r.categoria));
    if (!categoria || !daCategoria.length) return await naoExiste(env, url.origin);
    const paginas = Math.ceil(daCategoria.length / POR_PAGINA);
    const numero = numeroDaPagina(url);
    if (!numero || numero > paginas) return await naoExiste(env, url.origin);
    const { texto, res } = await carregarModelo(env, url.origin);
    const cartoes = await cartoesDe(store, daCategoria.slice((numero - 1) * POR_PAGINA, numero * POR_PAGINA).map((r) => r.id));
    const mae = categoria.pai ? categorias.find((x) => x.slug === categoria.pai && !x.pai) : undefined;
    const html = paginaDaCategoria(texto, {
      categoria: { slug, nome: categoria.nome, descricao: categoria.descricao, mae: mae ? { slug: mae.slug, nome: mae.nome } : null },
      cartoes: cartoes.map((c) => cartaoHtml(c, 'h2')),
      chips: chipsDasCategorias(categorias),
      total: daCategoria.length,
      totalGeral: resumos.length,
      numero,
      paginas,
    });
    return pagina(html, res, request);
  } catch (e) {
    log('p12: categoria do blog indisponível', e);
    return indisponivel();
  }
}

// --------------------------------------------------------------------------------------- /blog/<slug>/

/** O post em /blog/<slug>/, um 301 até ele (slug antigo ou endereço sem a barra: `canonico` falso), ou null (404). */
async function servirPost(env: SiteEnv, url: URL, request: Request, slug: string, canonico: boolean): Promise<Response | null> {
  const store = new D1Store(env.DB);
  let post: Awaited<ReturnType<D1Store['post']>>;
  try {
    post = await store.post(slug);
    if (!post) {
      const atual = await store.slugAtualDoAntigo(slug);
      return atual ? redirect(`/blog/${atual}/${url.search}`) : null;
    }
  } catch (e) {
    log('p12: consulta do post falhou', e);
    return indisponivel();
  }
  if (!canonico) return redirect(`/blog/${slug}/${url.search}`);
  try {
    const [{ texto, res }, resumos] = await Promise.all([carregarModelo(env, url.origin), store.resumos()]);
    const cat = post.categoria;
    const trilha = [
      { name: 'Blog', path: '/blog/' },
      ...(cat?.pai && cat.pai_nome ? [{ name: cat.pai_nome, path: `/blog/categoria/${cat.pai}/` }] : []),
      ...(cat ? [{ name: cat.nome, path: `/blog/categoria/${cat.slug}/` }] : []),
      { name: post.titulo },
    ];
    // "Continue lendo": os 3 posts mais novos fora o próprio
    const outros = resumos.filter((r) => r.slug !== slug).slice(0, 3);
    const relacionados = (await cartoesDe(store, outros.map((r) => r.id))).map((c) => cartaoHtml(c, 'h3'));
    const html = paginaDoPost(texto, {
      post,
      conteudo: await prepararConteudo(post.conteudo_html),
      url: urlDoPost(slug),
      trilha,
      categoria: cat
        ? { href: `/blog/categoria/${cat.slug}/`, nome: cat.nome, pai: cat.pai && cat.pai_nome ? { href: `/blog/categoria/${cat.pai}/`, nome: cat.pai_nome } : null }
        : null,
      secoes: cat ? [cat.nome] : [],
      relacionados,
    });
    return pagina(html, res, request);
  } catch (e) {
    log('p12: post do blog indisponível', e);
    return indisponivel();
  }
}

// ------------------------------------------------------------------------------------ sitemap e feed

async function servirSitemap(env: SiteEnv, request: Request): Promise<Response> {
  try {
    const res = await env.ASSETS.fetch(request);
    if (res.status !== 200) return res;
    const store = new D1Store(env.DB);
    const [resumos, categorias] = await Promise.all([store.resumos(), store.categorias()]);
    if (!resumos.length) return res;
    const ultima = (slug: string) => {
      const familia = new Set(familiaDaCategoria(categorias, slug));
      return resumos.filter((r) => r.categoria && familia.has(r.categoria)).map((r) => r.atualizadoEm).sort().at(-1) ?? null;
    };
    const xml = sitemapMesclado(await res.text(), {
      posts: resumos.map((r) => ({ slug: r.slug, atualizadoEm: r.atualizadoEm })),
      categorias: categorias.flatMap((x) => {
        const u = ultima(x.slug);
        return u ? [{ slug: x.slug, ultima: u }] : [];
      }),
    });
    const headers = new Headers(res.headers);
    for (const h of ['content-length', 'content-encoding', 'etag', 'last-modified']) headers.delete(h);
    return new Response(request.method === 'HEAD' ? null : xml, { status: 200, headers });
  } catch (e) {
    log('p12: sitemap sem os posts do blog (arquivo estático)', e);
    return env.ASSETS.fetch(request);
  }
}

async function servirFeed(env: SiteEnv, request: Request): Promise<Response> {
  try {
    const store = new D1Store(env.DB);
    const [resumos, categorias] = await Promise.all([store.resumos(), store.categorias()]);
    const xml = feedXml({
      posts: resumos.map((r) => ({ slug: r.slug, titulo: r.titulo, descricao: r.resumo, publicadoEm: r.publicadoEm, categoria: categorias.find((x) => x.slug === r.categoria)?.nome ?? null })),
    });
    return new Response(request.method === 'HEAD' ? null : xml, {
      status: 200,
      headers: { 'content-type': 'application/rss+xml; charset=utf-8', 'cache-control': 'public, max-age=300' },
    });
  } catch (e) {
    log('p12: feed indisponível', e);
    return indisponivel();
  }
}

// -------------------------------------------------------------------------------------------- roteador

export async function servirSite(request: Request, env: SiteEnv): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') return env.ASSETS.fetch(request);
  const url = new URL(request.url);
  const { pathname } = url;
  try {
    // O modelo é do build: nenhum visitante o vê
    if (pathname === '/p12-kit' || pathname.startsWith('/p12-kit/')) return await naoExiste(env, url.origin);
    if (pathname === '/sitemap.xml') return await servirSitemap(env, request);
    if (pathname === '/feed.xml') return await servirFeed(env, request);
    if (pathname === '/blog') return redirect(`/blog/${url.search}`);
    if (pathname === '/blog/') return await servirBlog(env, url, request);

    const cat = /^\/blog\/categoria\/([^/]+)(\/?)$/.exec(pathname);
    if (cat && SLUG.test(cat[1]!)) return cat[2] === '/' ? await servirCategoria(env, url, request, cat[1]!) : redirect(`${pathname}/${url.search}`);

    const post = /^\/blog\/([^/]+?)(\/?)$/.exec(pathname);
    if (post && SLUG.test(post[1]!) && !SLUGS_RESERVADOS.has(post[1]!)) {
      const r = await servirPost(env, url, request, post[1]!, post[2] === '/');
      if (r) return r;
    }
    // Qualquer outro endereço do blog: a página 404 do site
    if (pathname.startsWith('/blog/')) return await naoExiste(env, url.origin);
    return env.ASSETS.fetch(request);
  } catch (e) {
    log('p12: erro no Worker', e);
    return indisponivel();
  }
}
