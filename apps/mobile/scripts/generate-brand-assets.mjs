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
const LIGHT_BG0 = '#FBF9FF'; // theme/tokens.ts: light.bg0 — фон сплэша/фирменный фон обычной иконки И фон adaptive-иконки (см. правку дефекта ниже)
const DARK_BG0 = '#0A0614'; // theme/tokens.ts: dark.bg0 — фон сплэша в тёмной теме

// --- Геометрия безопасной зоны adaptive-иконки Android ---------------------
// Круг диаметром 66% холста (66dp из 108dp, ADAPTIVE_BASELINE_PIXEL_SIZE в
// @expo/prebuild-config) — единственная область foreground/monochrome слоя,
// которую лаунчер не имеет права обрезать никакой маской (круг, сквиркл,
// капля и т.п.) — используем её же (округлив до 72dp/108dp, как в задаче на
// проверку дефекта) для `icon.png`, который обрезается в точно такой же
// холст при генерации `ic_launcher_round.webp` (borderRadiusRatio: 0.5 в
// withAndroidIcons.js, диаметр 100% холста — то есть даже строже).
const ADAPTIVE_SAFE_DIAMETER_RATIO = 72 / 108; // «видимый круг» лаунчеров ≈ 0.6667

// Реальные лаунчеры (Samsung One UI и большинство других, см. eval-rubric.md:
// «у Samsung One UI это, как правило, скруглённый квадрат») режут не
// идеальным кругом, а сквирклом/скруглённым квадратом — суперэллипсом,
// который на диагонали «дотягивается» дальше круга того же осевого радиуса.
// exponent=4 — стандартная для таких масок степень суперэллипса.
//
// Сознательный компромисс (числа сняты `scripts/verify-brand-assets.mjs` по
// РЕАЛЬНЫМ пикселям сгенерированного foreground при текущих ADAPTIVE_*):
// при margin=0.95 итоговая доля холста ≈0.561 (близко к «~60% холста» из
// ревью). Под сквирклом того же осевого радиуса — 0 пикселей знака вне маски
// (полностью безопасно). Под ИДЕАЛЬНЫМ кругом (exponent=2, самый строгий
// теоретический вариант, который не совпадает ни с одним реальным лаунчером
// на практике) — вне маски оказываются ≈2381 пикселей на холсте 1024×1024,
// максимальный вылет ≈44.6px (≈4.4% холста) на самом остром кончике нижнего
// луча шеврона. Раньше (margin 0.9 от строгого круга, ratio ≈0.444) знак был
// полностью безопасен и под кругом, но выглядел мельче, чем просили на
// ревью. Выбор — в пользу размера, безопасного для реальных масок лаунчеров
// (сквиркл), а не теоретического худшего случая, который на практике не
// встречается.
const ADAPTIVE_SQUIRCLE_EXPONENT = 4;
const ADAPTIVE_SAFE_MARGIN = 0.95;

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

  const referenceDimension = Math.max(markLight.width, markLight.height);
  // Круг (exponent=2) — для монохромного слоя, который дефект не затронул.
  const maxCornerDistanceCircle = maxCornerDistanceFromMask(markLight.mask, markLight.width, markLight.height, 2);
  // Сквиркл (exponent=4) — для icon.png/foreground, см. комментарий у
  // ADAPTIVE_SQUIRCLE_EXPONENT.
  const maxCornerDistanceSquircle = maxCornerDistanceFromMask(
    markLight.mask,
    markLight.width,
    markLight.height,
    ADAPTIVE_SQUIRCLE_EXPONENT,
  );
  const adaptiveRatio = safeContainRatio({
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
    `Безопасная доля холста: icon/foreground (сквиркл) ≈ ${adaptiveRatio.toFixed(3)}, monochrome (круг) ≈ ${monochromeRatio.toFixed(3)}, notification ≈ ${notificationRatio.toFixed(3)}`,
  );

  // 1. icon.png — непрозрачный фон фирменного светлого цвета (тот же, что и
  //    у adaptive-иконки ниже — до фикса дефекта тут стоял он же, светлый,
  //    поэтому этот файл не менялся дефектом ревью).
  await writeAsset(
    'icon.png',
    await composeOnCanvas(markLightPng, adaptiveRatio, CANVAS_ICON, LIGHT_BG0),
    `${CANVAS_ICON}x${CANVAS_ICON}, непрозрачный фон ${LIGHT_BG0}`,
  );

  // 2. Фон adaptive-иконки — светлый фирменный (light.bg0), а НЕ тёмно-
  //    фиолетовый: дефект с ревью на устройстве — тёмно-синий шеврон «M» на
  //    тёмном фоне adaptiveIcon.backgroundColor читался плохо (виден был
  //    только глобус). Меняем на тот же токен, что у icon.png/сплэша.
  await writeAsset(
    'android-icon-background.png',
    await sharp({
      create: { width: CANVAS_ADAPTIVE, height: CANVAS_ADAPTIVE, channels: 4, background: { ...hexToRgb(LIGHT_BG0), alpha: 1 } },
    })
      .png()
      .toBuffer(),
    `${CANVAS_ADAPTIVE}x${CANVAS_ADAPTIVE}, заливка ${LIGHT_BG0} (theme/tokens.ts light.bg0)`,
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
