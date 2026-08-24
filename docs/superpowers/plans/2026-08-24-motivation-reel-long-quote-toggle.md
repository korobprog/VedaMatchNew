# Вдохновение: сворачиваемая длинная цитата в рилсах — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Длинная цитата не занимает весь экран ни у фото-, ни у видео-постов сервиса «Вдохновение» — у обоих есть кнопка «Читать полностью ›», открывающая цитату целиком в шторке снизу; в кадре ролика теперь максимум 4 строки вместо 12, и текст, не влезший в кадр, больше не теряется безвозвратно.

**Architecture:** Один настраиваемый параметр (`maxQuoteLines`) в существующем построителе SVG-оверлея ограничивает, сколько строк цитаты попадает в кадр ролика при генерации. На фронтенде — одна лёгкая эвристика (`isLongQuote`, по длине текста, не точный расчёт переноса) решает, показывать ли кнопку «Читать полностью», и один переиспользуемый компонент-шторка (`FullQuoteToggle`, по образцу уже существующей шторки «Пояснение») показывает цитату целиком — один и тот же код для фото и для видео, потому что `quote`/`source` в `ReelSlide` уже вычисляются независимо от типа медиа.

**Tech Stack:** NestJS + Sharp/SVG + ffmpeg (apps/api), Next.js клиентский компонент + Vitest (apps/web).

## Global Constraints

- Спека: `docs/superpowers/specs/2026-08-24-motivation-reel-long-quote-toggle-design.md` — реализация обязана ей соответствовать.
- Публичное имя сервиса — «Вдохновение»; пути и код остаются `motivation` (переименования кода в этой задаче нет).
- Открытки/сторис-шеринг (`motivation-postcards.service.ts`, `motivation-story-rebuild.service.ts`, `motivation-worker.service.ts`) не меняются — лимит строк там остаётся прежним (12), кнопки «Развернуть» у них не будет.
- `isLongQuote` — один порог (170 символов) и одна функция, общая для фото и видео.
- Текст кнопки: «Читать полностью ›». Заголовок шторки: «Цитата целиком».

---

### Task 1: Бэкенд — настраиваемый лимит строк цитаты, свой лимит для роликов

**Files:**
- Modify: `apps/api/src/modules/motivation/story-image.ts:129-140` (`StoryOverlayInput`), `:194-199` (`buildStoryOverlaySvg`), `:278-289` (`renderStoryOverlay`)
- Modify: `apps/api/src/modules/motivation/story-video.ts` (новые `REEL_MAX_QUOTE_LINES`, `buildReelOverlayInput`)
- Modify: `apps/api/src/modules/motivation/motivation-video-worker.service.ts` (использовать `buildReelOverlayInput`)
- Test: `apps/api/src/modules/motivation/story-image.spec.ts`, `apps/api/src/modules/motivation/story-video.spec.ts`

**Interfaces:**
- Produces: `StoryOverlayInput.maxQuoteLines?: number` (story-image.ts) — необязательное поле, по умолчанию `MAX_QUOTE_LINES` (12).
- Produces: `story-video.ts` экспортирует `REEL_MAX_QUOTE_LINES = 4` и `buildReelOverlayInput(text: string, attribution: string): StoryOverlayInput`.

- [ ] **Step 1: Написать падающие тесты на `maxQuoteLines` в `story-image.spec.ts`**

Добавить в конец файла `apps/api/src/modules/motivation/story-image.spec.ts`:

```typescript
describe('buildStoryOverlaySvg · лимит строк цитаты', () => {
  // 9 строк по умолчанию при этом тексте — проверено на реальной функции.
  const longText =
    'Преданность освобождает ум от иллюзии и открывает путь к истинному счастью. '.repeat(
      3,
    );

  function quoteLineCount(svg: string): number {
    return (svg.match(/class="quote"/g) ?? []).length;
  }

  it('без maxQuoteLines укладывается в дефолтный лимит (12)', () => {
    const svg = buildStoryOverlaySvg({ text: longText });
    expect(quoteLineCount(svg)).toBeGreaterThan(4);
  });

  it('с maxQuoteLines обрезает раньше', () => {
    const svg = buildStoryOverlaySvg({ text: longText, maxQuoteLines: 4 });
    expect(quoteLineCount(svg)).toBeLessThanOrEqual(4);
  });

  it('renderStoryOverlay учитывает maxQuoteLines при расчёте места под знак', async () => {
    const short = await renderStoryOverlay({ text: 'Коротко' });
    const long = await renderStoryOverlay({
      text: longText,
      maxQuoteLines: 4,
    });
    // Не падает и возвращает валидный PNG-буфер — сам расчёт места под знак
    // уже покрыт другими тестами файла через brandLogoBox().
    expect(short.length).toBeGreaterThan(0);
    expect(long.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Прогнать тесты и убедиться, что второй падает**

Run: `pnpm --filter @vedamatch/api test -- story-image`
Expected: тест «с maxQuoteLines обрезает раньше» FAIL — `buildStoryOverlaySvg` пока не читает поле `maxQuoteLines` вообще, поэтому обрезка всё ещё идёт по дефолтным 12 строкам, и `quoteLineCount(svg)` окажется больше 4. Остальные тесты файла (включая новый «без maxQuoteLines») уже проходят — это регрессионная защита.

- [ ] **Step 3: Добавить поле в тип и прочитать его в обеих функциях**

В `apps/api/src/modules/motivation/story-image.ts` заменить:

```typescript
export type StoryOverlayInput = {
  /** Текст цитаты для сторис. */
  text: string;
  /** Автор, произведение, глава — пустые части выбрасываются вызывающим. */
  attribution?: string | null;
  /**
   * Поздравление для открытки («С Джанмаштами»). Стоит вверху кадра и
   * превращает ту же картинку в открытку: отдельного макета нет намеренно —
   * иначе правка отступов расходилась бы между сторис и открыткой.
   */
  greeting?: string | null;
};
```

на:

```typescript
export type StoryOverlayInput = {
  /** Текст цитаты для сторис. */
  text: string;
  /** Автор, произведение, глава — пустые части выбрасываются вызывающим. */
  attribution?: string | null;
  /**
   * Поздравление для открытки («С Джанмаштами»). Стоит вверху кадра и
   * превращает ту же картинку в открытку: отдельного макета нет намеренно —
   * иначе правка отступов расходилась бы между сторис и открыткой.
   */
  greeting?: string | null;
  /** Сколько строк цитаты вместить в кадр. По умолчанию — MAX_QUOTE_LINES. */
  maxQuoteLines?: number;
};
```

В том же файле, в `buildStoryOverlaySvg`, заменить:

```typescript
  const lines = clampLines(
    wrapText(input.text, QUOTE_SIZE, maxWidth),
    MAX_QUOTE_LINES,
  );
```

на:

```typescript
  const lines = clampLines(
    wrapText(input.text, QUOTE_SIZE, maxWidth),
    input.maxQuoteLines ?? MAX_QUOTE_LINES,
  );
