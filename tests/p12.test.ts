// Testes do recebimento do Rankeando (contrato v3): assinatura, eventos, entrega repetida, listagem, páginas montadas e sitemap.
// Rodar: npm test (node:test via tsx; nada de rede nem de Cloudflare). HTMLRewriter (limpeza do corpo do post) só existe no Worker:
// ele é conferido no teste local com `wrangler dev` (ver README). As páginas usam o modelo REAL do build quando dist/ existe
// (rode `npm run build` antes) e, sem ele, um modelo mínimo equivalente.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import worker, { comNoindexNoWorkersDev } from '../worker/index';
import { assinarCorpo, VETOR_DE_TESTE, verificarAssinatura } from '../worker/p12/assinatura';
import { lerEvento } from '../worker/p12/contrato';
import { paginaDePosts } from '../worker/p12/posts';
import {
  caixaAssinatura, cartaoHtml, dataBr, familiaDaCategoria, feedXml, modeloCompleto, paginacaoHtml, paginaDaCategoria, paginaDoBlog, paginaDoPost, sitemapMesclado, sumarioHtml,
  type ChipDeCategoria,
} from '../worker/p12/render';
import { servirSite } from '../worker/p12/site';
import { handleP12Webhook, type Dependencias } from '../worker/p12/webhook';
import { MemoriaStore } from './memoria';

const SEGREDO = 'chave-de-teste-do-recebimento';
const AGORA = 1_800_000_000;

function deps(store = new MemoriaStore()): Dependencias {
  return { segredo: SEGREDO, store, agora: AGORA };
}

async function enviar(d: Dependencias, evento: string, corpo: unknown, entrega: string, { t = AGORA, segredo = SEGREDO } = {}) {
  const texto = JSON.stringify(corpo);
  const req = new Request('https://groundsecurity.com.br/api/p12/webhook', {
    method: 'POST',
    headers: { 'X-Rankeando-Evento': evento, 'X-Rankeando-Entrega': entrega, 'X-Rankeando-Assinatura': await assinarCorpo(segredo, t, texto) },
    body: texto,
  });
  const res = await handleP12Webhook(req, d);
  return { status: res.status, corpo: (await res.json()) as Record<string, any> };
}

const post = (extra: Record<string, unknown> = {}) => ({
  id: 'art_1', slug: 'meu-post', titulo: 'Meu post', resumo: 'Resumo do post', conteudo_html: '<p>Corpo</p>', conteudo_markdown: 'Corpo', capa: null,
  seo: { titulo: 'Meu post | Ground', descricao: 'Descrição do post', palavra_chave: 'post', canonical: null }, faq_jsonld: null, autor: 'Equipe Ground',
  publicado_em: '2026-11-01T12:00:00.000Z', atualizado_em: '2026-11-01T12:00:00.000Z', categoria: null, ...extra,
});
const publicar = (p: Record<string, unknown> = {}) => ({ evento: 'post.publicar', contrato: 2, post: post(p) });

// ---------------------------------------------------------------------------------------------- assinatura

test('a conferência de assinatura bate com o vetor do pacote', async () => {
  assert.equal(await verificarAssinatura(VETOR_DE_TESTE.segredo, VETOR_DE_TESTE.cabecalho, VETOR_DE_TESTE.corpo, VETOR_DE_TESTE.t), 'ok');
  assert.equal(await verificarAssinatura(VETOR_DE_TESTE.segredo, VETOR_DE_TESTE.cabecalho, VETOR_DE_TESTE.corpo + ' ', VETOR_DE_TESTE.t), 'assinatura_invalida');
  assert.equal(await verificarAssinatura(VETOR_DE_TESTE.segredo, VETOR_DE_TESTE.cabecalho, VETOR_DE_TESTE.corpo, VETOR_DE_TESTE.t + 301), 'fora_do_horario');
});

