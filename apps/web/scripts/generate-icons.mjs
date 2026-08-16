// Генератор иконок PWA, favicon.ico и OG-картинки из логотипа.
// Запуск: node scripts/generate-icons.mjs
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(root, "public/logo_tilak.png");
const iconsDir = path.join(root, "public/icons");
const appDir = path.join(root, "src/app");

// Квадрат вокруг знака (глобус + «M») в logo_tilak.png, измерен по альфа-каналу.
// Надпись «VEDA MATCH» лежит ниже (y 856..918) и в кроп не попадает.
const MARK = { left: 246, top: 279, width: 548, height: 548 };
// Логотип целиком — знак вместе с надписью, для превью в мессенджерах.
const FULL = { left: 96, top: 296, width: 832, height: 632 };
const BACKGROUND = { r: 0xfb, g: 0xf9, b: 0xff, alpha: 1 };

// «any» оставляет поля; «maskable» обязан пережить обрезку до внутренних 80%,
// поэтому знак там рисуется мельче.
const ANY_RATIO = 0.76;
const MASKABLE_RATIO = 0.6;
// В favicon знак должен читаться на 16×16, поэтому поля почти убраны.
const FAVICON_RATIO = 0.88;

async function renderSquare(size, ratio) {
  const markSize = Math.round(size * ratio);
  const offset = Math.round((size - markSize) / 2);
  const mark = await sharp(source)
    .extract(MARK)
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

async function writeSquare(size, ratio, outputPath) {
  await writeFile(outputPath, await renderSquare(size, ratio));
  console.log(`Wrote ${path.relative(root, outputPath)} (${size}x${size})`);
}

// ICO с PNG внутри каждой записи: формат понимают все актуальные браузеры,
// а хранить BMP ради IE смысла уже нет.
async function writeIco(sizes, outputPath) {
  const images = [];
  for (const size of sizes) {
    images.push(await renderSquare(size, FAVICON_RATIO));
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

  await writeFile(outputPath, Buffer.concat([header, directory, ...images]));
  console.log(
    `Wrote ${path.relative(root, outputPath)} (${sizes.join(", ")})`,
  );
}

// Картинка для ссылок в мессенджерах и соцсетях: 1200×630 — размер, который
// Telegram, WhatsApp и X показывают без обрезки.
async function writeOpenGraphImage(outputPath) {
  const width = 1200;
  const height = 630;
  const logoWidth = 520;
  const logoHeight = Math.round((logoWidth * FULL.height) / FULL.width);

  const logo = await sharp(source)
    .extract(FULL)
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
        input: logo,
        left: Math.round((width - logoWidth) / 2),
        top: blockTop,
      },
      { input: caption, left: 0, top: blockTop + logoHeight },
    ])
    .png()
    .toBuffer();

  await writeFile(outputPath, image);
  console.log(`Wrote ${path.relative(root, outputPath)} (${width}x${height})`);
}

await mkdir(iconsDir, { recursive: true });
await writeSquare(192, ANY_RATIO, path.join(iconsDir, "icon-192.png"));
await writeSquare(512, ANY_RATIO, path.join(iconsDir, "icon-512.png"));
await writeSquare(192, MASKABLE_RATIO, path.join(iconsDir, "icon-maskable-192.png"));
await writeSquare(512, MASKABLE_RATIO, path.join(iconsDir, "icon-maskable-512.png"));
await writeSquare(180, ANY_RATIO, path.join(appDir, "apple-icon.png"));
await writeIco([16, 32, 48, 64, 128, 256], path.join(appDir, "favicon.ico"));
await writeOpenGraphImage(path.join(appDir, "opengraph-image.png"));
await writeOpenGraphImage(path.join(appDir, "twitter-image.png"));
