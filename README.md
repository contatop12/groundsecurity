# Ground Security Systems — site institucional

Reconstrução do site [groundsecurity.com.br](https://groundsecurity.com.br) (antes em WordPress + Divi) em **HTML, CSS e TypeScript**, com build estático via Vite. Mesmas URLs do site antigo, para preservar o SEO.

## Comandos

```bash
npm install          # dependências (Vite, TypeScript, Wrangler, sharp, fonte Archivo)
npm run dev          # servidor local em http://localhost:5173
npm run build        # typecheck + build de produção em dist/
npm run preview      # serve o dist/ em http://localhost:4173
npm run cf:dev       # build + site no runtime da Cloudflare em http://localhost:8787
npm run deploy       # build + publica no Cloudflare Workers (requer wrangler login)
npm run assets       # regenera fontes, imagens, vídeos e imagem social (ver abaixo)
```

O conteúdo de `dist/` é o site pronto para publicar em qualquer hospedagem estática.

## Estrutura

```text
index.html, sobre/, solucoes/…, portfolio/, certificados/,
imprensa-e-eventos/, contato/, politica-de-privacidade/, 404.html   ← páginas
src/partials/      head, header, footer, cta, side, partners (incluídos no build)
src/styles/        base.css (tokens/tipografia) · components.css · sections.css · motion.css
src/ts/            main.ts + modules/ (header, reveal, tabs, faq, timeline, form, videos, marquee, misc)
src/data/          images.json (gerado: dimensões e larguras das imagens)
assets-src/        originais (fotos, logos, GIFs, PDF) — entrada do pipeline
public/            arquivos servidos como estão (img, media, fonts, robots, llms, .htaccess…)
scripts/           pipeline de otimização de assets
vite.config.ts     dados do negócio (NAP), plugin de includes/<g-img>, sitemap e llms-full
```

### Como editar

- **Dados de contato (NAP)**: só em `SITE`, no topo do `vite.config.ts`. Aparecem em todas as páginas como `{{phone}}`, `{{wa}}`, `{{street}}` etc.
- **Partes repetidas**: `<!-- @include header -->` insere `src/partials/header.html`.
- **Imagens**: `<g-img name="saguao-aeroporto" alt="…" sizes="…">` vira um `<picture>` com AVIF + WebP em várias larguras, `width/height` (sem CLS) e lazy-load. Use `eager` na imagem principal da página.
- **Logos de fabricantes**: `<g-logo name="hikvision" alt="Hikvision">`.
- **Logos de clientes**: `<g-client name="nestle">` (nomes e textos alternativos em `CLIENTS`, no `vite.config.ts`). Use `decorative` quando o nome já estiver escrito ao lado, e `alt="…"` para trocar o texto. Arquivos originais e fontes em `assets-src/clientes/` (`FONTES.md`); para um cliente novo, coloque o SVG/PNG lá, rode `npm run assets:images` e acrescente o nome em `CLIENTS`.
- **Ícones**: `<g-icon name="fence">` embute no HTML um ícone da biblioteca [Lucide](https://lucide.dev/icons) (licença ISC, uso comercial livre; nome = o do site da Lucide). `class="ico--lg"` para a versão maior. Dentro de um item com `data-reveal`, o traço se desenha ao entrar na tela.
- **Nova foto**: coloque em `assets-src/fotos/` e rode `npm run assets:images`.

## Otimizações de mídia (pipeline em `scripts/`)

| Item | Antes | Depois |
| --- | --- | --- |
| Fonte | Poppins + Open Sans via Google Fonts (vários arquivos, conexão externa) | 1 Archivo variável auto-hospedada, recortada para PT-BR: **47 KB** (de 88 KB) + fallback com métricas ajustadas |
| Fotos | JPG/PNG de 40–520 KB | AVIF + WebP responsivos (480–1600 px). Ex.: raio-X 518 KB → 64 KB; central de monitoramento 129 KB → 35 KB |
| Ícones animados | GIFs 1200×1200 de 25–127 KB | Vídeos WebM (VP9) + MP4 (H.264) de **3–7 KB**, carregados só quando visíveis, com pôster estático |
| Logos | PNG/JPG até 5668 px | WebP recortado de 2–9 KB |
| Imagem social | — | `og-ground-security.jpg` 1200×630, 80 KB |

`npm run assets` executa: `fonts.py` (fonttools) → `optimize-images.mjs` (sharp) → `optimize-videos.mjs` (ffmpeg) → `og-image.py` (Pillow). Requer Python com `fonttools brotli pillow` e `ffmpeg` no PATH.

## Desempenho e pré-carregamento

- Fonte e imagem principal com `preload` (`fetchpriority="high"`); demais imagens e vídeos em lazy-load.
- **Speculation Rules**: Chrome/Edge pré-renderizam a próxima página quando o usuário demonstra intenção (hover). Nos outros navegadores, `prefetch` no hover/toque (`initPrefetch`).
- Mapa do Google só carrega no clique (sem scripts/cookies de terceiros na abertura).
- CSS 11 KB e JS 4,6 KB (gzip) para o site inteiro; nenhuma dependência de runtime.
- Cache longo para assets com hash; `.htaccess` e `_headers` já configurados.

### Lighthouse (build de produção servido com compressão, 06/11/2026)

| Página | Dispositivo | Performance | Acessibilidade | SEO | LCP | CLS | TBT | Peso |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Início | mobile | 98 | 100 | 100 | 2,3 s | 0,02 | 0 ms | 207 KB |
| Início | desktop | 100 | 100 | 100 | 0,6 s | 0 | 0 ms | 245 KB |
| Controle de acesso | mobile | 99 | 100 | 100 | 2,0 s | 0 | 0 ms | 131 KB |
| Sobre | mobile | 99 | 100 | 100 | 2,0 s | 0 | 0 ms | 158 KB |

Boas práticas ficou em 81–82 apenas por causa do antivírus da máquina de testes (Kaspersky), que injeta um script HTTP em todas as páginas; ao medir, use `--blocked-url-patterns="*kaspersky-labs.com*"` ou outra máquina. Em produção (HTTPS + `.htaccess`) esse item e os avisos de cache/compressão não se aplicam.

## Animações e interações

- Assinatura visual: o **domo de faixas** do logotipo vira máscara da foto do hero, montada por faixas que entram por lados opostos, com uma varredura de luz e parallax ao rolar.
- Imagens reveladas por faixas, contadores, linhas que se desenham, progresso do processo ligado ao scroll, barra de progresso de leitura, header que se esconde ao descer.
- Console de soluções com abas acessíveis (setas, Home/End), linha do tempo com arrastar e botões, FAQ animado, filtro do portfólio, formulário com máscara e validação que abre o WhatsApp com a mensagem pronta.
- Tudo respeita `prefers-reduced-motion`: com “efeitos de animação” desligados no sistema, o site fica estático (é o caso desta máquina de desenvolvimento no Windows).

## SEO, GEO e AEO

- Title e meta description únicos por página (50–60 / 140–160 caracteres), H1 único, hierarquia H2/H3, canonical, Open Graph e Twitter Card.
- JSON-LD: `Organization` + `LocalBusiness` (mesmo `@id` em todo o site), `WebSite`, `WebPage`/`AboutPage`/`ContactPage`/`CollectionPage`, `Service` por solução, `FAQPage` (texto idêntico ao visível), `BreadcrumbList`, `ItemList`.
- Blocos “Em resumo” (answer capsules) no início de cada página de solução e FAQ visível para respostas diretas.
- `robots.txt` liberando buscadores e sistemas de IA declarados; `sitemap.xml` com imagens e `llms-full.txt` **gerados no build** a partir do HTML final; `llms.txt` com resumo e links.
- NAP idêntico em todas as páginas; meta geo; breadcrumbs visíveis.
- Redirecionamentos do WordPress antigo (`/blog/` → imprensa, PDF da matéria, posts “lorem ipsum”, `/project/`, `/category/`, `/author/`, `/feed/`, `wp-*` → 410).

## Publicação

### Cloudflare Workers (configurado)

O `wrangler.jsonc` publica o `dist/` como site estático no Worker **`groundsecurity`** (sem script de Worker): página 404 própria com status 404, URLs com barra final (`/sobre` → `/sobre/`), cabeçalhos de `public/_headers` e redirecionamentos de `public/_redirects`. O `.htaccess` fica fora do upload (`public/.assetsignore`).

**Deploy automático (Workers Builds)**: no painel, *Workers e Pages → groundsecurity → Configurações → Build*:

| Campo | Valor |
| --- | --- |
| Repositório / branch | `contatop12/groundsecurity` / `main` |
| Comando de build | `npm run build` |
| Comando de implantação | `npx wrangler deploy` |
| Comando de branches de não produção | `npx wrangler versions upload` |
| Diretório raiz | `/` |

O Node 22 é definido pelo `.node-version`. Cada push na `main` publica o site.

**Pelo terminal**: `npx wrangler login` uma vez e depois `npm run deploy`. Para testar no runtime da Cloudflare antes: `npm run cf:dev` (<http://localhost:8787>) ou `npm run cf:check` (build + simulação do deploy, sem enviar nada).

**Domínio** (só na hora da virada, porque substitui o DNS atual e tira o WordPress do ar):

1. O domínio precisa estar como zona nesta conta da Cloudflare.
2. *groundsecurity → Configurações → Domínios e rotas*: adicionar `groundsecurity.com.br` e `www.groundsecurity.com.br` como domínios personalizados.
3. *Regras → Redirect Rules*: modelo “Redirect from WWW to root” (301, mantendo caminho e query string). O `_redirects` não aceita redirecionamento por domínio.
4. *SSL/TLS → Certificados de borda*: ativar “Always Use HTTPS”.
5. Com o domínio no ar, pode desativar o endereço `*.workers.dev`. Enquanto ele existir, recebe `X-Robots-Tag: noindex` (regra no `_headers`) para não duplicar o site no Google.

Diferença para o Apache: os caminhos antigos `wp-*` respondem 404 em vez de 410 (o arquivo `_redirects` não tem status 410). Para o Google o efeito é o mesmo: as URLs saem do índice.

### Outras hospedagens

**Apache / hospedagem compartilhada**: envie o conteúdo de `dist/` (inclui `.htaccess` com HTTPS, domínio sem www, 301/410, cache, compressão e cabeçalhos de segurança).

**Cloudflare Pages / Netlify**: diretório de saída `dist`, comando `npm run build`. `_headers` e `_redirects` já estão em `public/`.

Depois de publicar: enviar `https://groundsecurity.com.br/sitemap.xml` no Google Search Console e no Bing Webmaster Tools.

## Pendências com o cliente

Itens que não existiam no site antigo e **não foram inventados**:

1. **Google Meu Negócio**: link do perfil e avaliações reais (para exibir nota e depoimentos e adicionar `aggregateRating`/`sameAs`).
2. **Redes sociais** (LinkedIn, Instagram) para `sameAs` no schema e no rodapé.
3. **CNPJ e horário de atendimento** (rodapé e `openingHours`).
4. **Fotos reais da equipe e de obras** — hoje as fotos são de banco de imagens do site antigo.
5. **Logos dos clientes**: já aplicados (fontes em `assets-src/clientes/FONTES.md`). Falta a Ground confirmar que pode exibir cada marca e, se possível, enviar arquivos vetoriais da Hinode e do ICESP (os oficiais disponíveis são PNG pequenos).
6. **Confirmar datas**: o portfólio antigo diz “GRU Airport desde 2015”, mas a linha do tempo diz que a atuação em aeroportos começou em 2017. O site novo usa 2017 e omite o ano no case do GRU até a confirmação.
7. Itens removidos por falta de fonte: “CFTV reduz em até 70% os incidentes” e o equipamento “FM100” (provável FM-200) da página de incêndio.
8. **GA4/GTM**: os cliques de WhatsApp, telefone e formulário já disparam eventos no `dataLayer` (`click_whatsapp`, `click_phone`, `generate_lead`); basta instalar o contêiner.
9. **Política de privacidade**: texto-base alinhado à LGPD; recomendável revisão jurídica.
