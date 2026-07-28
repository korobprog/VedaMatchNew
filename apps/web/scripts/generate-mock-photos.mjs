// Генератор плейсхолдеров для демо-аккаунтов Union (apps/api/prisma/seed-dev.ts).
// Запуск: node scripts/generate-mock-photos.mjs
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const outputDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../public/mock/union",
);

/** Демо-люди: slug и инициал должны совпадать с сидом. */
const people = [
  { slug: "radha", initial: "Р", palette: ["#FF3E9E", "#B23EFF"] },
  { slug: "govinda", initial: "Г", palette: ["#23F0C7", "#0C917C"] },
  { slug: "tulasi", initial: "Т", palette: ["#FFC85C", "#FF7A3E"] },
  { slug: "nitai", initial: "Н", palette: ["#7A5CFF", "#3EA8FF"] },
  { slug: "yamuna", initial: "Я", palette: ["#FF6B8B", "#FFC85C"] },
  { slug: "madhava", initial: "М", palette: ["#3EE0FF", "#7A5CFF"] },
  { slug: "lalita", initial: "Л", palette: ["#FF3E9E", "#FFC85C"] },
  { slug: "vrinda", initial: "В", palette: ["#23F0C7", "#3EA8FF"] },
  { slug: "arjuna", initial: "А", palette: ["#B23EFF", "#3EA8FF"] },
  { slug: "sita", initial: "С", palette: ["#FF9A3E", "#FF3E9E"] },
  { slug: "kesava", initial: "К", palette: ["#0C917C", "#23F0C7"] },
  { slug: "devaki", initial: "Д", palette: ["#8B5CF6", "#FF6B8B"] },
];

const PHOTOS_PER_PERSON = 3;

function portrait({ initial, palette }, variant) {
  const [from, to] = variant % 2 === 0 ? palette : [palette[1], palette[0]];
  const rings = [320, 250, 180]
    .map(
      (radius, index) =>
        `<circle cx="300" cy="300" r="${radius + variant * 8}" fill="none" stroke="#ffffff" stroke-opacity="${0.1 + index * 0.05}" stroke-width="2"/>`,
    )
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 750" width="600" height="750" role="img">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${from}"/>
      <stop offset="100%" stop-color="${to}"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="38%" r="55%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.45"/>
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="600" height="750" fill="url(#bg)"/>
  <g transform="translate(0,60)">${rings}</g>
  <rect width="600" height="750" fill="url(#glow)"/>
  <text x="300" y="430" text-anchor="middle" font-family="Unbounded, system-ui, sans-serif" font-size="260" font-weight="700" fill="#ffffff" fill-opacity="0.92">${initial}</text>
  <text x="300" y="120" text-anchor="middle" font-family="Manrope, system-ui, sans-serif" font-size="24" letter-spacing="6" fill="#ffffff" fill-opacity="0.6">DEMO ${variant + 1}/${PHOTOS_PER_PERSON}</text>
</svg>
`;
}

await mkdir(outputDir, { recursive: true });
let written = 0;
for (const person of people) {
  for (let variant = 0; variant < PHOTOS_PER_PERSON; variant += 1) {
    await writeFile(
      path.join(outputDir, `${person.slug}-${variant + 1}.svg`),
      portrait(person, variant),
      "utf8",
    );
    written += 1;
  }
}
console.log(`Generated ${written} mock portraits in ${outputDir}`);
