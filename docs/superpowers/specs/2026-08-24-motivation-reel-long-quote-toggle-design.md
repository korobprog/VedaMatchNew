# Мотивация: сворачиваемая длинная цитата в рилсах

## Проблема

Лента «Вдохновение» (публичное название сервиса; в коде и путях остаётся
`motivation` — `/motivation`, `ReelsFeed`) показывает один пост на экран.
У фото-постов (`kind: "image"`) цитата —
обычный React-текст без ограничения по высоте: длинная цитата растягивается
на весь экран, вытесняя фото и служебную строку под ним.

У видео-постов (`kind: "video"`) ещё хуже: цитата и атрибуция вообще не
элементы интерфейса, а пиксели, вшитые в сам видеофайл воркером
(`apps/api/src/modules/motivation/story-image.ts` → SVG-оверлей,
накладывается через `apps/api/src/modules/motivation/story-video.ts` и
ffmpeg). Сейчас туда влезает до 12 строк (`MAX_QUOTE_LINES`), и то, что не
влезло, `clampLines()` обрезает с многоточием — безвозвратно, прочитать
остаток негде, потому что после генерации ролика оригинальный текст с
кадром никак не связан.

## Область действия

`apps/api/src/modules/motivation/story-image.ts`,
`apps/api/src/modules/motivation/story-video.ts`,
`apps/api/src/modules/motivation/motivation-video-worker.service.ts`,
`apps/web/src/components/motivation/reels-feed.tsx`,
`apps/web/src/components/motivation/quote-text.ts` (+ новый
`quote-text.spec.ts`).

Открытки/сторис для шеринга (`motivation-postcards.service.ts`,
`motivation-story-rebuild.service.ts`, `motivation-worker.service.ts`) —
не трогаются, у них нет кнопки «Развернуть» и не будет: это отдельная
статичная картинка для шаринга наружу, не элемент ленты.

## Решение

### 1. Настраиваемый лимit строк оверлея (бэкенд)

`StoryOverlayInput` (`story-image.ts`) получает необязательное поле:

```typescript
export type StoryOverlayInput = {
  text: string;
  attribution?: string | null;
  greeting?: string | null;
  /** Сколько строк цитаты вместить в кадр. По умолчанию — MAX_QUOTE_LINES. */
  maxQuoteLines?: number;
};
```

`buildStoryOverlaySvg()` и `renderStoryOverlay()` — в обоих местах, где
сейчас жёстко стоит `MAX_QUOTE_LINES`, использовать
`input.maxQuoteLines ?? MAX_QUOTE_LINES`. Оба места обязаны читать поле
одинаково — иначе высота текста разъедется с местом, посчитанным под знак
(см. существующий комментарий над `renderStoryOverlay` про «один на
картинку и на ролик»).

### 2. Меньший лимит специально для роликов

`story-video.ts` — новая экспортируемая константа рядом с уже существующими
`TEXT_APPEAR_DELAY_SECONDS`/`TEXT_FADE_IN_SECONDS`:

```typescript
/** Строк цитаты в кадре ролика — меньше, чем у открытки: кадр не должен
 *  становиться стеной текста, есть кнопка «Развернуть» в самой ленте. */
export const REEL_MAX_QUOTE_LINES = 4;
```

`motivation-video-worker.service.ts`, вызов `composeStoryVideo(video, {
text, attribution }, ...)` — добавить `maxQuoteLines: REEL_MAX_QUOTE_LINES`
в объект `{ text, attribution }`.

### 3. Эвристика «похоже, длинная» (фронтенд, тестируемая)

`quote-text.ts`:

```typescript
/** Примерная граница в символах — не точный расчёт переноса строк (шрифт и
 *  ширина экрана у ленты и у кадра ролика разные), а прикидка «похоже, не
 *  поместится в 4 строки», по той же логике, что estimateReadingSeconds на
 *  бэкенде: приблизительно, но достаточно, чтобы решить, показывать кнопку. */
const LONG_QUOTE_CHARS = 170;

export function isLongQuote(text: string): boolean {
  return text.trim().length > LONG_QUOTE_CHARS;
}
```

