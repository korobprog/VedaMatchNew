// Генератор иконок PWA из логотипа. Запуск: node scripts/generate-icons.mjs
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
const BACKGROUND = { r: 0xfb, g: 0xf9, b: 0xff, alpha: 1 };

// «any» оставляет поля; «maskable» обязан пережить обрезку до внутренних 80%,
// поэтому знак там рисуется мельче.
const ANY_RATIO = 0.76;
const MASKABLE_RATIO = 0.6;

async function render(size, ratio, outputPath) {
  const markSize = Math.round(size * ratio);
  const offset = Math.round((size - markSize) / 2);
  const mark = await sharp(source)
    .extract(MARK)
    .resize(markSize, markSize)
    .png()
    .toBuffer();
  const image = await sharp({
    create: { width: size, height: size, channels: 4, background: BACKGROUND },
  })
    .composite([{ input: mark, left: offset, top: offset }])
    .png()
    .toBuffer();
  await writeFile(outputPath, image);
  console.log(`Wrote ${path.relative(root, outputPath)} (${size}x${size})`);
}

await mkdir(iconsDir, { recursive: true });
await render(192, ANY_RATIO, path.join(iconsDir, "icon-192.png"));
await render(512, ANY_RATIO, path.join(iconsDir, "icon-512.png"));
await render(192, MASKABLE_RATIO, path.join(iconsDir, "icon-maskable-192.png"));
await render(512, MASKABLE_RATIO, path.join(iconsDir, "icon-maskable-512.png"));
await render(180, ANY_RATIO, path.join(appDir, "apple-icon.png"));
