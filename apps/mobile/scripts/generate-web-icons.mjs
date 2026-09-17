#!/usr/bin/env node
// Иконки веб-версии (ios.vedamatch.com): манифест PWA и «На экран Домой»
// iPhone. Источник — `assets/images/icon.png`, который сам собирается
// `generate-brand-assets.mjs` из бренд-кита: знак уже стоит на фирменном фоне
// во всю площадь, поэтому годится и для maskable-иконки.
//
// Запуск: pnpm --filter @vedamatch/mobile generate:web-icons
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const mobileRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(mobileRoot, 'assets/images/icon.png');
const outDir = path.join(mobileRoot, 'public/icons');

// iOS берёт apple-touch-icon 180×180 и сам скругляет углы; прозрачность
// превращает в чёрный фон — у icon.png её нет.
const SIZES = [
  { name: 'apple-touch-icon.png', size: 180 },
  { name: 'icon-192.png', size: 192 },
  { name: 'icon-512.png', size: 512 },
];

await mkdir(outDir, { recursive: true });
for (const { name, size } of SIZES) {
  await sharp(source).resize(size, size).png({ compressionLevel: 9 }).toFile(path.join(outDir, name));
  console.log(`${name} ${size}×${size}`);
}
