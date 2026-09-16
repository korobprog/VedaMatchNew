#!/usr/bin/env node
// Генератор фирменных растров мобильного приложения (VED-173, итерация 3).
//
// Источник знака — `assets/brand-src/mark-transparent.png` и
// `mark-transparent-dark.png` (см. README там же): копии файлов официального
// бренд-кита для соцсетей (`vedamatch-brand-kit/mark-transparent*.png`),
// который сам собран отдельным (внешним для этого репозитория) скриптом из
// `apps/web/public/logo_tilak*.png`. До этой итерации скрипт читал
// `apps/web/public/brand/mark*.png` — тот же знак, но из другого прогона;
// переключено на кит, чтобы у приложения и у набора для соцсетей был один
// общий источник. Здесь знак не перерисовывают, а только перекомпоновывают
// под форматы Android: обычная иконка (на процедурном фоне со свечениями, как
// у аватаров кита), три слоя adaptive-иконки, силуэт для шторки уведомлений и
// знак для сплэша в обеих темах.
//
// Запуск:
//   pnpm --filter @vedamatch/mobile generate:brand-assets
//   (или node apps/mobile/scripts/generate-brand-assets.mjs из корня)
//
// Пересборка нужна, если обновился бренд-кит (тогда скопировать новые
// `mark-transparent*.png` в `assets/brand-src/` и перегенерировать) или
// поменялась тема — цвета фонов и токены ниже продублированы из
// `apps/mobile/src/theme/tokens.ts` и `app.config.ts`, при правке темы их
// нужно поправить и тут.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { maxCornerDistanceFromMask, safeContainRatio, silhouettePixel } from './brand-geometry.mjs';

const mobileRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assetsDir = path.join(mobileRoot, 'assets/images');
const brandSrcDir = path.join(mobileRoot, 'assets/brand-src');

// --- Токены (см. apps/mobile/src/theme/tokens.ts) -------------------------
const LIGHT_BG0 = '#FBF9FF'; // theme/tokens.ts: light.bg0 — фон сплэша/фирменный фон обычной иконки И фон adaptive-иконки (см. правку дефекта ниже)
const DARK_BG0 = '#0A0614'; // theme/tokens.ts: dark.bg0 — фон сплэша в тёмной теме
const LIGHT_MAGENTA = '#D71A80'; // theme/tokens.ts: light.magenta — свечение сверху слева на фоне icon.png/android-icon-background.png
const LIGHT_CYAN = '#0B826F'; // theme/tokens.ts: light.cyan — свечение снизу справа там же

// --- Геометрия безопасной зоны adaptive-иконки Android ---------------------
// Круг диаметром 66% холста (66dp из 108dp, ADAPTIVE_BASELINE_PIXEL_SIZE в
// @expo/prebuild-config) — единственная область foreground/monochrome слоя,
// которую лаунчер не имеет права обрезать никакой маской (круг, сквиркл,
// капля и т.п.) — используем её же (округлив до 72dp/108dp, как в задаче на
// проверку дефекта) для `icon.png`, который обрезается в точно такой же
// холст при генерации `ic_launcher_round.webp` (borderRadiusRatio: 0.5 в
// withAndroidIcons.js, диаметр 100% холста — то есть даже строже).
const ADAPTIVE_SAFE_DIAMETER_RATIO = 72 / 108; // «видимый круг» лаунчеров ≈ 0.6667

// Связывающее ограничение — СТРОГИЙ круг (exponent=2, `r = холст/3`, то есть
// диаметр = ADAPTIVE_SAFE_DIAMETER_RATIO холста): часть популярных лаунчеров
// (Pixel Launcher и другие) режут adaptive-иконку именно кругом, без запаса
// сквиркла. Предыдущая версия этого файла считала знак по сквирклу
// (exponent=4 — приближение скруглённого квадрата, которым режут Samsung
// One UI и похожие) и получала знак крупнее, но с вылетом кончиков шеврона
// за пределы точного круга — что и заметили на превью `02-circle-mask.png`
// (`scripts/verify-brand-assets.mjs`): кончики были явно обрезаны.
//
// `margin = 0.94` даёт запас ровно 2% холста между самым дальним пикселем
// знака и границей круга (при `safeDiameterRatio = 0.6667`: запас =
// `(safeDiameterRatio/2) * (1 - margin) * canvasSize = 0.3333 * 0.06 ≈
// 0.02 * canvasSize`) — минимальный запас, который просили на ревью, знак
// при этом максимально крупный из безопасных под кругом. Сквиркл
// (exponent=4) считаем и логируем ниже только для сверки — раз знак вписан
// в строгий круг, он тем более вписан и в любой более щедрый сквиркл того
// же осевого радиуса (проверено числами и превью в
// `scripts/verify-brand-assets.mjs`: 0 пикселей вне маски в обоих случаях).
const ADAPTIVE_SQUIRCLE_EXPONENT = 4;
const ADAPTIVE_SAFE_MARGIN = 0.94;

