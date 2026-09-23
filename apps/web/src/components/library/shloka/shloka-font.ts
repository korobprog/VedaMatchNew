import { Noto_Serif, Tiro_Devanagari_Sanskrit } from "next/font/google";

/**
 * Шрифт стиха (VED-386). Tiro Devanagari Sanskrit сделан именно под
 * санскрит: полные конъюнкты деванагари и латиница с диакритикой IAST
 * (ā ī ū ṛ ṝ ḷ ṅ ñ ṭ ḍ ṇ ś ṣ ṃ ḥ). Кириллицы в нём нет, поэтому второй в
 * стеке Noto Serif — с кириллицей и комбинируемой диакритикой: русская
 * транслитерация «а̄», «ш́» собирается в нём целиком.
 *
 * Подключаются только там, где стих показывают, — остальной портал эти
 * файлы не качает. Подмножества режутся по unicode-range, поэтому страница
 * с одной латиницей деванагари не грузит.
 */
const tiro = Tiro_Devanagari_Sanskrit({
  subsets: ["devanagari", "latin", "latin-ext"],
  weight: "400",
  style: ["normal", "italic"],
  display: "swap",
  preload: false,
  variable: "--font-verse-tiro",
});

const notoSerif = Noto_Serif({
  subsets: ["cyrillic", "cyrillic-ext", "latin", "latin-ext"],
  weight: ["400"],
  style: ["normal", "italic"],
  display: "swap",
  preload: false,
  variable: "--font-verse-serif",
});

/** Класс-обёртка: объявляет переменные, `font-verse` ниже их собирает. */
export const verseFontVariables = `${tiro.variable} ${notoSerif.variable}`;

/** Стек стиха — для `style={{ fontFamily }}`. */
export const VERSE_FONT_FAMILY =
  "var(--font-verse-tiro), var(--font-verse-serif), 'Noto Serif Devanagari', serif";
