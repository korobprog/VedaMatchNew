#!/usr/bin/env bash
# Собирает woff2 для next/font/local: шрифты портала — в src/app/fonts/,
# шрифты стиха Библиотеки — в src/components/library/shloka/fonts/, их копия
# для санскрита в «Читать полностью» Вдохновения — в
# src/components/motivation/fonts/ (сервис не берёт файлы чужого, VED-263).
#
# Раньше шрифты тянул next/font/google прямо во время `next build`, и сборка
# образа падала, когда fonts.googleapis.com не отвечал. Теперь файлы лежат в
# репозитории, а этот скрипт нужен только чтобы добавить начертание или
# обновить версию. Требует python3 с fonttools и brotli:
#   pip install fonttools brotli
#
# Источники — ровно то, что раздаёт Google Fonts: вариативные Unbounded и
# Manrope из google/fonts (закреплённый коммит), статичные начертания — с
# fonts.gstatic.com (версия в пути). Подмножества — те же unicode-range, что в
# CSS Google, склеенные в один файл на начертание: next/font/local не умеет
# unicode-range на отдельный файл. Исключение — деванагари Tiro: он тяжёлый
# и лежит отдельно, см. components/library/shloka/shloka-font.ts.
set -euo pipefail

WEB="$(cd "$(dirname "$0")/.." && pwd)"
PORTAL="$WEB/src/app/fonts"
VERSE="$WEB/src/components/library/shloka/fonts"
MOTIVATION="$WEB/src/components/motivation/fonts"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$PORTAL" "$VERSE" "$MOTIVATION"

GF="https://raw.githubusercontent.com/google/fonts/23e54b51ddffbc7713c583748e3bd86f62b1fa4a/ofl"
GS="https://fonts.gstatic.com/s"

LATIN="U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD"
LATIN_EXT="U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF"
CYRILLIC="U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116"
CYRILLIC_EXT="U+0460-052F,U+1C80-1C8A,U+20B4,U+2DE0-2DFF,U+A640-A69F,U+FE2E-FE2F"
DEVANAGARI="U+0900-097F,U+1CD0-1CF9,U+200C-200D,U+20A8,U+20B9,U+20F0,U+25CC,U+A830-A839,U+A8E0-A8FF,U+11B00-11B09"

fetch() { curl -fsSL -o "$TMP/$2" "$1"; }

# subset <вход> <unicode-range> <выход.woff2>
subset() {
  pyftsubset "$TMP/$1" --unicodes="$2" --layout-features='*' \
    --flavor=woff2 --output-file="$3"
}

# Вариативные: ось веса обрезается до используемого диапазона.
fetch "$GF/unbounded/Unbounded%5Bwght%5D.ttf" unbounded.ttf
fonttools varLib.instancer "$TMP/unbounded.ttf" wght=700:900 -o "$TMP/unbounded-cut.ttf"
subset unbounded-cut.ttf "$CYRILLIC,$LATIN" "$PORTAL/unbounded-700-900.woff2"

fetch "$GF/manrope/Manrope%5Bwght%5D.ttf" manrope.ttf
fonttools varLib.instancer "$TMP/manrope.ttf" wght=400:700 -o "$TMP/manrope-cut.ttf"
subset manrope-cut.ttf "$CYRILLIC,$LATIN" "$PORTAL/manrope-400-700.woff2"

# Статичные.
fetch "$GS/ibmplexmono/v20/-F63fjptAgt5VM-kVkqdyU8n5ig.ttf" plex-400.ttf
fetch "$GS/ibmplexmono/v20/-F6qfjptAgt5VM-kVkqdyU8n3twJ8lc.ttf" plex-500.ttf
subset plex-400.ttf "$CYRILLIC,$LATIN" "$PORTAL/ibm-plex-mono-400.woff2"
subset plex-500.ttf "$CYRILLIC,$LATIN" "$PORTAL/ibm-plex-mono-500.woff2"

fetch "$GS/tirodevanagarisanskrit/v7/MCoAzBbr09vVUgVBM8FWu_yZdZkhkg-I0nUlb59pEg.ttf" tiro.ttf
fetch "$GS/tirodevanagarisanskrit/v7/MCoGzBbr09vVUgVBM8FWu_yZdZkhkg-I0nUlb59ZEIsu.ttf" tiro-italic.ttf
subset tiro.ttf "$DEVANAGARI" "$VERSE/tiro-devanagari-sanskrit-devanagari.woff2"
subset tiro-italic.ttf "$DEVANAGARI" "$VERSE/tiro-devanagari-sanskrit-devanagari-italic.woff2"
subset tiro.ttf "$LATIN_EXT,$LATIN" "$VERSE/tiro-devanagari-sanskrit-latin.woff2"
subset tiro-italic.ttf "$LATIN_EXT,$LATIN" "$VERSE/tiro-devanagari-sanskrit-latin-italic.woff2"

fetch "$GS/notoserif/v33/ga6iaw1J5X9T9RW6j9bNVls-hfgvz8JcMofYTa32J4wsL2JAlAhZqFCjwA.ttf" noto.ttf
fetch "$GS/notoserif/v33/ga6saw1J5X9T9RW6j9bNfFIMZhhWnFTyNZIQD1-_FXP0RgnaOg9MYBNLg8cP.ttf" noto-italic.ttf
subset noto.ttf "$CYRILLIC_EXT,$CYRILLIC,$LATIN_EXT,$LATIN" "$VERSE/noto-serif-400.woff2"
subset noto-italic.ttf "$CYRILLIC_EXT,$CYRILLIC,$LATIN_EXT,$LATIN" "$VERSE/noto-serif-400-italic.woff2"

cp "$VERSE/tiro-devanagari-sanskrit-devanagari.woff2" "$VERSE/noto-serif-400.woff2" "$MOTIVATION/"

ls -l "$PORTAL" "$VERSE" "$MOTIVATION"