test('ping assinado devolve o desafio, o contrato 3 e os recursos; assinatura errada ou fora da janela é 401', async () => {
  const d = deps();
  const ok = await enviar(d, 'ping', { evento: 'ping', contrato: 1, desafio: 'abc' }, 'ping-1');
  assert.equal(ok.status, 200);
  assert.deepEqual(ok.corpo, { ok: true, desafio: 'abc', contrato: 3, recursos: ['categorias.listar', 'categorias.mesclar', 'posts.listar', 'post.ler'] });
  const errada = await enviar(d, 'ping', { evento: 'ping', contrato: 1, desafio: 'abc' }, 'ping-2', { segredo: 'outra-chave' });
  assert.equal(errada.status, 401);
  assert.equal(errada.corpo.erro, 'assinatura_invalida');
  const velha = await enviar(d, 'ping', { evento: 'ping', contrato: 1, desafio: 'abc' }, 'ping-3', { t: AGORA - 400 });
  assert.equal(velha.status, 401);
  assert.equal(velha.corpo.erro, 'fora_do_horario');
  const futura = await enviar(d, 'ping', { evento: 'ping', contrato: 1, desafio: 'abc' }, 'ping-4', { t: AGORA + 400 });
  assert.equal(futura.corpo.erro, 'fora_do_horario');
});

test('sem segredo configurado o recebimento recusa (503) e GET não é aceito (405)', async () => {
  const sem = await handleP12Webhook(new Request('https://groundsecurity.com.br/api/p12/webhook', { method: 'POST', body: '{}' }), { ...deps(), segredo: undefined });
  assert.equal(sem.status, 503);
  const get = await handleP12Webhook(new Request('https://groundsecurity.com.br/api/p12/webhook'), deps());
  assert.equal(get.status, 405);
});

// ---------------------------------------------------------------------------------------------- eventos

test('post.publicar grava, repete a mesma resposta na entrega repetida e recusa slug reservado do blog (409)', async () => {
  const store = new MemoriaStore();
  const d = deps(store);
  const a = await enviar(d, 'post.publicar', publicar(), 'art_1:1');
  assert.equal(a.status, 200);
  assert.equal(a.corpo.url, 'https://groundsecurity.com.br/blog/meu-post/');
  assert.equal((await store.post('meu-post'))?.titulo, 'Meu post');
  // Entrega repetida: a mesma resposta, mesmo com um corpo diferente, e nada é gravado
  const b = await enviar(d, 'post.publicar', publicar({ titulo: 'Outro' }), 'art_1:1');
  assert.deepEqual(b, a);
  assert.equal((await store.post('meu-post'))?.titulo, 'Meu post');
  const reservado = await enviar(d, 'post.publicar', publicar({ id: 'art_2', slug: 'categoria' }), 'art_2:1');
  assert.equal(reservado.status, 409);
  assert.equal(reservado.corpo.erro, 'slug_em_uso');
  const outroPost = await enviar(d, 'post.publicar', publicar({ id: 'art_3', slug: 'meu-post' }), 'art_3:1');
  assert.equal(outroPost.status, 409);
});

test('mudar o slug guarda o antigo para o 301, uma versão mais velha não desfaz e post.remover apaga', async () => {
  const store = new MemoriaStore();
  const d = deps(store);
  await enviar(d, 'post.publicar', publicar(), 'art_1:1');
  await enviar(d, 'post.publicar', publicar({ slug: 'slug-novo', atualizado_em: '2026-11-02T12:00:00.000Z' }), 'art_1:2');
  assert.equal(await store.slugAtualDoAntigo('meu-post'), 'slug-novo');
  const velha = await enviar(d, 'post.publicar', publicar({ titulo: 'Velha', atualizado_em: '2026-11-01T13:00:00.000Z' }), 'art_1:1b');
  assert.equal(velha.status, 200);
  assert.equal((await store.post('slug-novo'))?.titulo, 'Meu post');
  const r = await enviar(d, 'post.remover', { evento: 'post.remover', contrato: 2, post: { id: 'art_1' } }, 'art_1:remover');
  assert.equal(r.status, 200);
  assert.equal(await store.post('slug-novo'), null);
  // remover de novo, ou um id que não existe, responde igual
  assert.equal((await enviar(d, 'post.remover', { evento: 'post.remover', contrato: 2, post: { id: 'nao-existe' } }, 'nao-existe:remover')).status, 200);
});

