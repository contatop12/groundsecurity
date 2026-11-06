/**
 * Otimização de vídeos — Ground Security Systems
 * -----------------------------------------------
 * Os ícones animados do site antigo eram GIFs de 1200×1200 (25–130 KB cada, 256 cores).
 * Aqui viram vídeos curtos em loop, no tamanho exibido (2× para telas retina):
 *
 *   assets-src/icones-animados/*.gif → public/media/<nome>.webm  (VP9, para Chrome/Firefox/Edge)
 *                                     → public/media/<nome>.mp4   (H.264 + faststart, para Safari/iOS)
 *                                     → public/media/<nome>-poster.webp (quadro final, p/ reduced-motion)
 *
 * Fundo branco embutido (sem canal alfa) para render idêntico em todos os navegadores.
 * Requer ffmpeg no PATH.   Uso: node scripts/optimize-videos.mjs
 */
import { execFileSync } from 'node:child_process';
import { mkdir, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'assets-src', 'icones-animados');
const OUT = path.join(ROOT, 'public', 'media');
const SIZE = 240;

const filter = `[0:v]fps=12,scale=${SIZE}:${SIZE}:flags=lanczos,format=rgba[fg];` +
  `color=c=white:s=${SIZE}x${SIZE}:r=12[bg];[bg][fg]overlay=shortest=1,format=yuv420p[v]`;

const ff = (args) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...args], { stdio: 'inherit' });
const kb = async (f) => `${((await stat(f)).size / 1024).toFixed(1)} KB`;

await mkdir(OUT, { recursive: true });
for (const file of (await readdir(SRC)).filter((f) => f.endsWith('.gif'))) {
  const name = path.parse(file).name;
  const src = path.join(SRC, file);
  const webm = path.join(OUT, `${name}.webm`);
  const mp4 = path.join(OUT, `${name}.mp4`);
  const poster = path.join(OUT, `${name}-poster.webp`);

  // 2 voltas do loop do GIF dentro do arquivo → transição mais suave no loop do <video>
  ff(['-stream_loop', '1', '-i', src, '-filter_complex', filter, '-map', '[v]', '-an',
    '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '42', '-deadline', 'good', '-row-mt', '1', webm]);
  ff(['-stream_loop', '1', '-i', src, '-filter_complex', filter, '-map', '[v]', '-an',
    '-c:v', 'libx264', '-preset', 'veryslow', '-crf', '30', '-tune', 'animation',
    '-profile:v', 'main', '-movflags', '+faststart', mp4]);

  const { pages = 1 } = await sharp(src, { animated: true }).metadata();
  await sharp(src, { page: pages - 1 }).flatten({ background: '#ffffff' })
    .resize(SIZE, SIZE).webp({ quality: 85 }).toFile(poster);
  // miniatura 2× para o menu suspenso (exibida a 52 px)
  await sharp(src, { page: pages - 1 }).flatten({ background: '#ffffff' })
    .resize(104, 104).webp({ quality: 85 }).toFile(path.join(OUT, `${name}-thumb.webp`));

  console.log(`${name.padEnd(20)} gif ${await kb(src)} → webm ${await kb(webm)} | mp4 ${await kb(mp4)} | poster ${await kb(poster)}`);
}
