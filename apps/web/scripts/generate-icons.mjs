// Генератор фирменных растров: знак и логотип для интерфейса, иконки PWA,
// favicon.ico и картинка для ссылок.
// Запуск: node scripts/generate-icons.mjs
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const iconsDir = path.join(root, "public/icons");
const brandDir = path.join(root, "public/brand");
const appDir = path.join(root, "src/app");

// Знак берётся из квадратной версии: там он уже обрезан по краю рисунка, без
// надписи и без полей. Раньше его вырезали из logo_tilak.png по замеренным
// вручную координатам — лишний шаг, который ломался при любой правке файла.
const MARK_SOURCE = path.join(root, "public/logo_tilak_kvadrat.png");
// Логотип целиком — знак вместе с надписью «VEDA MATCH». Нужен там, где место
// есть и название читается: страница входа и превью ссылки.
const FULL_SOURCE = path.join(root, "public/logo_tilak.png");
// Рамка содержимого в logo_tilak.png, замеренная по альфа-каналу: сам файл
// на треть состоит из прозрачных полей.
const FULL = { left: 103, top: 307, width: 816, height: 613 };

// Окружность глобуса в каждом из файлов. По ней «M» отделяется от глобуса:
// всё, что вне круга, — это буква, и её можно перекрасить под тёмную тему,
// не трогая сам глобус. Границы взяты по самой широкой строке альфа-канала.
const MARK_GLOBE = { cx: 291, cy: 109, r: 101 };
const FULL_GLOBE = { cx: 517, cy: 406.5, r: 100 };

// Цвет знака на тёмной теме — значение токена --vm-logo-mark из globals.css.
// В растре цвет запечён в пиксели, переменной темы взяться неоткуда.
const DARK_MARK = "#F6F1FF";
const BACKGROUND = { r: 0xfb, g: 0xf9, b: 0xff, alpha: 1 };

// «any» оставляет поля; «maskable» обязан пережить обрезку до внутренних 80%,
// поэтому знак там рисуется мельче.
const ANY_RATIO = 0.76;
const MASKABLE_RATIO = 0.6;
// В favicon знак должен читаться на 16×16, поэтому поля почти убраны.
const FAVICON_RATIO = 0.88;

function parseHex(hex) {
  return [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16));
}

/**
 * Перекрашивает «M» в заданный цвет, оставляя глобус как есть.
 *
 * Меняется только RGB, альфа остаётся исходной — сглаженные края переживают
 * замену без ореола. Кайма глобуса не задета: круг задан по внешнему краю
 * рисунка, а буква нигде не подходит к нему вплотную.
 */
