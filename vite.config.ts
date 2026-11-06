import { defineConfig, type Plugin } from 'vite';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));

/* -------------------------------------------------------------------------- */
/*  Dados do negócio — fonte única (NAP idêntico em todas as páginas)          */
/* -------------------------------------------------------------------------- */
const WA_NUMBER = '5511947901159';
const WA_TEXT = 'Olá! Vim pelo site da Ground Security e gostaria de falar com um especialista.';

export const SITE: Record<string, string> = {
  name: 'Ground Security Systems',
  url: 'https://groundsecurity.com.br',
  phone: '+55 (11) 3822-2430',
  phoneHref: 'tel:+551138222430',
  whatsapp: '+55 (11) 94790-1159',
  waNumber: WA_NUMBER,
  wa: `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(WA_TEXT)}`,
  email: 'groundsecurity@groundsecurity.com.br',
  street: 'Av. Marquês de São Vicente, 587, Cj. 01',
  district: 'Barra Funda',
  city: 'São Paulo',
  state: 'SP',
  cep: '01139-001',
  mapsLink: 'https://www.google.com/maps/search/?api=1&query=Ground%20Security%20Systems%2C%20Av.%20Marqu%C3%AAs%20de%20S%C3%A3o%20Vicente%2C%20587%2C%20S%C3%A3o%20Paulo',
  year: String(new Date().getFullYear()),
  updated: new Date().toISOString().slice(0, 10),
};

/* -------------------------------------------------------------------------- */
/*  Plugin: includes, variáveis, <g-img> e navegação ativa                    */
/* -------------------------------------------------------------------------- */
type Manifest = {
  fotos: Record<string, { w: number; h: number; widths: number[] }>;
  marcas: Record<string, { w: number; h: number }>;
  marca: Record<string, { w: number; h: number }>;
};

const readManifest = (): Manifest =>
  JSON.parse(readFileSync(path.join(ROOT, 'src/data/images.json'), 'utf8'));

const attrs = (raw: string): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const m of raw.matchAll(/([\w-]+)(?:="([^"]*)")?/g)) if (m[1]) out[m[1]] = m[2] ?? '';
  return out;
};

/** <g-img name="foto" alt="…" sizes="…" eager class="…" ratio="16/9"> → <picture> AVIF/WebP */
function picture(a: Record<string, string>, man: Manifest): string {
  const f = a.name ? man.fotos[a.name] : undefined;
  if (!f) throw new Error(`<g-img>: imagem "${a.name}" não existe no manifesto`);
  const base = `/img/fotos/${a.name}`;
  const set = (ext: string): string => f.widths.map((w: number) => `${base}-${w}.${ext} ${w}w`).join(', ');
  const fallbackW = f.widths.find((w: number) => w >= 800) ?? f.widths[f.widths.length - 1];
  const eager = 'eager' in a;
  const sizes = a.sizes || '(min-width: 1024px) 50vw, 100vw';
  const cls = a.class ? ` class="${a.class}"` : '';
  const pcls = a['picture-class'] ? ` class="${a['picture-class']}"` : '';
  return (
    `<picture${pcls}>` +
    `<source type="image/avif" srcset="${set('avif')}" sizes="${sizes}">` +
    `<source type="image/webp" srcset="${set('webp')}" sizes="${sizes}">` +
    `<img src="${base}-${fallbackW}.webp" width="${f.w}" height="${f.h}" alt="${a.alt ?? ''}"${cls}` +
    ` loading="${eager ? 'eager' : 'lazy'}" decoding="${eager ? 'sync' : 'async'}"${eager ? ' fetchpriority="high"' : ''}>` +
    `</picture>`
  );
}

/** <g-logo name="lenel-s2" alt="LenelS2"> → <img> WebP com dimensões (evita CLS) */
function brandLogo(a: Record<string, string>, man: Manifest): string {
  const m = a.name ? man.marcas[a.name] : undefined;
  if (!m) throw new Error(`<g-logo>: marca "${a.name}" não existe no manifesto`);
  const cls = a.class ? ` class="${a.class}"` : '';
  return `<img src="/img/marcas/${a.name}.webp" width="${m.w}" height="${m.h}" alt="${a.alt ?? ''}"${cls} loading="lazy" decoding="async">`;
}

