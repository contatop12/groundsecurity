/**
 * Otimização de imagens — Ground Security Systems
 * ------------------------------------------------
 * assets-src/  →  public/img/  (+ src/data/images.json com as dimensões)
 *
 *  fotos   → AVIF + WebP em várias larguras (srcset responsivo), sem metadados
 *  marcas  → logos de fabricantes: recorte de bordas + WebP leve
 *  clientes → logos de clientes: recorte, transparência preservada, WebP 2×
 *  marca   → logo Ground (WebP + PNG p/ schema), símbolo SVG, favicons e ícones PWA
 *
 * Uso: node scripts/optimize-images.mjs
 */
import sharp from 'sharp';
import { mkdir, readdir, writeFile, copyFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'assets-src');
const OUT = path.join(ROOT, 'public', 'img');
const MANIFEST = path.join(ROOT, 'src', 'data', 'images.json');

const PHOTO_WIDTHS = [480, 800, 1200, 1600];
const AVIF = { quality: 52, effort: 6, chromaSubsampling: '4:2:0' };
const WEBP = { quality: 74, effort: 6, smartSubsample: true };

/** Recortes manuais: a imagem original tinha moldura branca embutida. */
const CROPS = {
  'camera-cftv-saguao-corporativo': { left: 52, top: 80, width: 566, height: 425 },
};

/** Ajustes finos por foto: texturas e fotos de evento toleram qualidade menor. */
const TUNE = {
  'cameras-cftv-fachada': { avif: 38, webp: 58, max: 1280, blur: 0.45 },
  'edificios-corporativos-sao-paulo': { avif: 44, webp: 66 },
  'encontro-johnson-controls-2019': { avif: 46, webp: 66 },
  'isc-west-2023-ground-security': { avif: 48, webp: 68, max: 1200 },
  'inspecao-raio-x-aeroporto': { max: 1600 },
};

const manifest = { fotos: {}, marcas: {}, marca: {} };
const kb = (b) => `${(b / 1024).toFixed(1)} KB`;

async function photos() {
  const dir = path.join(SRC, 'fotos');
  await mkdir(path.join(OUT, 'fotos'), { recursive: true });
  for (const file of await readdir(dir)) {
    const name = path.parse(file).name;
    const t = TUNE[name] ?? {};
    let base = sharp(path.join(dir, file)).rotate();
    if (CROPS[name]) base = base.extract(CROPS[name]);
    if (t.blur) base = base.blur(t.blur);
    const buf = await base.toBuffer();
    const meta = await sharp(buf).metadata();
    const max = Math.min(meta.width, t.max ?? 1920);
    const widths = PHOTO_WIDTHS.filter((w) => w < max);
    widths.push(max);
    const uniq = [...new Set(widths)].sort((a, b) => a - b);
    let largest = 0;
    for (const w of uniq) {
      const pipe = sharp(buf).resize({ width: w, withoutEnlargement: true });
      const avif = await pipe.clone().avif({ ...AVIF, quality: t.avif ?? AVIF.quality })
        .toFile(path.join(OUT, 'fotos', `${name}-${w}.avif`));
      await pipe.clone().webp({ ...WEBP, quality: t.webp ?? WEBP.quality })
        .toFile(path.join(OUT, 'fotos', `${name}-${w}.webp`));
      largest = avif.size;
    }
    manifest.fotos[name] = { w: meta.width, h: meta.height, widths: uniq };
    console.log(`foto  ${name.padEnd(36)} ${meta.width}×${meta.height}  ${uniq.join('/')}  maior AVIF ${kb(largest)}`);
  }
}

async function brands() {
  const dir = path.join(SRC, 'marcas');
  await mkdir(path.join(OUT, 'marcas'), { recursive: true });
  for (const file of await readdir(dir)) {
    const name = path.parse(file).name;
    const trimmed = await sharp(path.join(dir, file))
      .flatten({ background: '#ffffff' })
      .trim({ background: '#ffffff', threshold: 12 })
      .toBuffer();
    const out = await sharp(trimmed)
      .resize({ height: 120, width: 420, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 86, effort: 6 })
      .toFile(path.join(OUT, 'marcas', `${name}.webp`));
    manifest.marcas[name] = { w: out.width, h: out.height };
    console.log(`marca ${name.padEnd(36)} ${out.width}×${out.height}  ${kb(out.size)}`);
  }
}

/**
 * Logos de clientes (assets-src/clientes/*.svg|png) → public/img/clientes/<nome>.webp
 * Mantém a transparência (aparecem sobre fundos claros e escuros), recorta bordas vazias
 * e gera altura 2× da maior exibição (~62 px). Fontes de cada arquivo: assets-src/clientes/FONTES.md
 */