test('categorias: mesclar nunca apaga, item mais velho é ignorado, categorias.remover só apaga os slugs pedidos e categorias.listar devolve o que há', async () => {
  const store = new MemoriaStore();
  const d = deps(store);
  const lista = (itens: unknown[], em = '2026-11-01T00:00:00.000Z') => ({ evento: 'categorias', contrato: 2, modo: 'mesclar', atualizado_em: em, categorias: itens });
  await enviar(d, 'categorias', lista([{ slug: 'cftv', nome: 'CFTV', descricao: null, ordem: 0, atualizado_em: '2026-11-01T00:00:00.000Z' }, { slug: 'camera-ip', nome: 'Câmeras IP', descricao: null, ordem: 1, pai: 'cftv', atualizado_em: '2026-11-01T00:00:00.000Z' }]), 'categorias:1');
  await enviar(d, 'categorias', lista([{ slug: 'incendio', nome: 'Incêndio', descricao: null, ordem: 2, atualizado_em: '2026-11-02T00:00:00.000Z' }], '2026-11-02T00:00:00.000Z'), 'categorias:2');
  // item mais velho que o guardado: ignorado
  await enviar(d, 'categorias', lista([{ slug: 'cftv', nome: 'Antigo', descricao: null, ordem: 0, atualizado_em: '2026-10-01T00:00:00.000Z' }]), 'categorias:3');
  const r = await enviar(d, 'categorias.listar', { evento: 'categorias.listar', contrato: 2 }, 'categorias.listar:1:a');
  assert.deepEqual(r.corpo.categorias.map((c: { slug: string; nome: string; pai: string | null }) => [c.slug, c.nome, c.pai]), [['cftv', 'CFTV', null], ['camera-ip', 'Câmeras IP', 'cftv'], ['incendio', 'Incêndio', null]]);
  await enviar(d, 'categorias.remover', { evento: 'categorias.remover', contrato: 2, slugs: ['cftv'] }, 'categorias.remover:1');
  const depois = await enviar(d, 'categorias.listar', { evento: 'categorias.listar', contrato: 2 }, 'categorias.listar:1:b');
  assert.deepEqual(depois.corpo.categorias.map((c: { slug: string; pai: string | null }) => [c.slug, c.pai]), [['camera-ip', null], ['incendio', null]]);
});

test('posts.listar e post.ler: ordem, cursor, janela de datas, id inexistente e conteúdo', async () => {
  const store = new MemoriaStore();
  const d = deps(store);
  await enviar(d, 'post.publicar', publicar(), 'art_1:1');
  await enviar(d, 'post.publicar', publicar({ id: 'art_3', slug: 'terceiro', publicado_em: '2026-11-05T12:00:00.000Z', atualizado_em: '2026-11-05T12:00:00.000Z' }), 'art_3:1');
  const p1 = await enviar(d, 'posts.listar', { evento: 'posts.listar', contrato: 3, limite: 1 }, 'posts.listar:1:a');
  assert.deepEqual(p1.corpo.posts.map((p: { id_no_site: string }) => p.id_no_site), ['rk:art_3']);
  assert.equal(p1.corpo.total, 2);
  assert.equal(p1.corpo.posts[0].origem, 'art_3');
  assert.equal(p1.corpo.posts[0].url, 'https://groundsecurity.com.br/blog/terceiro/');
  const p2 = await enviar(d, 'posts.listar', { evento: 'posts.listar', contrato: 3, limite: 1, cursor: p1.corpo.proximo_cursor }, 'posts.listar:1:b');
  assert.deepEqual(p2.corpo.posts.map((p: { id_no_site: string }) => p.id_no_site), ['rk:art_1']);
  assert.equal(p2.corpo.proximo_cursor, null);
  const janela = await enviar(d, 'posts.listar', { evento: 'posts.listar', contrato: 3, limite: 50, desde: '2026-11-02T00:00:00Z' }, 'posts.listar:1:c');
  assert.equal(janela.corpo.total, 1);
  assert.equal((await enviar(d, 'posts.listar', { evento: 'posts.listar', contrato: 3, limite: 2, cursor: 'lixo' }, 'posts.listar:1:d')).status, 400);
  assert.equal(paginaDePosts([], { limite: 5, cursor: null, desde: null, ate: null })?.proximo_cursor, null);

  const lido = await enviar(d, 'post.ler', { evento: 'post.ler', contrato: 3, id_no_site: 'rk:art_1' }, 'post.ler:1:a');
  assert.equal(lido.status, 200);
  assert.equal(lido.corpo.conteudo_html, '<p>Corpo</p>');
  assert.equal(lido.corpo.url, 'https://groundsecurity.com.br/blog/meu-post/');
  assert.equal(lido.corpo.seo.titulo, 'Meu post | Ground');
  const naoTem = await enviar(d, 'post.ler', { evento: 'post.ler', contrato: 3, id_no_site: 'rk:nao-existe' }, 'post.ler:1:b');
  assert.equal(naoTem.status, 404);
  assert.equal(naoTem.corpo.erro, 'nao_encontrado');
  // post.substituir não é declarado no ping: o site responde como evento desconhecido
  const subst = await enviar(d, 'post.substituir', { evento: 'post.substituir', contrato: 3, id_no_site: 'rk:art_1', atualizado_em: '2026-11-10T10:00:00Z', post: { titulo: 'x', conteudo_html: '<p>x</p>' } }, 'substituir:rk:art_1:h');
  assert.equal(subst.status, 400);
  assert.equal(subst.corpo.erro, 'contrato_desconhecido');
});

