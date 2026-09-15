#!/usr/bin/env node
// Генератор фирменных растров мобильного приложения (VED-173).
//
// Источник знака — те же файлы, что у веба (`apps/web/public/brand/mark.png`,
// `mark-dark.png`), собранные `apps/web/scripts/generate-icons.mjs` из
// `apps/web/public/logo_tilak_kvadrat.png`. Здесь их не перерисовывают, а
// только перекомпоновывают под форматы Android: обычная иконка, три слоя
// adaptive-иконки, силуэт для шторки уведомлений и знак для сплэша в обеих
// темах.
//
// Запуск:
//   pnpm --filter @vedamatch/mobile generate:brand-assets
//   (или node apps/mobile/scripts/generate-brand-assets.mjs из корня)
//
// Пересборка нужна только если правится сам знак на сайте (тогда файлы веба
// перегенерируются `apps/web/scripts/generate-icons.mjs`, а этот скрипт —
// повторным запуском здесь) — цвета фонов и токены ниже продублированы из
// `apps/mobile/src/theme/tokens.ts` и `app.config.ts`, при правке темы их
// нужно поправить и тут.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { maxCornerDistanceFromMask, safeContainRatio, silhouettePixel } from './brand-geometry.mjs';

const mobileRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assetsDir = path.join(mobileRoot, 'assets/images');
const webBrandDir = path.resolve(mobileRoot, '../web/public/brand');

// --- Токены (см. apps/mobile/src/theme/tokens.ts) -------------------------
const LIGHT_BG0 = '#FBF9FF'; // theme/tokens.ts: light.bg0 — фон сплэша/фирменный фон обычной иконки
const DARK_BG0 = '#0A0614'; // theme/tokens.ts: dark.bg0 — фон сплэша в тёмной теме
// Уже стоит в app.config.ts android.adaptiveIcon.backgroundColor; совпадает с
// theme/tokens.ts: light.text0 (тёмно-фиолетовый — фон под фирменным знаком
// одинаков в обеих темах интерфейса, это цвет подложки самой иконки, а не
// темизируемый UI-фон).
const ADAPTIVE_BACKGROUND = '#180F2C';

// --- Геометрия безопасной зоны adaptive-иконки Android ---------------------
// Круг диаметром 66% холста (66dp из 108dp, ADAPTIVE_BASELINE_PIXEL_SIZE в
// @expo/prebuild-config) — единственная область foreground/monochrome слоя,
// которую лаунчер не имеет права обрезать никакой маской (круг, сквиркл,
// капля и т.п.). Этому же холсту равен размер, в который резрешается
// `icon.png` при генерации `ic_launcher_round.webp` (обрезка по кругу
// диаметром 100% холста, borderRadiusRatio: 0.5 в withAndroidIcons.js) — то
// есть безопасная зона adaptive-иконки строже и покрывает оба случая, поэтому
// используем её же и для обычной иконки.
const ADAPTIVE_SAFE_DIAMETER_RATIO = 0.66;
// Запас сверх точного касания круга: 10% на сглаживание/иные формы масок
// у сторонних лаунчеров (в задаче явно упомянут Samsung One UI).
const ADAPTIVE_SAFE_MARGIN = 0.9;

// Более щедрая (менее тесная к безопасной геометрии, поскольку иконку в
// шторке уведомлений никакая маска лаунчера не обрезает) доля холста для
// силуэта уведомления — только чтобы знак не стоял впритык к краю.
const NOTIFICATION_SAFE_DIAMETER_RATIO = 1.0;
const NOTIFICATION_SAFE_MARGIN = 0.72;

const CANVAS_ICON = 1024;
const CANVAS_ADAPTIVE = 1024;
const CANVAS_NOTIFICATION = 96;
// dp, задаётся в app.config.ts (expo-splash-screen.imageWidth). Экспортируем
// растр с запасом на плотность экрана (xxhdpi ≈ ×3), чтобы не размывался.
const SPLASH_IMAGE_WIDTH_DP = 132;
const SPLASH_ASSET_SCALE = 3;