function routeOf(file: string): string {
  const rel = path.relative(ROOT, file).split(path.sep).join('/');
  if (rel === 'index.html') return '/';
  if (rel.endsWith('/index.html')) return `/${rel.slice(0, -'index.html'.length)}`;
  return `/${rel}`;
}

function sitePlugin(): Plugin {
  return {
    name: 'ground-site',
    transformIndexHtml: {
      order: 'pre',
      handler(html, ctx) {
        const man = readManifest();
        const route = ctx.filename ? routeOf(ctx.filename) : ctx.path;

        // 1) includes (recursivo, até 5 níveis)
        for (let i = 0; i < 5 && html.includes('<!-- @include'); i++) {
          html = html.replace(/<!-- @include ([\w/-]+) -->/g, (_, name: string) =>
            readFileSync(path.join(ROOT, 'src/partials', `${name}.html`), 'utf8'),
          );
        }
        // 1b) página com robots próprio (ex.: 404 noindex) remove o robots padrão do head
        if (/<meta name="robots" content="noindex/.test(html)) {
          html = html.replace(/\s*<meta name="robots" content="index[^"]*">/, '');
        }
        // 2) variáveis {{chave}}
        html = html.replace(/\{\{(\w+)\}\}/g, (m: string, k: string) => SITE[k] ?? m);
        html = html.replace(/\{\{route\}\}/g, route);
        // 3) componentes de imagem
        html = html.replace(/<g-img\s([^>]*?)\/?>(?:<\/g-img>)?/g, (_, raw: string) => picture(attrs(raw), man));
        html = html.replace(/<g-logo\s([^>]*?)\/?>(?:<\/g-logo>)?/g, (_, raw: string) => brandLogo(attrs(raw), man));
        // 4) navegação ativa (aria-current na página, .is-parent na seção)
        html = html.replace(/<a([^>]*?)data-route="([^"]+)"([^>]*)>/g, (_, pre: string, r: string, post: string) => {
          const exact = r === route;
          const parent = !exact && r !== '/' && route.startsWith(r);
          const extra = exact ? ' aria-current="page"' : parent ? ' data-parent="true"' : '';
          return `<a${pre}${post}${extra}>`;
        });
        return html;
      },
    },
  };
}

/* -------------------------------------------------------------------------- */
/*  Entradas multipágina: todo index.html fora das pastas de sistema          */
/* -------------------------------------------------------------------------- */
const IGNORE = new Set(['node_modules', 'dist', 'public', 'src', 'assets-src', 'scripts', '.git', '.wrangler']);
function pages(dir = ROOT, acc: Record<string, string> = {}): Record<string, string> {
  for (const entry of readdirSync(dir)) {
    if (IGNORE.has(entry)) continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) pages(full, acc);
    else if (entry.endsWith('.html')) {
      const key = path.relative(ROOT, full).replace(/\\/g, '/').replace(/\.html$/, '') || 'index';
      acc[key] = full;
    }
  }
  return acc;
}