// Monochrome-слой (Android 13+ themed icons) — дефект ревью был не про него
// (там знак и так один цвет), оставляем прежнюю, более консервативную
// геометрию (строгий круг, старый запас), чтобы пиксели файла не менялись.
const MONOCHROME_SAFE_DIAMETER_RATIO = 0.66;
const MONOCHROME_SAFE_MARGIN = 0.9;

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
  const source = path.join(brandSrcDir, fileName);
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
 * Процедурный фон в духе аватаров бренд-кита
 * (`vedamatch-brand-kit/avatar-512.png`): светлый фон `LIGHT_BG0` со свечением
 * магенты сверху слева и циана снизу справа. Не сплошная заливка, а два
 * мягких радиальных градиента низкой прозрачности (0% → 100% альфы к краю) —
 * тот же визуальный приём, что даёт блюр в ките, но без фильтра `feGaussianBlur`
 * (надёжнее рендерится librsvg на больших радиусах).
 *
 * Центры свечений сдвинуты от самых углов холста к безопасной окружности
 * (радиус `ADAPTIVE_SAFE_DIAMETER_RATIO/2 * canvasSize` — см. геометрию выше):
 * при `canvasSize = 1024` центр магенты на расстоянии ≈0.30×холста от центра —
 * это внутри безопасного круга (≈0.333×холста), то есть свечение видно и под
 * маской лаунчера, а не только в углах, которые обрежет любая маска.
 */