async function clients() {
  const dir = path.join(SRC, 'clientes');
  if (!existsSync(dir)) return;
  await mkdir(path.join(OUT, 'clientes'), { recursive: true });
  manifest.clientes = {};
  for (const file of await readdir(dir)) {
    if (!/\.(svg|png|webp|jpe?g)$/i.test(file)) continue;
    const name = path.parse(file).name;
    const input = path.join(dir, file);
    const isVector = file.toLowerCase().endsWith('.svg');
    const trimmed = await sharp(input, isVector ? { density: 600 } : {})
      .ensureAlpha()
      .trim({ threshold: 4 })
      .toBuffer();
    const resized = sharp(trimmed).resize({ height: 144, width: 720, fit: 'inside', withoutEnlargement: !isVector });
    const lossy = await resized.clone().webp({ quality: 82, alphaQuality: 85, effort: 6 }).toBuffer();
    const lossless = await resized.clone().webp({ lossless: true, effort: 6 }).toBuffer();
    const best = lossy.length < lossless.length ? lossy : lossless;
    await writeFile(path.join(OUT, 'clientes', `${name}.webp`), best);
    const meta = await sharp(best).metadata();
    manifest.clientes[name] = { w: meta.width, h: meta.height };
    console.log(`cliente ${name.padEnd(34)} ${meta.width}×${meta.height}  ${kb(best.length)}`);
  }
}

async function brand() {
  const dir = path.join(SRC, 'marca');
  await mkdir(path.join(OUT, 'marca'), { recursive: true });

  for (const name of ['logo-ground-security', 'logo-ground-security-negativo']) {
    const src = path.join(dir, `${name}.png`);
    const trimmed = await sharp(src).trim({ threshold: 1 }).toBuffer();
    const meta = await sharp(trimmed).metadata();
    const h = 200; // ~3× a altura exibida no header
    const resized = sharp(trimmed).resize({ height: h });
    // Testa WebP com e sem perdas e fica com o menor (logos de cor chapada comprimem melhor sem perdas)
    const lossy = await resized.clone().webp({ quality: 88, alphaQuality: 85, effort: 6 }).toBuffer();
    const lossless = await resized.clone().webp({ lossless: true, effort: 6 }).toBuffer();
    const best = lossy.length < lossless.length ? lossy : lossless;
    await writeFile(path.join(OUT, 'marca', `${name}.webp`), best);
    const webp = { ...(await sharp(best).metadata()), size: best.length };
    const png = await resized.clone().png({ compressionLevel: 9, palette: true })
      .toFile(path.join(OUT, 'marca', `${name}.png`));
    manifest.marca[name] = { w: webp.width, h: webp.height, ratio: meta.width / meta.height };
    // Versão 2× da altura exibida no header (56 px) e na linha do tempo
    const sm = sharp(trimmed).resize({ height: 112 });
    await sm.clone().png({ compressionLevel: 9, palette: true }).toFile(path.join(OUT, 'marca', `${name}-sm.png`));
    await sm.clone().webp({ lossless: true, effort: 6 }).toFile(path.join(OUT, 'marca', `${name}-sm.webp`));
    console.log(`logo  ${name.padEnd(36)} ${webp.width}×${webp.height}  webp ${kb(webp.size)}  png ${kb(png.size)}`);
  }

  const old = await sharp(path.join(dir, 'logo-ground-1993.png')).resize({ width: 200 }).webp({ quality: 90 })
    .toFile(path.join(OUT, 'marca', 'logo-ground-1993.webp'));
  manifest.marca['logo-ground-1993'] = { w: old.width, h: old.height };

  // Símbolo (domo de faixas) → favicons
  const svg = path.join(dir, 'simbolo.svg');
  await copyFile(svg, path.join(ROOT, 'public', 'favicon.svg'));
  const square = async (size, pad, bg) => {
    const inner = Math.round(size * (1 - pad * 2));
    const icon = await sharp(svg, { density: 1200 }).resize({ width: inner }).png().toBuffer();
    const im = await sharp(icon).metadata();
    return sharp({ create: { width: size, height: size, channels: 4, background: bg } })
      .composite([{ input: icon, left: Math.round((size - im.width) / 2), top: Math.round((size - im.height) / 2) + Math.round(size * 0.04) }])
      .png({ compressionLevel: 9 });
  };
  const white = { r: 255, g: 255, b: 255, alpha: 1 };
  await (await square(180, 0.12, white)).toFile(path.join(ROOT, 'public', 'apple-touch-icon.png'));
  await (await square(192, 0.12, white)).toFile(path.join(ROOT, 'public', 'icon-192.png'));
  await (await square(512, 0.12, white)).toFile(path.join(ROOT, 'public', 'icon-512.png'));
  await (await square(512, 0.2, white)).toFile(path.join(ROOT, 'public', 'icon-maskable-512.png'));
  await (await square(48, 0.04, { r: 0, g: 0, b: 0, alpha: 0 })).toFile(path.join(ROOT, 'scripts', '.cache', 'favicon-48.png'));
  console.log('favicons ok');
}

await mkdir(path.join(ROOT, 'src', 'data'), { recursive: true });
await mkdir(path.join(ROOT, 'scripts', '.cache'), { recursive: true });
await photos();
await brands();
await clients();
await brand();

// PDF da matéria (sem recompressão — 1 página)
await mkdir(path.join(ROOT, 'public', 'docs'), { recursive: true });
if (existsSync(path.join(SRC, 'docs', 'revista-infra-2019.pdf'))) {
  await copyFile(path.join(SRC, 'docs', 'revista-infra-2019.pdf'), path.join(ROOT, 'public', 'docs', 'revista-infra-2019.pdf'));
}

await writeFile(MANIFEST, JSON.stringify(manifest, null, 2));
console.log(`\nmanifesto → ${path.relative(ROOT, MANIFEST)}`);