/* -------------------------------------------------------------------------- */
/*  Pós-build: sitemap.xml e llms-full.txt gerados a partir do HTML final      */
/* -------------------------------------------------------------------------- */
const ENTITIES: Record<string, string> = { '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" };
const decode = (s: string): string => s.replace(/&(nbsp|amp|lt|gt|quot|#39);/g, (m) => ENTITIES[m] ?? m);

/** HTML do <main> → Markdown legível por modelos de linguagem. */
function htmlToMarkdown(html: string): string {
  let s = html;
  s = s.replace(/<(script|style|svg|noscript|form|video|picture|template|button)\b[\s\S]*?<\/\1>/gi, '');
  s = s.replace(/<section[^>]*id="contato-rapido"[\s\S]*?<\/section>/gi, '');
  s = s.replace(/<(nav|aside)\b[\s\S]*?<\/\1>/gi, '');
  s = s.replace(/<img[^>]*>/gi, '');
  s = s.replace(/<a\b[^>]*class="[^"]*\b(btn|link)\b[^"]*"[^>]*>[\s\S]*?<\/a>/gi, '');
  s = s.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '\n\n# $1\n\n');
  s = s.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, '\n\n## $1\n\n');
  s = s.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, '\n\n### $1\n\n');
  s = s.replace(/<summary[^>]*>([\s\S]*?)<\/summary>/gi, '\n\n**$1**\n\n');
  s = s.replace(/<dt[^>]*>([\s\S]*?)<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/gi, '\n- **$1**: $2');
  s = s.replace(/<li[^>]*>/gi, '\n- ');
  s = s.replace(/<br\s*\/?>/gi, '\n');
  s = s.replace(/<\/(p|div|article|section|header|figure|ul|ol|dl|li|details)>/gi, '\n');
  s = s.replace(/<[^>]+>/g, '');
  s = decode(s);
  const lines = s.split('\n').map((l) => l.replace(/\s+/g, ' ').trim());
  const out: string[] = [];
  for (const l of lines) {
    if (l === '-' || (l === '' && out[out.length - 1] === '')) continue;
    out.push(l);
  }
  return out
    .join('\n')
    .replace(/^- (#+ )/gm, '$1')
    .replace(/^(- .*)\n\n(?=- )/gm, '$1\n')
    .trim();
}

function seoFilesPlugin(): Plugin {
  let outDir = 'dist';
  return {
    name: 'ground-seo-files',
    apply: 'build',
    configResolved(c) {
      outDir = path.resolve(c.root, c.build.outDir);
    },
    closeBundle() {
      const files: string[] = [];
      const walk = (d: string): void => {
        for (const e of readdirSync(d)) {
          const f = path.join(d, e);
          if (statSync(f).isDirectory()) walk(f);
          else if (e === 'index.html') files.push(f);
        }
      };
      walk(outDir);
      const pagesData = files
        .map((f) => {
          const html = readFileSync(f, 'utf8');
          const rel = path.relative(outDir, f).split(path.sep).join('/');
          const route = rel === 'index.html' ? '/' : `/${rel.slice(0, -'index.html'.length)}`;
          const title = decode(html.match(/<title>([^<]*)<\/title>/)?.[1] ?? '');
          const desc = decode(html.match(/<meta name="description" content="([^"]*)"/)?.[1] ?? '');
          const main = html.match(/<main[^>]*>([\s\S]*?)<\/main>/)?.[1] ?? '';
          const imgs = [...new Set([...main.matchAll(/<img src="(\/img\/fotos\/[^"]+)"/g)].map((m) => m[1]))].slice(0, 3);
          return { route, title, desc, main, imgs };
        })
        .sort((a, b) => (a.route === '/' ? -1 : b.route === '/' ? 1 : a.route.localeCompare(b.route)));

      // sitemap.xml
      const sm = pagesData
        .map((p) => {
          const imgs = p.imgs.map((i) => `\n    <image:image><image:loc>${SITE.url}${i}</image:loc></image:image>`).join('');
          return `  <url>\n    <loc>${SITE.url}${p.route}</loc>\n    <lastmod>${SITE.updated}</lastmod>${imgs}\n  </url>`;
        })
        .join('\n');
      writeFileSync(
        path.join(outDir, 'sitemap.xml'),
        `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n${sm}\n</urlset>\n`,
      );

      // llms-full.txt
      const head = readFileSync(path.join(ROOT, 'public', 'llms.txt'), 'utf8').split('\n## ')[0]?.trim() ?? '';
      const body = pagesData
        .map((p) => `---\n\nURL: ${SITE.url}${p.route}\nTítulo: ${p.title}\nResumo: ${p.desc}\n\n${htmlToMarkdown(p.main)}`)
        .join('\n\n');
      writeFileSync(
        path.join(outDir, 'llms-full.txt'),
        `${head}\n\nAtualizado em ${SITE.updated}. Conteúdo integral das páginas públicas, em texto.\n\n${body}\n`,
      );
      console.log(`\n  ✓ sitemap.xml (${pagesData.length} URLs) e llms-full.txt gerados`);
    },
  };
}

export default defineConfig({
  appType: 'mpa',
  plugins: [sitePlugin(), seoFilesPlugin()],
  build: {
    target: 'es2022',
    cssMinify: true,
    assetsInlineLimit: 2048,
    modulePreload: { polyfill: false },
    rollupOptions: { input: pages() },
  },
  server: { port: 5173, open: false },
  preview: { port: 4173 },
});