function hexToRgb(hex) {
  const value = hex.replace('#', '');
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
  };
}

/** Загружает знак, обрезает прозрачные поля по альфа-каналу и строит булеву маску. */
async function loadTrimmedMark(fileName) {
  const source = path.join(webBrandDir, fileName);
  const { data, info } = await sharp(source)
    .ensureAlpha()
    .trim({ threshold: 10 })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const mask = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i += 1) {
    mask[i] = data[i * channels + 3] > 10 ? 1 : 0;
  }
  return { data, width, height, channels, mask };
}

/** Кодирует raw-буфер обратно в PNG. */
function toPng(data, width, height, channels = 4) {
  return sharp(data, { raw: { width, height, channels } }).png().toBuffer();
}

/**
 * Перекрашивает знак в один цвет (RGB), сохраняя альфа-канал формы —
 * силуэт для монохромного слоя adaptive-иконки и для значка уведомлений.
 */
async function buildSilhouette(mark, colorHex) {
  const color = [hexToRgb(colorHex).r, hexToRgb(colorHex).g, hexToRgb(colorHex).b];
  const out = Buffer.from(mark.data);
  for (let i = 0; i < mark.width * mark.height; i += 1) {
    const at = i * mark.channels;
    const [r, g, b, a] = silhouettePixel(
      [out[at], out[at + 1], out[at + 2], out[at + 3]],
      { color, threshold: 10 },
    );
    out[at] = r;
    out[at + 1] = g;
    out[at + 2] = b;
    out[at + 3] = a;
  }
  return toPng(out, mark.width, mark.height, mark.channels);
}

/**
 * Вписывает изображение знака в холст `canvasSize×canvasSize` методом
 * contain по доле `ratio` (0..1), центрирует и кладёт на подложку —
 * сплошной цвет (`backgroundHex`) либо прозрачность (`backgroundHex === null`).
 */
