// Marcação das páginas do blog que o Worker monta com os posts do Rankeando. Nada aqui inventa layout: as páginas partem do modelo
// que o build gera com o cabeçalho, o rodapé, o CSS e o JS reais do site (dist/p12-kit/index.html, fonte em p12-kit/index.html) e só
// preenchem os campos @@...@@ e o miolo da página. Tudo é texto puro (sem HTMLRewriter), então roda igual no Worker e nos testes.
import { SITE_NAME, SITE_URL, readingMinutes } from './constantes';
import type { Assinatura, PostP12 } from './contrato';
import type { Cartao, CategoriaComPosts } from './store';

// ---------------------------------------------------------------------------------------------------------- texto

export const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** JSON dentro de <script>: todo "<" vira < (o texto vem de artigo e </script> fecharia a tag). */
export const jsonEmScript = (v: unknown) => JSON.stringify(v).replace(/</g, '\\u003c');

const MESES = ['jan.', 'fev.', 'mar.', 'abr.', 'mai.', 'jun.', 'jul.', 'ago.', 'set.', 'out.', 'nov.', 'dez.'];
const fmtSP = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: 'numeric', day: 'numeric' });

/** "13 de nov. de 2026", no horário de São Paulo. */
export function dataBr(iso: string): string {
  const p = Object.fromEntries(fmtSP.formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return `${Number(p.day)} de ${MESES[Number(p.month) - 1]} de ${p.year}`;
}

const https = (u: string | null): URL | null => {
  if (!u) return null;
  try {
    const x = new URL(u);
    return x.protocol === 'https:' ? x : null;
  } catch {
    return null;
  }
};

// ---------------------------------------------------------------------------------------------------- sumário

export type TocItem = { depth: 2 | 3; text: string; slug: string };
export type Conteudo = { html: string; toc: TocItem[] };

/** Sumário a partir dos títulos do corpo: os dois níveis de cima, como 2 e 3. */
export function toc(headings: { depth: number; text: string; slug: string }[]): TocItem[] {
  const inBody = headings.filter((h) => h.depth >= 2);
  if (!inBody.length) return [];
  const top = Math.min(...inBody.map((h) => h.depth));
  return inBody.filter((h) => h.depth <= top + 1).map((h) => ({ depth: (h.depth === top ? 2 : 3) as 2 | 3, text: h.text, slug: h.slug }));
}

/** O sumário: só os títulos de nível 2, e só quando há mais de dois. */
export function sumarioHtml(itens: TocItem[]): string {
  const h2 = itens.filter((t) => t.depth === 2);
  if (h2.length <= 2) return '';
  return `<nav class="toc" aria-label="Neste artigo"><p class="toc__title">Neste artigo</p><ol>${h2.map((t) => `<li><a href="#${esc(t.slug)}">${esc(t.text)}</a></li>`).join('')}</ol></nav>`;
}

// ----------------------------------------------------------------------------------------------- assinatura

/** A caixa "Escrito por" do fim do post (campo opcional `post.assinatura`). Todo texto é escapado; foto e link só em https. */
export function caixaAssinatura(a: Assinatura): string {
  const pessoa = a.tipo === 'pessoa';
  const foto = https(a.foto_url);
  const link = https(a.link_url);
  const cargo = [a.funcao.trim(), a.registro.trim()].filter(Boolean).map(esc).join(' · ');
  const bio = a.curriculo.trim() ? esc(a.curriculo.trim()).replace(/\r\n|\r|\n/g, '<br>') : '';
  const rotulo = pessoa ? 'Escrito por' : 'Publicado por';
  return (
    `<aside class="rankeando-assinatura" aria-label="${rotulo} ${esc(a.nome)}">` +
    (foto ? `<img class="rankeando-assinatura__foto" src="${esc(foto.href)}" alt="${esc(a.nome)}" width="88" height="88" loading="lazy" decoding="async">` : '') +
    `<div class="rankeando-assinatura__texto"><p class="rankeando-assinatura__rotulo">${rotulo}</p>` +
    `<p class="rankeando-assinatura__nome">${esc(a.nome)}</p>` +
    (cargo ? `<p class="rankeando-assinatura__cargo">${cargo}</p>` : '') +
    (bio ? `<p class="rankeando-assinatura__bio">${bio}</p>` : '') +
    (link ? `<p class="rankeando-assinatura__link"><a href="${esc(link.href)}" rel="noopener">${pessoa ? 'Conheça a formação completa' : 'Saiba mais'}</a></p>` : '') +
    '</div></aside>'
  );
}

// -------------------------------------------------------------------------------------------------- cartões

export type CartaoDoBlog = Cartao;

/** O cartão de um post nas listas e em "Continue lendo". */
export function cartaoHtml(c: CartaoDoBlog, titulo: 'h2' | 'h3' = 'h3'): string {
  const capa = c.capa && https(c.capa.url);
  return (
    `<article class="post-card">` +
    `<a class="post-card__link" href="/blog/${esc(c.slug)}/">` +
    (capa ? `<span class="post-card__media"><img src="${esc(capa.href)}" width="720" height="405" alt="" loading="lazy" decoding="async"></span>` : '') +
    `<span class="post-card__body"><span class="post-card__cat">${esc(c.categoria?.nome ?? 'Blog')}</span>` +
    `<${titulo} class="post-card__title">${esc(c.titulo.replace(/\.+$/, ''))}</${titulo}>` +
    (c.resumo ? `<span class="post-card__lede">${esc(c.resumo)}</span>` : '') +
    `<span class="post-card__meta"><time datetime="${esc(c.publicadoEm)}">${dataBr(c.publicadoEm)}</time><span>${c.minutos} min de leitura</span></span></span></a></article>`
  );
}

/** Os slugs de uma categoria e das suas subcategorias (a página da mãe lista os posts das filhas). */
export function familiaDaCategoria(categorias: { slug: string; pai: string | null }[], slug: string): string[] {
  const topo = new Set(categorias.filter((c) => !c.pai).map((c) => c.slug));
  return [slug, ...categorias.filter((c) => c.pai === slug && topo.has(slug)).map((c) => c.slug)];
}

// ------------------------------------------------------------------------------------------------ trilhas

export type Passo = { name: string; path?: string };

const abs = (p: string) => (p.startsWith('http') ? p : SITE_URL + p);

/** A trilha visível: o mesmo markup `nav.breadcrumb` das outras páginas do site. */
export function trilhaHtml(passos: Passo[]): string {
  const todos: Passo[] = [{ name: 'Início', path: '/' }, ...passos];
  return (
    `<nav class="breadcrumb" aria-label="Trilha de navegação"><ol>` +
    todos.map((p, i) => (i === todos.length - 1 ? `<li><span aria-current="page">${esc(p.name)}</span></li>` : `<li><a href="${esc(p.path ?? '/')}">${esc(p.name)}</a></li>`)).join('') +
    `</ol></nav>`
  );
}

export function breadcrumbLd(url: string, passos: Passo[]) {
  const todos: Passo[] = [{ name: 'Início', path: '/' }, ...passos];
  return {
    '@type': 'BreadcrumbList',
    '@id': `${url}#trilha`,
    itemListElement: todos.map((p, i) => ({ '@type': 'ListItem', position: i + 1, name: p.name, ...(p.path || i === todos.length - 1 ? { item: p.path ? abs(p.path) : url } : {}) })),
  };
}

// ------------------------------------------------------------------------------------------------ JSON-LD

const ORG = { '@id': `${SITE_URL}/#organizacao` };
const SITE = { '@id': `${SITE_URL}/#site` };

export type DadosDoPost = {
  url: string;
  titulo: string;
  descricao: string;
  seoTitulo: string;
  publicadoEm: string;
  atualizadoEm: string;
  capaUrl: string | null;
  secoes: string[];
  palavras: number;
  minutos: number;
  autor: { tipo: 'Person' | 'Organization'; nome: string };
  trilha: Passo[];
};

/**
 * O grafo da página de um post (a organização e o site já vêm no <head> do modelo, com os mesmos @id): a página, a trilha e o
 * BlogPosting. O FAQPage do Rankeando vai à parte (segunda <script>).
 */
export function grafoDoPost(d: DadosDoPost): string {
  return jsonEmScript({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebPage',
        '@id': `${d.url}#pagina`,
        url: d.url,
        name: d.seoTitulo,
        description: d.descricao,
        isPartOf: SITE,
        about: ORG,
        inLanguage: 'pt-BR',
        breadcrumb: { '@id': `${d.url}#trilha` },
        ...(d.capaUrl ? { primaryImageOfPage: { '@type': 'ImageObject', url: d.capaUrl } } : {}),
      },
      breadcrumbLd(d.url, d.trilha),
      {
        '@type': 'BlogPosting',
        '@id': `${d.url}#artigo`,
        headline: d.titulo.slice(0, 110),
        description: d.descricao,
        ...(d.capaUrl ? { image: [d.capaUrl] } : {}),
        datePublished: d.publicadoEm,
        dateModified: d.atualizadoEm,
        author: { '@type': d.autor.tipo, name: d.autor.nome, ...(d.autor.tipo === 'Organization' ? { parentOrganization: ORG } : {}) },
        publisher: ORG,
        mainEntityOfPage: { '@id': `${d.url}#pagina` },
        isPartOf: { '@id': `${SITE_URL}/blog/#blog` },
        ...(d.secoes.length ? { articleSection: d.secoes } : {}),
        wordCount: d.palavras,
        timeRequired: `PT${d.minutos}M`,
        inLanguage: 'pt-BR',
      },
    ],
  });
}

