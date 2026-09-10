/**
 * Разбор страниц кулинарных книг с gitabase.com.
 *
 * Только разбор строки, без сети. Страница держит весь рецепт одним абзацем,
 * разделённым `<br>`, и объявляет UTF-8 — но встречаются битые байты, поэтому
 * декодировать её нужно снисходительно. Формат хрупкий, и он покрыт тестами:
 * иначе поломка вёрстки на той стороне обнаружится тем, что в базу тихо лягут
 * пустые рецепты.
 *
 * Порядок строк в абзаце: название на санскрите, описание, время, порции,
 * ингредиенты, пронумерованные шаги.
 */

export interface ParsedGitabaseRecipe {
  title: string;
  description: string | null;
  ingredients: string[];
  steps: string[];
}

const TIME_LINE = /^врем/i;
const SERVINGS_LINE = /^количество\s+порци/i;
const STEP_LINE = /^\d+\.\s/;
/** Сноска издателя: к составу не относится и в ингредиенты попадать не должна. */
const FOOTNOTE_LINE = /^[*†]/;
/**
 * Ингредиент начинается с количества. Строка без числа в начале — это проза:
 * либо ненумерованный шаг, либо примечание. Короткие исключения вроде «соль по
 * вкусу» остаются ингредиентами, длинные уходят в шаги.
 */
const QUANTITY_START = /^\d|^[¼½¾⅓⅔]/;
const SHORT_INGREDIENT_MAX = 50;

function stripTags(value: string): string {
  return value.replace(/<[^>]+>/g, '');
}

function decodeEntities(value: string): string {
  return value
    .replace(/&emsp;|&nbsp;|&ensp;/gi, ' ')
    .replace(/&laquo;/gi, '«')
    .replace(/&raquo;/gi, '»')
    .replace(/&mdash;/gi, '—')
    .replace(/&ndash;/gi, '–')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#(\d+);/g, (_m, code: string) =>
      String.fromCharCode(Number(code)),
    );
}

function clean(value: string): string {
  return decodeEntities(stripTags(value)).replace(/\s+/g, ' ').trim();
}

/** Заголовки страницы: первый `h4` — книга, `h5` — глава, второй `h4` — рецепт. */
export function parseHeadings(html: string): {
  book: string | null;
  chapter: string | null;
  recipe: string | null;
} {
  const h4 = [...html.matchAll(/<h4[^>]*>(.*?)<\/h4>/gis)].map((m) =>
    clean(m[1]),
  );
  const h5 = html.match(/<h5[^>]*>(.*?)<\/h5>/is);
  return {
    book: h4[0] ?? null,
    chapter: h5 ? clean(h5[1]) : null,
    recipe: h4[1] ?? null,
  };
}

/**
 * Рецепт со страницы. `null` — страницы рецепта здесь нет: так отличается
 * конец главы от поломки разбора, и импорт останавливается сам.
 */
export function parseRecipePage(html: string): ParsedGitabaseRecipe | null {
  const { recipe } = parseHeadings(html);
  if (!recipe) return null;

  // Рецепт бывает разложен на несколько абзацев: продукты в первом, шаги
  // дальше по одному на абзац. Читать только первый значит потерять способ
  // приготовления — а рецепт без него бесполезен.
  const paragraphs = [...html.matchAll(/<p[^>]*>(.*?)<\/p>/gis)].map(
    (match) => match[1],
  );
  if (!paragraphs.length) return null;

  const lines = paragraphs
    .join('<br>')
    .split(/<br\s*\/?>/i)
    .map(clean)
    .filter(Boolean);

  const steps: string[] = [];
  const ingredients: string[] = [];
  const intro: string[] = [];

  let seenMeta = false;
  let seenStep = false;
  for (const line of lines) {
    if (FOOTNOTE_LINE.test(line)) continue;
    if (STEP_LINE.test(line)) {
      seenStep = true;
      steps.push(line);
      continue;
    }
    // После нумерованных шагов идут ненумерованные хвосты вроде «Подавайте
    // горячим» — это часть способа приготовления, а не мусор.
    if (seenStep) {
      steps.push(line);
      continue;
    }
    if (TIME_LINE.test(line) || SERVINGS_LINE.test(line)) {
      seenMeta = true;
      continue;
    }
    if (!seenMeta) {
      intro.push(line);
      continue;
    }
    // После списка продуктов встречается шаг без номера — он длинный и не
    // начинается с количества. Считать его ингредиентом значит подсунуть
    // человеку в список покупок целое предложение.
    if (!QUANTITY_START.test(line) && line.length > SHORT_INGREDIENT_MAX) {
      steps.push(line);
      continue;
    }
    ingredients.push(line);
  }

  if (!ingredients.length && !steps.length) return null;

  // Первая строка абзаца — название на санскрите заглавными; описанием
  // считаем то, что идёт после неё.
  const description = intro.slice(1).join(' ').trim() || null;

  return { title: recipe, description, ingredients, steps };
}

/** Сколько рецептов в главе: страница перечисляет их как «Текст 1…N». */
export function parseChapterSize(html: string): number {
  const numbers = [...html.matchAll(/>\s*Текст\s+(\d+)\s*</gi)].map((m) =>
    Number(m[1]),
  );
  return numbers.length ? Math.max(...numbers) : 0;
}
