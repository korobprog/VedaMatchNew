// Значки пунктов быстрого меню приложения — `shortcuts` в манифесте. Меню
// открывается долгим нажатием на значок установленного VedaMatch (VED-78).
// Запуск: node scripts/generate-shortcut-icons.mjs
//
// Рисунок тот же, что у сервиса в сетке портала (ServiceIcon), чтобы пункт
// меню узнавался с первого взгляда. Компонент отрисовывается в SVG через
// react-dom/server, TSX переводится уже стоящим typescript, растр делает
// sharp — новых зависимостей ради разового генератора не нужно.
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import sharp from "sharp";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = path.join(root, "src/components/icons/service-icons.tsx");
const OUT_DIR = path.join(root, "public/icons/shortcuts");

// Тот же список, что в src/app/manifest.ts. Разойдутся — manifest.spec.ts
// упадёт на пункте, у которого нет файла значка.
const SLUGS = [
  "motivation",
  "music",
  "library",
  "chat",
  "vedabase",
  "union",
  "work",
  "notices",
];
const SIZES = [96, 192];

// Фон — светлый фон приложения, как у основного значка. Рисунок занимает
// меньше двух третей: лаунчер может обрезать значок в круг, и края
// рисунка не должны уйти за маску.
const BACKGROUND = "#FBF9FF";
const GLYPH_RATIO = 0.62;

async function loadServiceIcon() {
  const compiled = ts.transpileModule(await readFile(SOURCE, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  });
  // Временный файл кладётся рядом со скриптом, а не в системную папку:
  // оттуда импорт `react` найдёт node_modules веба.
  const temp = path.join(root, "scripts/.service-icons.tmp.mjs");
  await writeFile(temp, compiled.outputText);
  try {
    const loaded = await import(pathToFileURL(temp).href);
    return loaded.ServiceIcon;
  } finally {
    await rm(temp, { force: true });
  }
}

const ServiceIcon = await loadServiceIcon();
await mkdir(OUT_DIR, { recursive: true });

for (const slug of SLUGS) {
  const svg = renderToStaticMarkup(createElement(ServiceIcon, { slug }));
  for (const size of SIZES) {
    const glyphSize = Math.round(size * GLYPH_RATIO);
    // Плотность под итоговый размер: viewBox значков — 32×32, и без неё
    // растр получился бы мелким и размытым после увеличения.
    const glyph = await sharp(Buffer.from(svg), {
      density: Math.ceil((72 * glyphSize) / 32),
    })
      .resize(glyphSize, glyphSize)
      .png()
      .toBuffer();
    const icon = await sharp({
      create: {
        width: size,
        height: size,
        channels: 4,
        background: BACKGROUND,
      },
    })
      .composite([{ input: glyph, gravity: "center" }])
      .png({ compressionLevel: 9 })
      .toBuffer();
    const file = path.join(OUT_DIR, `${slug}-${size}.png`);
    await writeFile(file, icon);
    console.log(`Wrote ${path.relative(root, file)} (${size}x${size})`);
  }
}