/** O FAQPage do post (já pronto, vindo do Rankeando) como segunda <script>. Vazio quando o post não tem FAQ. */
export const scriptDoFaq = (faq: Record<string, unknown> | null) => (faq ? `</script><script type="application/ld+json">${jsonEmScript(faq)}` : '');

// ---------------------------------------------------------------------------- o modelo (dist/p12-kit/index.html)

export type CamposDaPagina = {
  /** Texto puro do <title> e do Open Graph. */
  titulo: string;
  descricao: string;
  /** Endereço canônico completo. */
  url: string;
  ogTipo: 'article' | 'website';
  /** Imagem social (https): sem ela ficam a imagem padrão do site. */
  imagem: string | null;
  imagemAlt: string;
  /** JSON-LD já pronto (jsonEmScript); o FAQPage pode vir depois, em `scriptDoFaq`. */
  ld: string;
  /** O miolo da página (dentro de <main>, antes da faixa de contato do site). */
  main: string;
  /** Quando é falso, a página sai com noindex (ex.: erro). Padrão: indexável. */
  indexar?: boolean;
};

const ROBOTS_DO_MODELO = '<meta name="robots" content="noindex, nofollow">';
const ROBOTS_DO_SITE = '<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1">';
const TOKENS = ['titulo', 'descricao', 'url', 'ogTipo', 'ld', 'main'] as const;