async function composeOnCanvas(markBuffer, ratio, canvasSize, backgroundHex) {
  const boxSize = Math.max(1, Math.round(canvasSize * ratio));
  const resizedMark = await sharp(markBuffer)
    .resize(boxSize, boxSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  const offset = Math.round((canvasSize - boxSize) / 2);
  const background = backgroundHex
    ? { ...hexToRgb(backgroundHex), alpha: 1 }
    : { r: 0, g: 0, b: 0, alpha: 0 };
  return sharp({ create: { width: canvasSize, height: canvasSize, channels: 4, background } })
    .composite([{ input: resizedMark, left: offset, top: offset }])
    .png()
    .toBuffer();
}

async function writeAsset(fileName, buffer, note) {
  const outputPath = path.join(assetsDir, fileName);
  await writeFile(outputPath, buffer);
  console.log(`Записан ${path.relative(mobileRoot, outputPath)} (${note})`);
}

async function main() {
  await mkdir(assetsDir, { recursive: true });

  const markLight = await loadTrimmedMark('mark.png');
  const markDark = await loadTrimmedMark('mark-dark.png');
  const markLightPng = await toPng(markLight.data, markLight.width, markLight.height, markLight.channels);
  const markDarkPng = await toPng(markDark.data, markDark.width, markDark.height, markDark.channels);

  const maxCornerDistance = maxCornerDistanceFromMask(markLight.mask, markLight.width, markLight.height);
  const referenceDimension = Math.max(markLight.width, markLight.height);
  const adaptiveRatio = safeContainRatio({
    maxCornerDistance,
    referenceDimension,
    safeDiameterRatio: ADAPTIVE_SAFE_DIAMETER_RATIO,
    margin: ADAPTIVE_SAFE_MARGIN,
  });
  const notificationRatio = safeContainRatio({
    maxCornerDistance,
    referenceDimension,
    safeDiameterRatio: NOTIFICATION_SAFE_DIAMETER_RATIO,
    margin: NOTIFICATION_SAFE_MARGIN,
  });
  console.log(
    `Безопасная доля холста: adaptive/icon ≈ ${adaptiveRatio.toFixed(3)}, notification ≈ ${notificationRatio.toFixed(3)}`,
  );

  // 1. icon.png — непрозрачный фон фирменного цвета, та же безопасная зона,
  //    что у adaptive-иконки (см. комментарий у ADAPTIVE_SAFE_DIAMETER_RATIO).
  await writeAsset(
    'icon.png',
    await composeOnCanvas(markLightPng, adaptiveRatio, CANVAS_ICON, LIGHT_BG0),
    `${CANVAS_ICON}x${CANVAS_ICON}, непрозрачный фон ${LIGHT_BG0}`,
  );

  // 2. Фон adaptive-иконки — сплошная заливка тем же цветом, что и
  //    android.adaptiveIcon.backgroundColor в app.config.ts.
  await writeAsset(
    'android-icon-background.png',
    await sharp({
      create: { width: CANVAS_ADAPTIVE, height: CANVAS_ADAPTIVE, channels: 4, background: { ...hexToRgb(ADAPTIVE_BACKGROUND), alpha: 1 } },
    })
      .png()
      .toBuffer(),
    `${CANVAS_ADAPTIVE}x${CANVAS_ADAPTIVE}, заливка ${ADAPTIVE_BACKGROUND}`,
  );

  // 3. Foreground adaptive-иконки — знак на прозрачном фоне внутри
  //    безопасного круга.
  await writeAsset(
    'android-icon-foreground.png',
    await composeOnCanvas(markLightPng, adaptiveRatio, CANVAS_ADAPTIVE, null),
    `${CANVAS_ADAPTIVE}x${CANVAS_ADAPTIVE}, прозрачный фон`,
  );

  // 4. Monochrome-слой — белый силуэт (RGB игнорируется системой, важна
  //    только форма альфа-канала), в той же безопасной зоне.
  const silhouetteWhite = await buildSilhouette(markLight, '#FFFFFF');
  await writeAsset(
    'android-icon-monochrome.png',
    await composeOnCanvas(silhouetteWhite, adaptiveRatio, CANVAS_ADAPTIVE, null),
    `${CANVAS_ADAPTIVE}x${CANVAS_ADAPTIVE}, силуэт, прозрачный фон`,
  );

  // 5. Иконка уведомлений — тот же белый силуэт, компактный холст с полями;
  //    ОБЯЗАТЕЛЬНО плоский белый на прозрачном (см. app.config.ts).
  await writeAsset(
    'notification-icon.png',
    await composeOnCanvas(silhouetteWhite, notificationRatio, CANVAS_NOTIFICATION, null),
    `${CANVAS_NOTIFICATION}x${CANVAS_NOTIFICATION}, силуэт, прозрачный фон`,
  );

  // 6/7. Сплэш — знак без холста-подложки (expo-splash-screen сам кладёт его
  //    по центру фона из app.config.ts), в обеих темах.
  const splashWidthPx = SPLASH_IMAGE_WIDTH_DP * SPLASH_ASSET_SCALE;
  const splashLight = await sharp(markLightPng).resize({ width: splashWidthPx }).png().toBuffer();
  const splashDark = await sharp(markDarkPng).resize({ width: splashWidthPx }).png().toBuffer();
  await writeAsset('splash-icon.png', splashLight, `ширина ${splashWidthPx}px (imageWidth ${SPLASH_IMAGE_WIDTH_DP}dp × ${SPLASH_ASSET_SCALE})`);
  await writeAsset('splash-icon-dark.png', splashDark, `ширина ${splashWidthPx}px, тёмный вариант знака`);

  console.log(`\nФон: светлая тема ${LIGHT_BG0} (theme/tokens.ts light.bg0), тёмная тема ${DARK_BG0} (dark.bg0) — заданы в app.config.ts, файлами не генерируются.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