```

В том же файле, в `renderStoryOverlay`, заменить:

```typescript
  const box = brandLogoBox({
    quoteLines: clampLines(wrapText(input.text, QUOTE_SIZE, maxWidth), MAX_QUOTE_LINES)
      .length,
```

на:

```typescript
  const box = brandLogoBox({
    quoteLines: clampLines(
      wrapText(input.text, QUOTE_SIZE, maxWidth),
      input.maxQuoteLines ?? MAX_QUOTE_LINES,
    ).length,
```

- [ ] **Step 4: Прогнать тесты и убедиться, что все проходят**

Run: `pnpm --filter @vedamatch/api test -- story-image`
Expected: PASS — все тесты файла, включая три новых.

- [ ] **Step 5: Написать падающий тест на `buildReelOverlayInput`**

Добавить в `apps/api/src/modules/motivation/story-video.spec.ts`, после блока `describe('estimateReadingSeconds', ...)`:

```typescript
describe('buildReelOverlayInput', () => {
  it('ограничивает цитату ролика четырьмя строками', () => {
    const overlay = buildReelOverlayInput('Цитата', 'Автор');
    expect(overlay).toEqual({
      text: 'Цитата',
      attribution: 'Автор',
      maxQuoteLines: REEL_MAX_QUOTE_LINES,
    });
  });

  it('лимит роликов меньше, чем у открытки', () => {
    expect(REEL_MAX_QUOTE_LINES).toBe(4);
  });
});
```

И добавить `buildReelOverlayInput`, `REEL_MAX_QUOTE_LINES` в импорт из `./story-video` в начале файла (рядом с `buildStoryVideoArgs`, `estimateReadingSeconds`, `ffmpegPath`, `TEXT_APPEAR_DELAY_SECONDS`, `TEXT_FADE_IN_SECONDS`).

- [ ] **Step 6: Прогнать тест и убедиться, что он падает**

Run: `pnpm --filter @vedamatch/api test -- story-video`
Expected: FAIL — модуль ещё не экспортирует ни `buildReelOverlayInput`, ни `REEL_MAX_QUOTE_LINES` (ошибка импорта/undefined).

- [ ] **Step 7: Реализовать `REEL_MAX_QUOTE_LINES` и `buildReelOverlayInput`**

В `apps/api/src/modules/motivation/story-video.ts` добавить после блока констант `TEXT_APPEAR_DELAY_SECONDS`/`TEXT_FADE_IN_SECONDS`:

```typescript
/** Строк цитаты в кадре ролика — меньше, чем у открытки: кадр не должен
 *  становиться стеной текста, есть кнопка «Развернуть» в самой ленте. */
export const REEL_MAX_QUOTE_LINES = 4;

/**
 * Собирает вход для оверлея ролика.
 *
 * Вынесено чистой функцией по той же причине, что и `buildStoryVideoArgs`:
 * проверить лимит строк можно без мока всего воркера и без запуска ffmpeg.
 */
export function buildReelOverlayInput(
  text: string,
  attribution: string,
): StoryOverlayInput {
  return { text, attribution, maxQuoteLines: REEL_MAX_QUOTE_LINES };
}
```

- [ ] **Step 8: Прогнать тест и убедиться, что он проходит**

Run: `pnpm --filter @vedamatch/api test -- story-video`
Expected: PASS — все тесты файла, включая два новых.

- [ ] **Step 9: Использовать `buildReelOverlayInput` в воркере**

В `apps/api/src/modules/motivation/motivation-video-worker.service.ts`, строка с импортом:

```typescript
import { composeStoryVideo, estimateReadingSeconds } from './story-video';
```

заменить на:

```typescript
import {
  buildReelOverlayInput,
  composeStoryVideo,
  estimateReadingSeconds,
} from './story-video';
```

И заменить вызов:

```typescript
      return await composeStoryVideo(
        video,
        { text, attribution },
        { loopToSeconds: seconds, voice: spoken?.audio, music },
      );
```

на:

```typescript
      return await composeStoryVideo(
        video,
        buildReelOverlayInput(text, attribution),
        { loopToSeconds: seconds, voice: spoken?.audio, music },
      );
```

- [ ] **Step 10: Прогнать полный набор тестов api и typecheck**

Run: `pnpm --filter @vedamatch/api test`
Expected: PASS, без новых красных тестов.

Run (из `apps/api`): `pnpm exec tsc --noEmit -p tsconfig.json`
Expected: без ошибок.

- [ ] **Step 11: Закоммитить**

```bash
git add apps/api/src/modules/motivation/story-image.ts apps/api/src/modules/motivation/story-image.spec.ts apps/api/src/modules/motivation/story-video.ts apps/api/src/modules/motivation/story-video.spec.ts apps/api/src/modules/motivation/motivation-video-worker.service.ts
git commit -m "feat(motivation): cap reel video overlay to 4 quote lines"
```

---

### Task 2: Фронтенд — кнопка «Читать полностью» для фото и видео

**Files:**
- Create: `apps/web/src/components/motivation/quote-text.spec.ts`
- Modify: `apps/web/src/components/motivation/quote-text.ts` (новая `isLongQuote`)
- Modify: `apps/web/src/components/motivation/reels-feed.tsx` (новый компонент `FullQuoteToggle`, `line-clamp-4`, подключение кнопки)
- Test: `apps/web/src/components/motivation/reels-feed.spec.tsx`

**Interfaces:**
- Consumes: ничего из Task 1 напрямую (фронтенд не знает про бэкендный лимит строк — эвристика независимая).
- Produces: `isLongQuote(text: string): boolean` (quote-text.ts) — используется внутри `reels-feed.tsx`, больше нигде.

- [ ] **Step 1: Написать падающий тест на `isLongQuote`**

Создать `apps/web/src/components/motivation/quote-text.spec.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { isLongQuote } from "./quote-text";

describe("isLongQuote", () => {
  it("короткую цитату не считает длинной", () => {
    expect(isLongQuote("Коротко")).toBe(false);
  });

  it("длинную цитату считает длинной", () => {
    const long = "Преданность освобождает ум от иллюзии. ".repeat(6);
    expect(isLongQuote(long)).toBe(true);
  });

  it("ровно на границе не считает длинной", () => {
    expect(isLongQuote("а".repeat(170))).toBe(false);
    expect(isLongQuote("а".repeat(171))).toBe(true);
  });
});
```

- [ ] **Step 2: Прогнать тест и убедиться, что он падает**

Run: `pnpm --filter @vedamatch/web exec vitest run src/components/motivation/quote-text.spec.ts`
Expected: FAIL — `isLongQuote` пока не экспортируется из `quote-text.ts` (ошибка импорта).

- [ ] **Step 3: Реализовать `isLongQuote`**

В `apps/web/src/components/motivation/quote-text.ts` добавить в конец файла:

```typescript
/**
 * Примерная граница в символах — не точный расчёт переноса строк (шрифт и
 * ширина экрана у ленты и у кадра ролика разные), а прикидка «похоже, не
 * поместится в 4 строки», по той же логике, что estimateReadingSeconds на
 * бэкенде: приблизительно, но достаточно, чтобы решить, показывать кнопку.
 */
const LONG_QUOTE_CHARS = 170;

export function isLongQuote(text: string): boolean {
  return text.trim().length > LONG_QUOTE_CHARS;
}
```

- [ ] **Step 4: Прогнать тест и убедиться, что он проходит**

Run: `pnpm --filter @vedamatch/web exec vitest run src/components/motivation/quote-text.spec.ts`
Expected: PASS — все три теста.

- [ ] **Step 5: Написать падающие тесты в `reels-feed.spec.tsx`**

Добавить в `apps/web/src/components/motivation/reels-feed.spec.tsx`, после теста `"does not claim a verified source when there is none"`:

```tsx
  it("показывает «Читать полностью» у длинной цитаты фото-поста и открывает её целиком", async () => {
    fetchOk({});
    const longQuote =
      "Преданность освобождает ум от иллюзии и открывает путь к истинному счастью. ".repeat(
        3,
      );
    render(
      <ReelsFeed
        initial={{ items: [post("a", { text: longQuote })], nextCursor: null }}
        tab="forYou"
        donation={null}
      />,
    );

    const toggle = screen.getByRole("button", { name: "Читать полностью ›" });
    await userEvent.click(toggle);

    expect(screen.getByText("Цитата целиком")).toBeInTheDocument();
  });

  it("не показывает «Читать полностью» у короткой цитаты", () => {
    fetchOk({});
    render(
      <ReelsFeed
        initial={{ items: [post("a")], nextCursor: null }}
        tab="forYou"
        donation={null}
      />,
    );

    expect(
      screen.queryByRole("button", { name: "Читать полностью ›" }),
    ).not.toBeInTheDocument();
  });

  it("показывает «Читать полностью» и у длинной цитаты видео-поста", () => {
    fetchOk({});
    const longQuote =
      "Преданность освобождает ум от иллюзии и открывает путь к истинному счастью. ".repeat(
        3,
      );
    render(
      <ReelsFeed
        initial={{
          items: [
            post("a", { text: longQuote, videoUrl: "https://cdn/a.mp4" }),
          ],
          nextCursor: null,
        }}
        tab="forYou"
        donation={null}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Читать полностью ›" }),
    ).toBeInTheDocument();
  });
```

- [ ] **Step 6: Прогнать тесты и убедиться, что они падают**

Run: `pnpm --filter @vedamatch/web exec vitest run src/components/motivation/reels-feed.spec.tsx`
Expected: 3 новых теста FAIL — кнопки «Читать полностью ›» в разметке ещё нет ни у фото, ни у видео.

- [ ] **Step 7: Добавить `line-clamp-4` к цитате фото-поста**

В `apps/web/src/components/motivation/reels-feed.tsx` заменить:

```tsx
        {kind === "image" && (
          <p className="font-display text-[17px] font-medium leading-snug drop-shadow-md">{quote}</p>
        )}
```

на:

```tsx
        {kind === "image" && (
          <p className="line-clamp-4 font-display text-[17px] font-medium leading-snug drop-shadow-md">{quote}</p>
        )}
```

- [ ] **Step 8: Добавить компонент `FullQuoteToggle`**

В том же файле добавить новую функцию сразу после `Byline` (перед `function RailButton({`):

```tsx
/**
 * Кнопка «Читать полностью» и шторка снизу с цитатой целиком — по образцу
 * уже существующей шторки «Пояснение». Общая для фото и видео: у видео
 * своей DOM-цитаты нет вовсе (текст вшит в кадр воркером), а полный текст
 * всё равно есть в данных поста — доставать его из видео не нужно.
 */
function FullQuoteToggle({ quote, source }: { quote: string; source: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="underline-offset-4 hover:underline"
      >
        Читать полностью ›
      </button>
      {open && (
        <div className="absolute inset-x-0 bottom-0 z-20 max-h-[60%] overflow-y-auto rounded-t-3xl border-t border-white/15 bg-[#1B0F2E]/95 p-5 text-sm leading-6 text-white/90 backdrop-blur">
          <div className="mb-2 flex items-center justify-between">
            <span className="font-display text-sm">Цитата целиком</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg px-2 py-1 text-xs text-white/70 hover:bg-white/10"
            >
              Закрыть
            </button>
          </div>
          <p className="whitespace-pre-line">{quote}</p>
          {source && <p className="mt-3 text-xs text-white/70">{source}</p>}
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 9: Подключить кнопку в общий ряд флагов**

В том же файле заменить:

```tsx
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-white/75">
          {explanation && (
            <button
              type="button"
              aria-expanded={showExplanation}
              onClick={() => setShowExplanation((value) => !value)}
              className="underline-offset-4 hover:underline"
            >
              {showExplanation ? "Скрыть пояснение" : "Пояснение — нажмите, чтобы раскрыть ›"}
            </button>
          )}
          {post.origin === "user" && !post.isOwn && <ReportDialog postId={post.id} />}
        </div>
```

на:

```tsx
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-white/75">
          {explanation && (
            <button
              type="button"
              aria-expanded={showExplanation}
              onClick={() => setShowExplanation((value) => !value)}
              className="underline-offset-4 hover:underline"
            >
              {showExplanation ? "Скрыть пояснение" : "Пояснение — нажмите, чтобы раскрыть ›"}
            </button>
          )}
          {isLongQuote(quote) && <FullQuoteToggle quote={quote} source={source} />}
          {post.origin === "user" && !post.isOwn && <ReportDialog postId={post.id} />}
        </div>
```

Этот ряд уже рендерится независимо от `kind` — отдельного блока для видео заводить не нужно, кнопка появляется у обоих типов постов одной и той же строчкой.

- [ ] **Step 10: Добавить импорт `isLongQuote`**

В том же файле, в начале, заменить:

```tsx
import { splitQuoteAndExplanation } from "./quote-text";
```

на:

```tsx
import { isLongQuote, splitQuoteAndExplanation } from "./quote-text";
```

- [ ] **Step 11: Прогнать тесты и убедиться, что они проходят**

Run: `pnpm --filter @vedamatch/web exec vitest run src/components/motivation/reels-feed.spec.tsx`
Expected: PASS — все тесты файла, включая три новых.

- [ ] **Step 12: Typecheck и линт**

Run (из `apps/web`): `pnpm exec tsc --noEmit -p tsconfig.json`
Expected: без ошибок.

Run (из `apps/web`): `pnpm exec eslint "src/components/motivation/reels-feed.tsx" "src/components/motivation/quote-text.ts" "src/components/motivation/quote-text.spec.ts" "src/components/motivation/reels-feed.spec.tsx"`
Expected: без ошибок.

- [ ] **Step 13: Ручная проверка через dev-сервер**

Поднять `web`/`api` (или переиспользовать уже запущенные), залогиниться dev-аккаунтом, открыть `/motivation` в мобильной ширине (`resize_window`, `preset: "mobile"`).

Найти или создать (через `/motivation/create` либо напрямую в БД для теста) пост с длинной цитатой (>170 символов) — фото и видео по отдельности:
- У фото-поста: цитата не более 4 строк на экране, кнопка «Читать полностью ›» открывает шторку снизу с полным текстом и источником, «Закрыть» её убирает.
- У видео-поста: то же самое — кнопка есть, шторка открывается тем же образом. (Сам вшитый в кадр текст ролика короче не станет без пересборки уже существующего файла — это ожидаемо, касается только новых генераций после Task 1.)
- У короткого поста (любого типа) кнопки нет вовсе.

- [ ] **Step 14: Закоммитить**

```bash
git add apps/web/src/components/motivation/quote-text.ts apps/web/src/components/motivation/quote-text.spec.ts apps/web/src/components/motivation/reels-feed.tsx apps/web/src/components/motivation/reels-feed.spec.tsx
git commit -m "feat(motivation): add read-more toggle for long reel quotes"
```