function buildIconGlowBackgroundSvg(canvasSize) {
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${canvasSize}" height="${canvasSize}" viewBox="0 0 ${canvasSize} ${canvasSize}">
  <defs>
    <radialGradient id="glowMagenta" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="${LIGHT_MAGENTA}" stop-opacity="0.34" />
      <stop offset="100%" stop-color="${LIGHT_MAGENTA}" stop-opacity="0" />
    </radialGradient>
    <radialGradient id="glowCyan" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="${LIGHT_CYAN}" stop-opacity="0.26" />
      <stop offset="100%" stop-color="${LIGHT_CYAN}" stop-opacity="0" />
    </radialGradient>
  </defs>
  <rect x="0" y="0" width="${canvasSize}" height="${canvasSize}" fill="${LIGHT_BG0}" />
  <circle cx="${canvasSize * 0.3}" cy="${canvasSize * 0.28}" r="${canvasSize * 0.46}" fill="url(#glowMagenta)" />
  <circle cx="${canvasSize * 0.72}" cy="${canvasSize * 0.74}" r="${canvasSize * 0.46}" fill="url(#glowCyan)" />
</svg>`;
}

/** Растеризует `buildIconGlowBackgroundSvg` в непрозрачный PNG-буфер `canvasSize×canvasSize`. */
async function buildIconGlowBackground(canvasSize) {
  return sharp(Buffer.from(buildIconGlowBackgroundSvg(canvasSize))).png().toBuffer();
}

/**
 * Вписывает изображение знака в холст `canvasSize×canvasSize` методом
 * contain по доле `ratio` (0..1), центрирует и кладёт на подложку: сплошной
 * цвет (`background` — строка-hex), готовое изображение (`background` —
 * Buffer, например результат `buildIconGlowBackground`) либо прозрачность
 * (`background === null`).
 */
async function composeOnCanvas(markBuffer, ratio, canvasSize, background) {
  const boxSize = Math.max(1, Math.round(canvasSize * ratio));
  const resizedMark = await sharp(markBuffer)
    .resize(boxSize, boxSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  const offset = Math.round((canvasSize - boxSize) / 2);
  const base = Buffer.isBuffer(background)
    ? sharp(background).resize(canvasSize, canvasSize)
    : sharp({
        create: {
          width: canvasSize,
          height: canvasSize,
          channels: 4,
          background: background ? { ...hexToRgb(background), alpha: 1 } : { r: 0, g: 0, b: 0, alpha: 0 },
        },
      });
  return base
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

  const markLight = await loadTrimmedMark('mark-transparent.png');
  const markDark = await loadTrimmedMark('mark-transparent-dark.png');
  const markLightPng = await toPng(markLight.data, markLight.width, markLight.height, markLight.channels);
  const markDarkPng = await toPng(markDark.data, markDark.width, markDark.height, markDark.channels);

  const referenceDimension = Math.max(markLight.width, markLight.height);
  // Круг (exponent=2) — связывающее ограничение для icon.png/foreground (см.
  // комментарий у ADAPTIVE_SQUIRCLE_EXPONENT) и для монохромного слоя.
  const maxCornerDistanceCircle = maxCornerDistanceFromMask(markLight.mask, markLight.width, markLight.height, 2);
  // Сквиркл (exponent=4) — только для сверки/лога, решение по размеру он не
  // принимает.
  const maxCornerDistanceSquircle = maxCornerDistanceFromMask(
    markLight.mask,
    markLight.width,
    markLight.height,
    ADAPTIVE_SQUIRCLE_EXPONENT,
  );
  const adaptiveRatio = safeContainRatio({
    maxCornerDistance: maxCornerDistanceCircle,
    referenceDimension,
    safeDiameterRatio: ADAPTIVE_SAFE_DIAMETER_RATIO,
    margin: ADAPTIVE_SAFE_MARGIN,
  });
  // Тот же холст и margin, но по сквирклу — ожидаемо больше adaptiveRatio
  // (сквиркл щедрее круга того же осевого радиуса), приведён только для
  // сравнения в логе.
  const adaptiveRatioSquircleForLog = safeContainRatio({
    maxCornerDistance: maxCornerDistanceSquircle,
    referenceDimension,
    safeDiameterRatio: ADAPTIVE_SAFE_DIAMETER_RATIO,
    margin: ADAPTIVE_SAFE_MARGIN,
  });
  const monochromeRatio = safeContainRatio({
    maxCornerDistance: maxCornerDistanceCircle,
    referenceDimension,
    safeDiameterRatio: MONOCHROME_SAFE_DIAMETER_RATIO,
    margin: MONOCHROME_SAFE_MARGIN,
  });
  const notificationRatio = safeContainRatio({
    maxCornerDistance: maxCornerDistanceCircle,
    referenceDimension,
    safeDiameterRatio: NOTIFICATION_SAFE_DIAMETER_RATIO,
    margin: NOTIFICATION_SAFE_MARGIN,
  });
  console.log(
    `Безопасная доля холста: icon/foreground (круг, связывающее) ≈ ${adaptiveRatio.toFixed(4)} (для сравнения — сквиркл дал бы ≈ ${adaptiveRatioSquircleForLog.toFixed(4)}), monochrome (круг) ≈ ${monochromeRatio.toFixed(3)}, notification ≈ ${notificationRatio.toFixed(3)}`,
  );

  // Общий процедурный фон для icon.png и android-icon-background.png (оба
  // 1024×1024) — светлый бренд-кита с мягкими свечениями магенты/циана, как
  // у `vedamatch-brand-kit/avatar-512.png`, а не сплошная заливка. Один и тот
  // же буфер годится для обоих файлов, потому что `CANVAS_ICON === CANVAS_ADAPTIVE`.
  const iconGlowBackground = await buildIconGlowBackground(CANVAS_ICON);

  // 1. icon.png — непрозрачный фон со свечениями, знак сверху (обрезается
  //    Android в круг диаметром 100% холста при генерации `ic_launcher_round.webp`).
  await writeAsset(
    'icon.png',
    await composeOnCanvas(markLightPng, adaptiveRatio, CANVAS_ICON, iconGlowBackground),
    `${CANVAS_ICON}x${CANVAS_ICON}, непрозрачный фон со свечениями (${LIGHT_BG0} + ${LIGHT_MAGENTA}/${LIGHT_CYAN})`,
  );

  // 2. Фон adaptive-иконки — тот же процедурный слой (не сплошная заливка):
  //    свечения центрированы так, что видны и внутри безопасного круга 72dp
  //    из 108dp, а не только в углах, которые обрежет маска лаунчера. Раньше
  //    здесь стояла сплошная заливка LIGHT_BG0 (фикс дефекта «тёмно-синий
  //    шеврон на тёмном фоне» из итерации 2) — цвет базы остался тем же
  //    токеном, добавлены только свечения.
  await writeAsset(
    'android-icon-background.png',
    iconGlowBackground,
    `${CANVAS_ADAPTIVE}x${CANVAS_ADAPTIVE}, фон ${LIGHT_BG0} (theme/tokens.ts light.bg0) со свечениями ${LIGHT_MAGENTA}/${LIGHT_CYAN}`,
  );

  // 3. Foreground adaptive-иконки — знак на прозрачном фоне внутри
  //    безопасной зоны (сквиркл).
  await writeAsset(
    'android-icon-foreground.png',
    await composeOnCanvas(markLightPng, adaptiveRatio, CANVAS_ADAPTIVE, null),
    `${CANVAS_ADAPTIVE}x${CANVAS_ADAPTIVE}, прозрачный фон`,
  );

  // 4. Monochrome-слой — белый силуэт (RGB игнорируется системой, важна
  //    только форма альфа-канала). Дефект не про него — оставлена прежняя,
  //    более консервативная геометрия (строгий круг), пиксели не меняются.
  const silhouetteWhite = await buildSilhouette(markLight, '#FFFFFF');
  await writeAsset(
    'android-icon-monochrome.png',
    await composeOnCanvas(silhouetteWhite, monochromeRatio, CANVAS_ADAPTIVE, null),
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
