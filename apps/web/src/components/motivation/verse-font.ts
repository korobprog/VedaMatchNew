import localFont from "next/font/local";

/**
 * Шрифт санскрита в «Читать полностью» (VED-263).
 *
 * Шрифт портала Manrope не знает деванагари, а русская транслитерация
 * («дхр̣тара̄шт̣ра») держится на комбинируемой диакритике, которую он
 * собирает криво. Поэтому стих набирается так же, как в Библиотеке:
 * деванагари — Tiro Devanagari Sanskrit (полные конъюнкты), кириллица с
 * диакритикой — Noto Serif. Файлы — копия шрифтов стиха Библиотеки
 * (scripts/build-fonts.sh кладёт их сюда же): чужие ассеты сервис не берёт.
 *
 * Деванагари — отдельное семейство со своим unicode-range: браузер качает его,
 * только встретив деванагари, то есть когда человек развернул блок
 * «Санскрит». Лента без раскрытых блоков этих файлов не грузит вовсе.
 */
const tiroDevanagari = localFont({
  src: [
    {
      path: "./fonts/tiro-devanagari-sanskrit-devanagari.woff2",
      style: "normal",
    },
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
  variable: "--font-motivation-devanagari",
});

const notoSerif = localFont({
  src: [{ path: "./fonts/noto-serif-400.woff2", style: "normal" }],
  weight: "400",
  display: "swap",
  preload: false,
  adjustFontFallback: "Times New Roman",
  variable: "--font-motivation-verse-serif",
});

/** Класс-обёртка: объявляет переменные, стеки ниже их собирают. */
export const verseFontVariables = `${tiroDevanagari.variable} ${notoSerif.variable}`;

/**
 * Стек стиха. Системные шрифты деванагари — запасом, пока свой не пришёл:
 * без них браузер нарисовал бы квадраты.
 */
export const VERSE_FONT_FAMILY =
  "var(--font-motivation-devanagari), var(--font-motivation-verse-serif), 'Noto Serif Devanagari', 'Noto Sans Devanagari', 'Kohinoor Devanagari', serif";