test('contrato desconhecido, evento desconhecido e corpo inválido têm o erro do contrato; contrato 1 e 2 são aceitos', () => {
  assert.equal((lerEvento('{"evento":"ping","contrato":9,"desafio":"x"}', null) as { corpo: { erro: string } }).corpo.erro, 'contrato_desconhecido');
  assert.equal((lerEvento('{"evento":"x","contrato":3}', null) as { corpo: { erro: string } }).corpo.erro, 'contrato_desconhecido');
  assert.equal((lerEvento('nao e json', null) as { corpo: { erro: string } }).corpo.erro, 'corpo_invalido');
  assert.equal((lerEvento('{"evento":"post.remover","contrato":2}', null) as { corpo: { erro: string } }).corpo.erro, 'corpo_invalido');
  assert.equal((lerEvento('{"evento":"ping","contrato":1,"desafio":"x"}', null) as { evento: string }).evento, 'ping');
});

// ---------------------------------------------------------------------------------------------- páginas

const MODELO_REAL = 'dist/p12-kit/index.html';
// Modelo mínimo equivalente ao do build (usado só quando dist/ não existe).
const MODELO_MINIMO = `<!doctype html><html lang="pt-BR"><head><title>@@titulo@@</title><meta name="description" content="@@descricao@@"><link rel="canonical" href="@@url@@">
<meta name="robots" content="noindex, nofollow"><meta property="og:type" content="@@ogTipo@@"><meta property="og:image" content="https://groundsecurity.com.br/img/og-ground-security.jpg">
<meta property="og:image:width" content="1200"><meta name="twitter:image" content="https://groundsecurity.com.br/img/og-ground-security.jpg">
<script type="application/ld+json" id="p12-ld">@@ld@@</script></head><body><header class="site-header">cab</header><main id="conteudo">@@main@@</main><footer class="site-footer">rod</footer></body></html>`;
const modelo = existsSync(MODELO_REAL) ? readFileSync(MODELO_REAL, 'utf8') : MODELO_MINIMO;

const postCompleto = (extra: Record<string, unknown> = {}) => ({
  ...post(),
  capa: { url: 'https://app.rankeando.com.br/blog-img/capa', alt: 'Capa do post' },
  faq_jsonld: { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: [{ '@type': 'Question', name: 'E </script>?', acceptedAnswer: { '@type': 'Answer', text: 'Sim' } }] },
  categoria: { slug: 'cftv', nome: 'CFTV', descricao: null, pai: null, pai_nome: null },
  assinatura: { tipo: 'pessoa' as const, nome: 'Ana <Silva>', funcao: 'Engenheira', registro: 'CREA 1', curriculo: 'Linha 1\nLinha 2', foto_url: 'https://app.rankeando.com.br/blog-img/foto', link_url: 'https://groundsecurity.com.br/sobre/' },
  ...extra,
});