async function recolorMark(source, globe, hex, region) {
  const pipeline = sharp(source).ensureAlpha();
  const { data, info } = await (region ? pipeline.extract(region) : pipeline)
    .raw()
    .toBuffer({ resolveWithObject: true });
  const [red, green, blue] = parseHex(hex);
  const offsetX = region ? region.left : 0;
  const offsetY = region ? region.top : 0;
  const radius = globe.r * globe.r;

  for (let y = 0; y < info.height; y += 1) {
    const dy = y + offsetY - globe.cy;
    for (let x = 0; x < info.width; x += 1) {
      const dx = x + offsetX - globe.cx;
      if (dx * dx + dy * dy <= radius) continue;
      const at = (y * info.width + x) * 4;
      if (data[at + 3] === 0) continue;
      data[at] = red;
      data[at + 1] = green;
      data[at + 2] = blue;
    }
  }

  return sharp(data, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .png()
    .toBuffer();
}

// Квадрат вокруг знака: исходник обрезан по рисунку и чуть шире, чем выше.
async function squareMark(input) {
  const { width, height } = await sharp(input).metadata();
  const side = Math.max(width, height);
  const top = Math.round((side - height) / 2);
  const left = Math.round((side - width) / 2);
  return sharp(input)
    .extend({
      top,
      bottom: side - height - top,
      left,
      right: side - width - left,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();
}

async function write(outputPath, buffer, note) {
  await writeFile(outputPath, buffer);
  console.log(`Wrote ${path.relative(root, outputPath)} (${note})`);
}

async function renderSquare(markSquare, size, ratio) {
  const markSize = Math.round(size * ratio);
  const offset = Math.round((size - markSize) / 2);
  const mark = await sharp(markSquare)
    .resize(markSize, markSize)
    .png()
    .toBuffer();
  return sharp({
    create: { width: size, height: size, channels: 4, background: BACKGROUND },
  })
    .composite([{ input: mark, left: offset, top: offset }])
    .png()
    .toBuffer();
}

// ICO с PNG внутри каждой записи: формат понимают все актуальные браузеры,
// а хранить BMP ради IE смысла уже нет.
async function writeIco(markSquare, sizes, outputPath) {
  const images = [];
  for (const size of sizes) {
    images.push(await renderSquare(markSquare, size, FAVICON_RATIO));
  }

  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(images.length, 4);

  const directory = Buffer.alloc(images.length * 16);
  let offset = header.length + directory.length;
  images.forEach((image, index) => {
    const at = index * 16;
    const size = sizes[index];
    directory.writeUInt8(size >= 256 ? 0 : size, at); // 0 означает 256
    directory.writeUInt8(size >= 256 ? 0 : size, at + 1);
    directory.writeUInt8(0, at + 2); // палитра не используется
    directory.writeUInt8(0, at + 3); // reserved
    directory.writeUInt16LE(1, at + 4); // color planes
    directory.writeUInt16LE(32, at + 6); // бит на пиксель
    directory.writeUInt32LE(image.length, at + 8);
    directory.writeUInt32LE(offset, at + 12);
    offset += image.length;
  });

  await write(
    outputPath,
    Buffer.concat([header, directory, ...images]),
    sizes.join(", "),
  );
}

// Картинка для ссылок в мессенджерах и соцсетях: 1200×630 — размер, который
// Telegram, WhatsApp и X показывают без обрезки.
async function writeOpenGraphImage(logo, outputPath) {
  const width = 1200;
  const height = 630;
  const logoWidth = 520;
  const logoHeight = Math.round((logoWidth * FULL.height) / FULL.width);

  const scaled = await sharp(logo)
    .resize(logoWidth, logoHeight)
    .png()
    .toBuffer();

  // Фон в тон светлой темы: мягкий градиент и приглушённые акцентные пятна.
  const backdrop = Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#FBF9FF"/>
          <stop offset="55%" stop-color="#F3EEFC"/>
          <stop offset="100%" stop-color="#EAE2F8"/>
        </linearGradient>
        <radialGradient id="magenta" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#DB1B84" stop-opacity="0.22"/>
          <stop offset="100%" stop-color="#DB1B84" stop-opacity="0"/>
        </radialGradient>
        <radialGradient id="cyan" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#0C917C" stop-opacity="0.20"/>
          <stop offset="100%" stop-color="#0C917C" stop-opacity="0"/>
        </radialGradient>
        <linearGradient id="edge" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="#DB1B84"/>
          <stop offset="100%" stop-color="#0C917C"/>
        </linearGradient>
      </defs>
      <rect width="${width}" height="${height}" fill="url(#bg)"/>
      <circle cx="140" cy="120" r="320" fill="url(#magenta)"/>
      <circle cx="1080" cy="560" r="340" fill="url(#cyan)"/>
      <rect y="${height - 10}" width="${width}" height="10" fill="url(#edge)"/>
    </svg>
  `);

  const captionHeight = 90;
  const caption = Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${captionHeight}">
      <text x="${width / 2}" y="58" text-anchor="middle"
            font-family="Segoe UI, Arial, Helvetica, sans-serif"
            font-size="44" font-weight="600" fill="#4B3B6C">
        Единый вход во все сервисы VedaMatch
      </text>
    </svg>
  `);

  // Логотип и подпись — единым блоком по центру полотна.
  const blockTop = Math.round((height - (logoHeight + captionHeight)) / 2);

  const image = await sharp(backdrop)
    .composite([
      {
        input: scaled,
        left: Math.round((width - logoWidth) / 2),
        top: blockTop,
      },
      { input: caption, left: 0, top: blockTop + logoHeight },
    ])
    .png()
    .toBuffer();

  await write(outputPath, image, `${width}x${height}`);
}

await mkdir(iconsDir, { recursive: true });
await mkdir(brandDir, { recursive: true });

// Знак для интерфейса. 512 — с запасом на самый крупный показ (48 CSS-пикселей
// при тройной плотности), дальше next/image ужимает под конкретное место.
const MARK_SIZE = 512;
const markLight = await squareMark(MARK_SOURCE);
const markDark = await squareMark(
  await recolorMark(MARK_SOURCE, MARK_GLOBE, DARK_MARK),
);
await write(
  path.join(brandDir, "mark.png"),
  await sharp(markLight)
    .resize(MARK_SIZE, MARK_SIZE)
    .png({ compressionLevel: 9 })
    .toBuffer(),
  `${MARK_SIZE}x${MARK_SIZE}`,
);
await write(
  path.join(brandDir, "mark-dark.png"),
  await sharp(markDark)
    .resize(MARK_SIZE, MARK_SIZE)
    .png({ compressionLevel: 9 })
    .toBuffer(),
  `${MARK_SIZE}x${MARK_SIZE}`,
);

// Логотип целиком, обрезанный по рисунку: у исходника поля больше самого знака.
const logoLight = await sharp(FULL_SOURCE)
  .extract(FULL)
  .png({ compressionLevel: 9 })
  .toBuffer();
const logoDark = await sharp(
  await recolorMark(FULL_SOURCE, FULL_GLOBE, DARK_MARK, FULL),
)
  .png({ compressionLevel: 9 })
  .toBuffer();
await write(
  path.join(brandDir, "logo.png"),
  logoLight,
  `${FULL.width}x${FULL.height}`,
);
await write(
  path.join(brandDir, "logo-dark.png"),
  logoDark,
  `${FULL.width}x${FULL.height}`,
);

for (const [size, ratio, file] of [
  [192, ANY_RATIO, "icon-192.png"],
  [512, ANY_RATIO, "icon-512.png"],
  [192, MASKABLE_RATIO, "icon-maskable-192.png"],
  [512, MASKABLE_RATIO, "icon-maskable-512.png"],
]) {
  await write(
    path.join(iconsDir, file),
    await renderSquare(markLight, size, ratio),
    `${size}x${size}`,
  );
}
await write(
  path.join(appDir, "apple-icon.png"),
  await renderSquare(markLight, 180, ANY_RATIO),
  "180x180",
);
await writeIco(markLight, [16, 32, 48, 64, 128, 256], path.join(appDir, "favicon.ico"));
await writeOpenGraphImage(logoLight, path.join(appDir, "opengraph-image.png"));
await writeOpenGraphImage(logoLight, path.join(appDir, "twitter-image.png"));
