#!/usr/bin/env node
// Разовая проверка adaptive-иконки VED-173 (не часть сборки, не CI): собирает
// background+foreground слои так, как это делает Android, накладывает две
// маски — точный круг (то, что лаунчер гарантированно не обрезает) и сквиркл
// (реальная форма большинства масок, например Samsung One UI) — и сохраняет
// превью, чтобы визуально свериться глазами (`Read`), что «M» и глобус видны
// целиком и ничего не обрезано.
//
// Запуск: node apps/mobile/scripts/verify-brand-assets.mjs [outDir]
// outDir по умолчанию — scratchpad/brand в песочнице текущей сессии; путь
// передаётся явно первым аргументом, если он другой.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { isInsideCircle, isInsideSquircle } from './brand-geometry.mjs';

const mobileRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assetsDir = path.join(mobileRoot, 'assets/images');
const outDir = process.argv[2]
  ?? '/private/tmp/claude-502/-Users-mamu-Documents-VedaMatchNew/4a621df8-5412-427f-bee3-68076ec68ad4/scratchpad/brand';

// Совпадает с ADAPTIVE_SQUIRCLE_EXPONENT в generate-brand-assets.mjs.
const SQUIRCLE_EXPONENT = 4;

/**
 * Строит маску канваса по предикату `(dx, dy) -> boolean` как RGBA-буфер
 * (RGB — белый, неважен; альфа — сама маска). PNG в один канал (`channels:
 * 1`) кодируется как grayscale БЕЗ альфа-канала — `blend: 'dest-in'` у sharp
 * работает именно по альфе входного изображения, поэтому маска обязана
 * реально иметь альфа-канал, а не быть просто «серой картинкой».
 */
function buildMaskAlpha(size, predicate) {
  const rgba = Buffer.alloc(size * size * 4);
  const cx = size / 2;
  const cy = size / 2;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const at = (y * size + x) * 4;
      const inside = predicate(dx, dy);
      rgba[at] = 255;
      rgba[at + 1] = 255;
      rgba[at + 2] = 255;
      rgba[at + 3] = inside ? 255 : 0;
    }
  }
  return rgba;
}

async function applyMask(composedBuffer, size, alpha) {
  const maskPng = await sharp(alpha, { raw: { width: size, height: size, channels: 4 } })
    .png()
    .toBuffer();
  // `dest-in`: у результата остаётся исходное изображение там, где у маски
  // альфа=255, и становится прозрачным там, где альфа=0 (маска — источник
  // прозрачности, не цвета).
  const masked = await sharp(composedBuffer)
    .composite([{ input: maskPng, blend: 'dest-in' }])
    .png()
    .toBuffer();
  // «Пустое» вне маски делаем не прозрачным, а контрастным серым — иначе
  // Read-просмотрщик рисует прозрачность белым, и на светлом фоне иконки
  // (#FBF9FF) границу маски не видно глазом.
  return sharp({
    create: { width: size, height: size, channels: 4, background: { r: 60, g: 60, b: 60, alpha: 1 } },
  })
    .composite([{ input: masked }])
    .png()
    .toBuffer();
}

async function main() {
  await mkdir(outDir, { recursive: true });

  const backgroundPath = path.join(assetsDir, 'android-icon-background.png');
  const foregroundPath = path.join(assetsDir, 'android-icon-foreground.png');
  const background = await sharp(backgroundPath).toBuffer();
  const { width: size } = await sharp(backgroundPath).metadata();
  const foreground = await sharp(foregroundPath).resize(size, size).toBuffer();

  const composed = await sharp(background)
    .composite([{ input: foreground }])
    .png()
    .toBuffer();
  await writeFile(path.join(outDir, '01-composed-no-mask.png'), composed);

  // r = 1/3 холста — тот самый круг из задачи на проверку дефекта (диаметр
  // 2/3 холста ≈ 72dp из 108dp).
  const circleRadius = size / 3;
  const circleAlpha = buildMaskAlpha(size, (dx, dy) => isInsideCircle(dx, dy, circleRadius));
  await writeFile(path.join(outDir, '02-circle-mask.png'), await applyMask(composed, size, circleAlpha));

  // Сквиркл с тем же осевым радиусом, что и круг выше (halfSize = circleRadius).
  const squircleAlpha = buildMaskAlpha(size, (dx, dy) => isInsideSquircle(dx, dy, circleRadius, SQUIRCLE_EXPONENT));
  await writeFile(path.join(outDir, '03-squircle-mask.png'), await applyMask(composed, size, squircleAlpha));

  console.log(`Превью записаны в ${outDir}:`);
  console.log('  01-composed-no-mask.png — фон+знак без маски (для сравнения)');
  console.log('  02-circle-mask.png — маска: круг r = 1/3 холста (72dp из 108dp)');
  console.log('  03-squircle-mask.png — маска: сквиркл того же осевого радиуса, exponent = 4');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
