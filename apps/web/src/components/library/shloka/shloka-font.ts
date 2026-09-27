import localFont from "next/font/local";

/**
 * Шрифт стиха (VED-386). Tiro Devanagari Sanskrit сделан именно под
 * санскрит: полные конъюнкты деванагари и латиница с диакритикой IAST
 * (ā ī ū ṛ ṝ ḷ ṅ ñ ṭ ḍ ṇ ś ṣ ṃ ḥ). Кириллицы в нём нет, поэтому второй в
 * стеке Noto Serif — с кириллицей и комбинируемой диакритикой: русская
 * транслитерация «а̄», «ш́» собирается в нём целиком.
 *
 * Подключаются только там, где стих показывают, — остальной портал эти
 * файлы не качает. Файлы лежат рядом, в ./fonts (собирает
 * scripts/build-fonts.sh), а не тянутся с Google на сборке.
 *
 * next/font/local не даёт unicode-range на отдельный файл, поэтому деванагари
 * Tiro — отдельное семейство со своим unicode-range: браузер качает его,
 * только встретив деванагари, и страница с одной латиницей его не грузит.
 * Подменного шрифта у него нет, иначе тот перехватил бы все прочие символы
 * раньше латинского Tiro.
 */
const tiroDevanagari = localFont({
  src: [
    { path: "./fonts/tiro-devanagari-sanskrit-devanagari.woff2", style: "normal" },
    { path: "./fonts/tiro-devanagari-sanskrit-devanagari-italic.woff2", style: "italic" },
  ],
  weight: "400",
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  declarations: [
    {
      prop: "unicode-range",
      value:
        "U+0900-097F, U+1CD0-1CF9, U+200C-200D, U+20A8, U+20B9, U+20F0, U+25CC, U+A830-A839, U+A8E0-A8FF, U+11B00-11B09",
    },
  ],
  variable: "--font-verse-tiro-devanagari",
});

const tiro = localFont({
  src: [
    { path: "./fonts/tiro-devanagari-sanskrit-latin.woff2", style: "normal" },
    { path: "./fonts/tiro-devanagari-sanskrit-latin-italic.woff2", style: "italic" },
  ],
  weight: "400",
  display: "swap",
  preload: false,
  adjustFontFallback: "Times New Roman",
  variable: "--font-verse-tiro",
});

const notoSerif = localFont({
  src: [
    { path: "./fonts/noto-serif-400.woff2", style: "normal" },
    { path: "./fonts/noto-serif-400-italic.woff2", style: "italic" },
  ],
  weight: "400",
  display: "swap",
  preload: false,
  adjustFontFallback: "Times New Roman",
  variable: "--font-verse-serif",
});

/** Класс-обёртка: объявляет переменные, `font-verse` ниже их собирает. */
export const verseFontVariables = `${tiroDevanagari.variable} ${tiro.variable} ${notoSerif.variable}`;

/** Стек стиха — для `style={{ fontFamily }}`. */
export const VERSE_FONT_FAMILY =
  "var(--font-verse-tiro-devanagari), var(--font-verse-tiro), var(--font-verse-serif), 'Noto Serif Devanagari', serif";