/** Troca todas as ocorrências de `de` (texto literal, sem padrões de $) por `por`. */
const trocar = (s: string, de: string, por: string) => s.split(de).join(por);

/** Confere que o modelo trouxe todos os campos: é o que o build do site garante (vite.config.ts, p12KitPlugin). */
export function modeloCompleto(modelo: string): string[] {
  const falta = TOKENS.filter((t) => !modelo.includes(`@@${t}@@`)).map((t) => `@@${t}@@`);
  if (!modelo.includes(ROBOTS_DO_MODELO)) falta.push('robots');
  return falta;
}

/** Preenche o modelo do site com os campos de uma página do blog. */
export function montarPagina(modelo: string, c: CamposDaPagina): string {
  const falta = modeloCompleto(modelo);
  if (falta.length) throw new Error(`p12: modelo do site sem ${falta.join(', ')}`);
  // O miolo e o JSON-LD entram por último: o texto deles nunca é lido como campo.
  let html = modelo;
  html = trocar(html, '@@titulo@@', esc(c.titulo));
  html = trocar(html, '@@descricao@@', esc(c.descricao));
  html = trocar(html, '@@url@@', esc(c.url));
  html = trocar(html, '@@ogTipo@@', c.ogTipo);
  if (c.indexar !== false) html = trocar(html, ROBOTS_DO_MODELO, ROBOTS_DO_SITE);
  else html = trocar(html, ROBOTS_DO_MODELO, '<meta name="robots" content="noindex, follow">');
  const img = https(c.imagem);
  if (img) {
    html = html.replace(/(<meta\s+(?:property="og:image"|name="twitter:image")\s+content=")[^"]*(")/g, (_m, a: string, b: string) => `${a}${esc(img.href)}${b}`);
    html = html.replace(/<meta\s+property="og:image:(?:width|height)"\s+content="[^"]*">\s*/g, '');
    html = html.replace(/(<meta\s+property="og:image:alt"\s+content=")[^"]*(")/, (_m, a: string, b: string) => `${a}${esc(c.imagemAlt)}${b}`);
  }
  html = trocar(html, '@@ld@@', c.ld);
  html = trocar(html, '@@main@@', c.main);
  return html;
}

// ------------------------------------------------------------------------------------------------ páginas

export type OpcoesDoPost = {
  post: PostP12;
  conteudo: Conteudo;
  url: string;
  trilha: Passo[];
  categoria: { href: string; nome: string; pai?: { href: string; nome: string } | null } | null;
  secoes: string[];
  relacionados: string[];
};

/** A página de um post do Rankeando. */
export function paginaDoPost(modelo: string, o: OpcoesDoPost): string {
  const p = o.post;
  const md = p.conteudo_markdown || o.conteudo.html.replace(/<[^>]+>/g, ' ');
  const minutos = readingMinutes(md);
  const palavras = md.split(/\s+/).filter(Boolean).length;
  const capa = https(p.capa?.url ?? null);
  const descricao = p.seo.descricao || p.resumo;
  const seoTitulo = p.seo.titulo;
  const autorNome = p.assinatura?.nome ?? p.autor;
  const atualizado = p.atualizado_em.slice(0, 10) !== p.publicado_em.slice(0, 10) ? `<span>Atualizado em ${dataBr(p.atualizado_em)}</span>` : '';
  const sumario = sumarioHtml(o.conteudo.toc);
  const kicker = o.categoria
    ? `<p class="kicker hero-in">${o.categoria.pai ? `<a href="${esc(o.categoria.pai.href)}">${esc(o.categoria.pai.nome)}</a> <span aria-hidden="true">›</span> ` : ''}<a href="${esc(o.categoria.href)}">${esc(o.categoria.nome)}</a></p>`
    : `<p class="kicker hero-in">Blog</p>`;

  const main =
    `<article>` +
    `<section class="page-hero page-hero--simple" aria-labelledby="titulo"><div class="container">${trilhaHtml(o.trilha)}` +
    `<div class="page-hero__grid"><div>${kicker}<h1 id="titulo" class="hero-in">${esc(p.titulo)}</h1>` +
    (p.resumo ? `<p class="lead hero-in">${esc(p.resumo)}</p>` : '') +
    `<p class="post-meta hero-in"><span>Por ${esc(autorNome)}</span><time datetime="${esc(p.publicado_em)}">${dataBr(p.publicado_em)}</time><span>${minutos} min de leitura</span>${atualizado}</p>` +
    `</div></div></div></section>` +
    `<section class="section post" aria-label="Conteúdo do artigo"><div class="container container--narrow">` +
    (capa ? `<figure class="post__cover"><img src="${esc(capa.href)}" alt="${esc(p.capa?.alt || p.titulo)}" width="1200" height="675" loading="eager" decoding="async" fetchpriority="high"></figure>` : '') +
    sumario +
    `<div class="prose post__body">${o.conteudo.html}${p.assinatura ? caixaAssinatura(p.assinatura) : ''}</div>` +
    `<p class="post__voltar"><a class="link" href="/blog/"><svg class="icon" aria-hidden="true"><use href="#i-left"/></svg>Voltar ao blog</a></p>` +
    `</div></section>` +
    `</article>` +
    (o.relacionados.length
      ? `<section class="section section--mist" aria-labelledby="continue-lendo"><div class="container"><h2 id="continue-lendo" class="post-grid__titulo">Continue lendo</h2><div class="post-grid">${o.relacionados.join('')}</div></div></section>`
      : '');

  const ld =
    grafoDoPost({
      url: o.url, titulo: p.titulo, descricao, seoTitulo, publicadoEm: p.publicado_em, atualizadoEm: p.atualizado_em, capaUrl: capa?.href ?? null,
      secoes: o.secoes, palavras, minutos, autor: { tipo: p.assinatura?.tipo === 'empresa' ? 'Organization' : 'Person', nome: autorNome }, trilha: o.trilha,
    }) + scriptDoFaq(p.faq_jsonld);

  return montarPagina(modelo, { titulo: seoTitulo, descricao, url: o.url, ogTipo: 'article', imagem: capa?.href ?? null, imagemAlt: p.capa?.alt || p.titulo, ld, main });
}

export const POR_PAGINA = 12;

/** Os links de página (?page=N): só aparecem com mais de uma página. */
export function paginacaoHtml(base: string, pagina: number, total: number): string {
  if (total <= 1) return '';
  const href = (n: number) => (n === 1 ? base : `${base}?page=${n}`);
  const itens: string[] = [];
  if (pagina > 1) itens.push(`<li><a class="chip" href="${href(pagina - 1)}" rel="prev">Anterior</a></li>`);
  for (let n = 1; n <= total; n++) itens.push(n === pagina ? `<li><a class="chip" href="${href(n)}" aria-current="page">${n}</a></li>` : `<li><a class="chip" href="${href(n)}">${n}</a></li>`);
  if (pagina < total) itens.push(`<li><a class="chip" href="${href(pagina + 1)}" rel="next">Próxima</a></li>`);
  return `<nav class="chips chips--paginas" aria-label="Páginas"><ul role="list">${itens.join('')}</ul></nav>`;
}

export type ChipDeCategoria = { slug: string; nome: string; posts: number };

const chipHtml = (c: ChipDeCategoria, atual: boolean) =>
  `<li><a class="chip" href="/blog/categoria/${esc(c.slug)}/"${atual ? ' aria-current="page"' : ''}>${esc(c.nome)} <span>${c.posts}</span></a></li>`;

/** Categorias de cima (com a contagem da família) que têm post, para os chips de filtro. A mãe conta os posts das filhas. */
export function chipsDasCategorias(categorias: CategoriaComPosts[]): ChipDeCategoria[] {
  return categorias
    .filter((c) => !c.pai)
    .map((c) => ({ slug: c.slug, nome: c.nome, posts: familiaDaCategoria(categorias, c.slug).reduce((n, s) => n + (categorias.find((x) => x.slug === s)?.posts ?? 0), 0) }))
    .filter((c) => c.posts > 0);
}

type OpcoesDaLista = {
  /** Endereço sem ?page (a canônica da página 1). */
  path: string;
  titulo: string;
  descricao: string;
  lead: string;
  h1: string;
  trilha: Passo[];
  /** Categoria atual (marca o chip) ou null na lista geral. */
  atual: string | null;
  cartoes: string[];
  chips: ChipDeCategoria[];
  totalGeral: number;
  numero: number;
  paginas: number;
  tipoLd: 'Blog' | 'CollectionPage';
};

function paginaDeLista(modelo: string, o: OpcoesDaLista): string {
  const url = SITE_URL + o.path;
  const urlDaPagina = o.numero === 1 ? url : `${url}?page=${o.numero}`;
  const sufixo = o.numero > 1 ? ` (página ${o.numero})` : '';
  const titulo = `${o.titulo}${sufixo}`;
  const trilha = o.trilha;
  const grafo = jsonEmScript({
    '@context': 'https://schema.org',
    '@graph': [
      o.tipoLd === 'Blog'
        ? { '@type': 'Blog', '@id': `${SITE_URL}/blog/#blog`, url: `${SITE_URL}/blog/`, name: `Blog ${SITE_NAME}`, description: o.descricao, inLanguage: 'pt-BR', isPartOf: SITE, publisher: ORG }
        : { '@type': 'CollectionPage', '@id': `${url}#pagina`, url, name: o.titulo, description: o.descricao, isPartOf: SITE, about: ORG, inLanguage: 'pt-BR', breadcrumb: { '@id': `${url}#trilha` } },
      breadcrumbLd(url, trilha),
    ],
  });
  const chips =
    o.chips.length > 0
      ? `<nav class="chips" aria-label="Categorias do blog"><ul role="list"><li><a class="chip" href="/blog/"${o.atual === null ? ' aria-current="page"' : ''}>Todos <span>${o.totalGeral}</span></a></li>${o.chips.map((c) => chipHtml(c, c.slug === o.atual)).join('')}</ul></nav>`
      : '';
  const main =
    `<section class="page-hero page-hero--simple" aria-labelledby="titulo"><div class="container">${trilhaHtml(trilha)}` +
    `<div class="page-hero__grid"><div><p class="kicker hero-in">Blog</p><h1 id="titulo" class="hero-in">${esc(o.h1)}</h1><p class="lead hero-in">${esc(o.lead)}</p></div></div></div></section>` +
    `<section class="section" aria-label="Artigos"><div class="container">${chips}<div class="post-grid">${o.cartoes.join('')}</div>${paginacaoHtml(o.path, o.numero, o.paginas)}</div></section>`;
  return montarPagina(modelo, { titulo, descricao: o.descricao, url: urlDaPagina, ogTipo: 'website', imagem: null, imagemAlt: SITE_NAME, ld: grafo, main });
}

/** /blog/ (lista geral, paginada com ?page=N). */
export function paginaDoBlog(modelo: string, o: { cartoes: string[]; chips: ChipDeCategoria[]; total: number; numero: number; paginas: number }): string {
  return paginaDeLista(modelo, {
    path: '/blog/',
    titulo: `Blog | ${SITE_NAME}`,
    descricao: `Artigos do blog da ${SITE_NAME} sobre segurança eletrônica: controle de acesso, CFTV, detecção e combate a incêndio e inspeção por raio-X.`,
    lead: `Artigos da equipe da ${SITE_NAME} sobre segurança eletrônica para empresas, aeroportos e condomínios.`,
    h1: 'Blog',
    trilha: [{ name: 'Blog' }],
    atual: null,
    cartoes: o.cartoes,
    chips: o.chips,
    totalGeral: o.total,
    numero: o.numero,
    paginas: o.paginas,
    tipoLd: 'Blog',
  });
}

/** /blog/categoria/<slug>/ */
export function paginaDaCategoria(
  modelo: string,
  o: {
    categoria: { slug: string; nome: string; descricao: string | null; mae: { slug: string; nome: string } | null };
    cartoes: string[];
    chips: ChipDeCategoria[];
    total: number;
    totalGeral: number;
    numero: number;
    paginas: number;
  },
): string {
  const c = o.categoria;
  return paginaDeLista(modelo, {
    path: `/blog/categoria/${c.slug}/`,
    titulo: `${c.nome} | Blog ${SITE_NAME}`,
    descricao: c.descricao?.trim() || `${c.nome}: artigos do blog da ${SITE_NAME} sobre segurança eletrônica.`,
    lead: c.descricao?.trim() || `${o.total} ${o.total === 1 ? 'artigo' : 'artigos'} da ${SITE_NAME} sobre ${c.nome.toLowerCase()}.`,
    h1: c.nome,
    trilha: [{ name: 'Blog', path: '/blog/' }, ...(c.mae ? [{ name: c.mae.nome, path: `/blog/categoria/${c.mae.slug}/` }] : []), { name: c.nome }],
    atual: c.slug,
    cartoes: o.cartoes,
    chips: o.chips,
    totalGeral: o.totalGeral,
    numero: o.numero,
    paginas: o.paginas,
    tipoLd: 'CollectionPage',
  });
}

// ----------------------------------------------------------------------------------------- sitemap e feed

const URL_SITEMAP = (loc: string, lastmod: string) => `  <url>\n    <loc>${esc(loc)}</loc>\n    <lastmod>${lastmod.slice(0, 10)}</lastmod>\n  </url>`;

/** O sitemap do build com o /blog/, os posts do Rankeando e as categorias que têm post (acrescentados no fim). */
export function sitemapMesclado(
  xml: string,
  o: { posts: { slug: string; atualizadoEm: string }[]; categorias: { slug: string; ultima: string }[] },
): string {
  if (!o.posts.length) return xml;
  const ultimo = o.posts.map((p) => p.atualizadoEm).sort().at(-1)!;
  const novos = [
    URL_SITEMAP(`${SITE_URL}/blog/`, ultimo),
    ...o.posts.map((p) => URL_SITEMAP(`${SITE_URL}/blog/${p.slug}/`, p.atualizadoEm)),
    ...o.categorias.map((c) => URL_SITEMAP(`${SITE_URL}/blog/categoria/${c.slug}/`, c.ultima)),
  ].join('\n');
  return xml.replace('</urlset>', `${novos}\n</urlset>`);
}

/** O RSS do blog (os 30 posts mais novos). */
export function feedXml(o: { posts: { slug: string; titulo: string; descricao: string; publicadoEm: string; categoria: string | null }[] }): string {
  const itens = [...o.posts]
    .sort((a, b) => b.publicadoEm.localeCompare(a.publicadoEm))
    .slice(0, 30)
    .map(
      (p) =>
        `<item><title>${esc(p.titulo)}</title><link>${SITE_URL}/blog/${p.slug}/</link><guid isPermaLink="true">${SITE_URL}/blog/${p.slug}/</guid><pubDate>${new Date(p.publicadoEm).toUTCString()}</pubDate><description>${esc(p.descricao)}</description>${p.categoria ? `<category>${esc(p.categoria)}</category>` : ''}</item>`,
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"><channel><title>Blog ${esc(SITE_NAME)}</title><link>${SITE_URL}/blog/</link><description>Artigos da ${esc(SITE_NAME)} sobre segurança eletrônica.</description><language>pt-BR</language>\n${itens}\n</channel></rss>\n`;
}