Один порог и одна функция — для фото и для видео одинаково, ничего не
дублируется.

### 4. UI: общий компонент-шторка

`reels-feed.tsx` — новый локальный компонент (по образцу уже существующей
шторки «Пояснение», тот же визуальный язык и та же механика):

```tsx
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
            <button type="button" onClick={() => setOpen(false)} className="rounded-lg px-2 py-1 text-xs text-white/70 hover:bg-white/10">
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

### 5. Подключение — фото

Цитата получает `line-clamp-4`:

```tsx
{kind === "image" && (
  <p className="line-clamp-4 font-display text-[17px] font-medium leading-snug drop-shadow-md">{quote}</p>
)}
```

В существующем ряду флагов (`<div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-white/75">`, сейчас там «Пояснение» и `ReportDialog`) — добавляется третий пункт:

```tsx
{isLongQuote(quote) && <FullQuoteToggle quote={quote} source={source} />}
```

### 6. Подключение — видео

Сейчас для `kind === "video"` нет вообще никакого блока с цитатой в DOM.
Добавляется тот же контейнер, что использует фото (`absolute bottom-[4.5rem]
left-4 right-4 z-10`), но только с переключателем:

```tsx
{kind === "video" && isLongQuote(quote) && (
  <div className="absolute bottom-[4.5rem] left-4 right-4 z-10 text-right text-xs text-white/75">
    <FullQuoteToggle quote={quote} source={source} />
  </div>
)}
```

Кнопка справа снизу, над рядом лайк/сохранить/поделиться, не пересекается
с зоной тапа паузы (`inset-x-0 bottom-20 top-16`).

## Не в объёме этой задачи

- Открытки/шаринг-картинки — лимит строк не меняется, кнопки «Развернуть»
  там не будет (статичная картинка вне ленты).
- Точный (не эвристический) расчёт переноса строк на фронтенде — не
  делается: разная ширина/шрифт у ленты и у кадра ролика делают точное
  совпадение бессмысленным, эвристики достаточно для решения «показывать
  кнопку или нет».
- Обратная сортировка/восстановление `Byline` (автор/рилс участника) для
  видео-постов — не в этой задаче, отдельная, не связанная тема.

## Тестирование

`apps/api/src/modules/motivation/story-image.spec.ts`:
- `buildStoryOverlaySvg({ text: 'длинная цитата...', maxQuoteLines: 4 })` —
  строк цитаты в результирующем SVG не больше 4 (например, подсчётом
  вхождений `<text class="quote"` или похожим способом, каким уже считаются
  строки в существующих тестах файла).
- без `maxQuoteLines` — поведение как раньше (12 строк, регрессионная
  защита).

`apps/api/src/modules/motivation/story-video.spec.ts`:
- overlay, переданный в `buildStoryVideoArgs`/`composeStoryVideo` из
  `motivation-video-worker.service.ts`, содержит `maxQuoteLines:
  REEL_MAX_QUOTE_LINES` (проверяется на уровне вызова, а не глубоко внутри
  ffmpeg-аргументов — сама подстановка `maxQuoteLines` в SVG уже покрыта
  тестами `story-image.spec.ts`).

`apps/web/src/components/motivation/quote-text.spec.ts` (новый файл):
- `isLongQuote()` — короткий текст (< 170 символов) → `false`; длинный
  (> 170) → `true`; граница ровно в 170 символов — не длинная (`<=`, не
  `<`, проверить явно).

`apps/web/src/components/motivation/reels-feed.spec.tsx`:
- фото-пост с длинной цитатой — кнопка «Читать полностью ›» видна; клик
  открывает панель с полным текстом цитаты.
- фото-пост с короткой цитатой — кнопки нет вовсе.
- видео-пост с длинной цитатой — кнопка видна (сейчас там нет вообще
  никакого текстового блока — тест на её появление новый, не
  регрессионный).
- видео-пост с короткой цитатой — кнопки нет.

Ручная проверка через dev-сервер: длинный демо-пост в мобильной ширине —
и у фото, и у видео цитата не более 4 строк на экране, кнопка открывает
шторку снизу с полным текстом, закрывается по «Закрыть».