test('o modelo do build traz todos os campos (e o cabeçalho e o rodapé reais do site)', () => {
  assert.deepEqual(modeloCompleto(modelo), []);
  assert.deepEqual(modeloCompleto('<html></html>').length > 0, true);
  if (existsSync(MODELO_REAL)) {
    assert.match(modelo, /<header class="site-header"/);
    assert.match(modelo, /<footer class="site-footer"/);
    assert.match(modelo, /<link rel="stylesheet"[^>]*href="\/assets\/main-[^"]+\.css"/);
  }
});

test('publicar → a página do post leva o layout do site, o SEO, o JSON-LD, o FAQ e a assinatura', async () => {
  const store = new MemoriaStore();
  const d = deps(store);
  await enviar(d, 'post.publicar', { evento: 'post.publicar', contrato: 2, post: postCompleto() }, 'art_1:1');
  const gravado = (await store.post('meu-post'))!;
  const html = paginaDoPost(modelo, {
    post: gravado,
    conteudo: { html: '<h2 id="a">A</h2><p>Corpo</p>', toc: [{ depth: 2, text: 'A', slug: 'a' }] },
    url: 'https://groundsecurity.com.br/blog/meu-post/',
    trilha: [{ name: 'Blog', path: '/blog/' }, { name: 'CFTV', path: '/blog/categoria/cftv/' }, { name: gravado.titulo }],
    categoria: { href: '/blog/categoria/cftv/', nome: 'CFTV' },
    secoes: ['CFTV'],
    relacionados: [],
  });
  assert.match(html, /<header class="site-header"|<header class="site-header">/);
  assert.match(html, /<footer class="site-footer"/);
  assert.match(html, /<title>Meu post \| Ground<\/title>/);
  assert.match(html, /<link rel="canonical" href="https:\/\/groundsecurity\.com\.br\/blog\/meu-post\/">/);
  assert.match(html, /<meta name="robots" content="index, follow/);
  assert.doesNotMatch(html, /content="noindex, nofollow"/);
  assert.match(html, /<meta property="og:type" content="article">/);
  assert.match(html, /<meta property="og:image" content="https:\/\/app\.rankeando\.com\.br\/blog-img\/capa">/);
  assert.match(html, /<meta name="twitter:image" content="https:\/\/app\.rankeando\.com\.br\/blog-img\/capa">/);
  assert.doesNotMatch(html, /og:image:width/);
  assert.match(html, /<h1 id="titulo" class="hero-in">Meu post<\/h1>/);
  assert.match(html, /<nav class="breadcrumb"[^>]*><ol><li><a href="\/">Início<\/a><\/li><li><a href="\/blog\/">Blog<\/a><\/li><li><a href="\/blog\/categoria\/cftv\/">CFTV<\/a><\/li><li><span aria-current="page">Meu post<\/span>/);
  assert.match(html, /"@type":"BlogPosting"/);
  assert.match(html, /"@type":"BreadcrumbList"/);
  assert.match(html, /"headline":"Meu post"/);
  assert.match(html, /"datePublished":"2026-11-01T12:00:00.000Z"/);
  // FAQ em segunda <script>, com o "<" escapado (não fecha a tag)
  assert.match(html, /<script type="application\/ld\+json">\{"@context":"https:\/\/schema\.org","@type":"FAQPage"/);
  assert.match(html, /E \\u003c\/script>\?/);
  // Assinatura
  assert.match(html, /class="rankeando-assinatura"/);
  assert.match(html, /Escrito por/);
  assert.match(html, /Ana &lt;Silva&gt;/);
  assert.match(html, /Linha 1<br>Linha 2/);
  assert.match(html, /<p>Corpo<\/p>/);
  // Nenhum campo ficou sem trocar
  assert.doesNotMatch(html, /@@[a-zA-Z]+@@/);
  // O robots do modelo e o JSON-LD do site (organização) continuam uma vez só
  assert.equal((html.match(/<meta name="robots"/g) ?? []).length, 1);
});

test('a lista e a categoria usam o mesmo modelo, com paginação só quando há mais de uma página', () => {
  const cartao = cartaoHtml({ id: '1', slug: 's', titulo: 'A <b>"x"</b>.', resumo: 'Res', autor: 'a', publicadoEm: '2026-11-13T01:00:00.000Z', capa: { url: 'https://app.rankeando.com.br/blog-img/x', alt: '' }, minutos: 3, categoria: { slug: 'c', nome: 'C & D' } }, 'h2');
  assert.match(cartao, /<a class="post-card__link" href="\/blog\/s\/">/);
  assert.match(cartao, /<span class="post-card__cat">C &amp; D<\/span>/);
  assert.match(cartao, /<h2 class="post-card__title">A &lt;b&gt;&quot;x&quot;&lt;\/b&gt;<\/h2>/);
  const chips: ChipDeCategoria[] = [{ slug: 'cftv', nome: 'CFTV', posts: 2 }];
  const blog = paginaDoBlog(modelo, { cartoes: [cartao], chips, total: 25, numero: 2, paginas: 3 });
  assert.match(blog, /<title>Blog \| Ground Security Systems \(página 2\)<\/title>/);
  assert.match(blog, /<link rel="canonical" href="https:\/\/groundsecurity\.com\.br\/blog\/\?page=2">/);
  assert.match(blog, /href="\/blog\/categoria\/cftv\/"/);
  assert.match(blog, /rel="prev"/);
  assert.match(blog, /"@type":"Blog"/);
  const cat = paginaDaCategoria(modelo, { categoria: { slug: 'cftv', nome: 'CFTV', descricao: null, mae: null }, cartoes: [cartao], chips, total: 1, totalGeral: 25, numero: 1, paginas: 1 });
  assert.match(cat, /<title>CFTV \| Blog Ground Security Systems<\/title>/);
  assert.match(cat, /<link rel="canonical" href="https:\/\/groundsecurity\.com\.br\/blog\/categoria\/cftv\/">/);
  assert.match(cat, /"@type":"CollectionPage"/);
  assert.match(cat, /aria-current="page">CFTV <span>2<\/span>/);
  assert.doesNotMatch(cat, /chips--paginas/);
  assert.doesNotMatch(cat + blog, /@@[a-zA-Z]+@@/);
});

test('o sumário, a data, a família de categorias e a paginação seguem as regras do site', () => {
  // 13/11 01:00 UTC ainda é 12/11 em São Paulo
  assert.equal(dataBr('2026-11-13T01:00:00.000Z'), '12 de nov. de 2026');
  assert.equal(sumarioHtml([{ depth: 2, text: 'a', slug: 'a' }, { depth: 2, text: 'b', slug: 'b' }]), '');
  assert.match(sumarioHtml([2, 2, 2].map((depth, i) => ({ depth: depth as 2, text: `T${i}`, slug: `t${i}` }))), /<nav class="toc"[^>]*><p class="toc__title">Neste artigo<\/p><ol><li><a href="#t0">T0<\/a>/);
  const caixa = caixaAssinatura({ tipo: 'empresa', nome: 'Ground', funcao: '', registro: '', curriculo: '', foto_url: 'http://inseguro/x.png', link_url: 'https://groundsecurity.com.br' });
  assert.match(caixa, /Publicado por/);
  assert.match(caixa, />Saiba mais<\/a>/);
  assert.doesNotMatch(caixa, /inseguro/); // foto só em https
  const cats = [{ slug: 'mae', pai: null }, { slug: 'filha', pai: 'mae' }, { slug: 'outra', pai: null }];
  assert.deepEqual(familiaDaCategoria(cats, 'mae'), ['mae', 'filha']);
  assert.deepEqual(familiaDaCategoria(cats, 'filha'), ['filha']);
  assert.equal(paginacaoHtml('/blog/', 1, 1), '');
  assert.match(paginacaoHtml('/blog/categoria/x/', 2, 3), /href="\/blog\/categoria\/x\/\?page=3" rel="next"/);
});

// ------------------------------------------------------------------------------ sitemap, feed e noindex

test('o sitemap do build recebe o /blog/, os posts e as categorias; sem posts fica como o build fez', () => {
  const sitemap = '<?xml version="1.0"?>\n<urlset>\n  <url>\n    <loc>https://groundsecurity.com.br/</loc>\n    <lastmod>2026-11-06</lastmod>\n  </url>\n</urlset>\n';
  assert.equal(sitemapMesclado(sitemap, { posts: [], categorias: [] }), sitemap);
  const saida = sitemapMesclado(sitemap, {
    posts: [{ slug: 'meu-post', atualizadoEm: '2026-11-01T12:00:00.000Z' }],
    categorias: [{ slug: 'cftv', ultima: '2026-11-01T12:00:00.000Z' }],
  });
  assert.match(saida, /<loc>https:\/\/groundsecurity\.com\.br\/<\/loc>/); // o do build continua
  assert.match(saida, /<loc>https:\/\/groundsecurity\.com\.br\/blog\/<\/loc>\s*<lastmod>2026-11-01<\/lastmod>/);
  assert.match(saida, /<loc>https:\/\/groundsecurity\.com\.br\/blog\/meu-post\/<\/loc>\s*<lastmod>2026-11-01<\/lastmod>/);
  assert.match(saida, /<loc>https:\/\/groundsecurity\.com\.br\/blog\/categoria\/cftv\/<\/loc>/);
  assert.equal((saida.match(/<\/urlset>/g) ?? []).length, 1);

  const feed = feedXml({ posts: [{ slug: 'a', titulo: 'A & B', descricao: 'd', publicadoEm: '2026-11-01T12:00:00.000Z', categoria: 'CFTV' }, { slug: 'b', titulo: 'Novo', descricao: 'd', publicadoEm: '2026-11-05T12:00:00.000Z', categoria: null }] });
  assert.ok(feed.indexOf('Novo') < feed.indexOf('A &amp; B'), 'o mais novo vem primeiro');
  assert.match(feed, /<link>https:\/\/groundsecurity\.com\.br\/blog\/a\/<\/link>/);
});

test('respostas do Worker em *.workers.dev levam X-Robots-Tag: noindex; no domínio oficial não', async () => {
  const env = { ASSETS: { fetch: async (req: Request) => new Response(new URL(req.url).pathname === '/p12-nao-existe/' ? 'nao existe' : 'ok', { status: new URL(req.url).pathname === '/p12-nao-existe/' ? 404 : 200 }) }, DB: {} } as unknown as Env;
  const ex = (url: string) => worker.fetch(new Request(url), env, {} as ExecutionContext);
  const dev = await ex('https://groundsecurity.minha-conta.workers.dev/api/qualquer');
  assert.equal(dev.status, 404);
  assert.equal(dev.headers.get('x-robots-tag'), 'noindex');
  const prod = await ex('https://groundsecurity.com.br/api/qualquer');
  assert.equal(prod.headers.get('x-robots-tag'), null);
  // o modelo do build nunca é servido a visitantes
  const kit = await ex('https://groundsecurity.minha-conta.workers.dev/p12-kit/');
  assert.equal(kit.status, 404);
  assert.equal(kit.headers.get('x-robots-tag'), 'noindex');
  // /blog sem barra → 301 para /blog/
  const semBarra = await servirSite(new Request('https://groundsecurity.com.br/blog?page=2'), env);
  assert.equal(semBarra.status, 301);
  assert.equal(semBarra.headers.get('location'), '/blog/?page=2');
  // endereço de blog que não existe → página 404 do site
  assert.equal((await servirSite(new Request('https://groundsecurity.com.br/blog/a/b/c'), env)).status, 404);
  assert.equal(comNoindexNoWorkersDev(new Response('x'), 'groundsecurity.com.br').headers.get('x-robots-tag'), null);
});

test('sem post nenhum, /blog/ leva a /imprensa-e-eventos/ com 302 (temporário: o navegador não guarda e o link do menu abre o blog quando chegar o 1º post)', async () => {
  const vazio = { prepare: () => ({ bind() { return this; }, all: async () => ({ results: [] }) }) };
  const env = { ASSETS: { fetch: async () => new Response('ok') }, DB: vazio } as unknown as Env;
  const res = await servirSite(new Request('https://groundsecurity.com.br/blog/'), env);
  assert.equal(res.status, 302);
  assert.equal(res.headers.get('location'), '/imprensa-e-eventos/');
});
