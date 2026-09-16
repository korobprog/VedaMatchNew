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

/**
 * Композиция сплэша: знак (без своего холста) по центру сплошного фона
 * `size×size` — то же, что делает `expo-splash-screen` на устройстве
 * (`backgroundColor`/`dark.backgroundColor` + `image`/`dark.image` из
 * `app.config.ts`), только здесь фон квадратный для превью, а не под размер
 * экрана.
 */
async function composeSplashPreview(backgroundHex, markPath, size) {
  const mark = await sharp(markPath).resize({ width: Math.round(size * 0.5) }).png().toBuffer();
  const { width: markWidth, height: markHeight } = await sharp(mark).metadata();
  return sharp({
    create: { width: size, height: size, channels: 4, background: hexToRgbaObject(backgroundHex) },
  })
    .composite([{ input: mark, left: Math.round((size - markWidth) / 2), top: Math.round((size - markHeight) / 2) }])
    .png()
    .toBuffer();
}

function hexToRgbaObject(hex) {
  const value = hex.replace('#', '');
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
    alpha: 1,
  };
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

  // Сплэш в обеих темах — фон из app.config.ts (`expo-splash-screen`), знак —
  // `splash-icon.png`/`splash-icon-dark.png`.
  const splashLight = await composeSplashPreview('#FBF9FF', path.join(assetsDir, 'splash-icon.png'), 800);
  await writeFile(path.join(outDir, '04-splash-light.png'), splashLight);
  const splashDark = await composeSplashPreview('#0A0614', path.join(assetsDir, 'splash-icon-dark.png'), 800);
  await writeFile(path.join(outDir, '05-splash-dark.png'), splashDark);

  // Monochrome/notification — прозрачные силуэты, на просвет не видны на
  // белом фоне Read-просмотрщика; накладываем на тёмный фон (как система
  // красит themed icon/значок статус-бара по альфе).
  const monochromePath = path.join(assetsDir, 'android-icon-monochrome.png');
  const monochromeOnDark = await sharp({
    create: { width: size, height: size, channels: 4, background: hexToRgbaObject('#0A0614') },
  })
    .composite([{ input: await sharp(monochromePath).resize(size, size).toBuffer() }])
    .png()
    .toBuffer();
  await writeFile(path.join(outDir, '06-monochrome-on-dark.png'), monochromeOnDark);

  const notificationPath = path.join(assetsDir, 'notification-icon.png');
  const { width: notificationSize } = await sharp(notificationPath).metadata();
  const notificationOnDark = await sharp({
    create: { width: notificationSize, height: notificationSize, channels: 4, background: hexToRgbaObject('#0A0614') },
  })
    .composite([{ input: await sharp(notificationPath).toBuffer() }])
    .png()
    .toBuffer();
  await writeFile(path.join(outDir, '07-notification-on-dark.png'), notificationOnDark);

  // Численная проверка (не только глазами по превью): считаем закрашенные
  // (альфа > 10) пиксели реального foreground вне круга r = 1/3 холста.
  const { data: foregroundRaw } = await sharp(foregroundPath)
    .resize(size, size)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let outsideCircleCount = 0;
  let maxOutsideDistancePx = 0;
  const cx = size / 2;
  const cy = size / 2;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const alpha = foregroundRaw[(y * size + x) * 4 + 3];
      if (alpha <= 10) continue;
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const distance = Math.hypot(dx, dy);
      if (distance > circleRadius) {
        outsideCircleCount += 1;
        maxOutsideDistancePx = Math.max(maxOutsideDistancePx, distance - circleRadius);
      }
    }
  }
  console.log(
    `Пикселей foreground вне круга r=1/3 холста (${circleRadius.toFixed(1)}px): ${outsideCircleCount}` +
      (outsideCircleCount > 0 ? `, максимальный вылет ≈${maxOutsideDistancePx.toFixed(2)}px` : ' (0 — не обрезано)'),
  );

  console.log(`Превью записаны в ${outDir}:`);
  console.log('  01-composed-no-mask.png — фон+знак без маски (для сравнения)');
  console.log('  02-circle-mask.png — маска: круг r = 1/3 холста (72dp из 108dp)');
  console.log('  03-squircle-mask.png — маска: сквиркл того же осевого радиуса, exponent = 4');
  console.log('  04-splash-light.png / 05-splash-dark.png — сплэш в обеих темах');
  console.log('  06-monochrome-on-dark.png / 07-notification-on-dark.png — силуэты на тёмном фоне');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
