# Знакомства: управление колодой и выходы из пустой выдачи — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Привести нижнюю панель колоды к согласованному порядку, дать листание анкет без принятия решения и убрать конфликт стрелок карусели фото со стрелками листания анкет; закрыть дыру «показать вообще всех» на пустой выдаче.

**Architecture:** Всё изменение — фронтенд, без миграций БД и без новых эндпоинтов. Решения свайпа не трогаем (вправо лайк, влево пропуск, вверх суперлайк). Листание анкет двигает только указатель `index` в `SwipeDeck` и ничего не отправляет на сервер. Конфликт двух пар `‹ ›` на одной карточке разводится по механике: в варианте `cover` фото листается тапом по половинам снимка (стрелки карусели убираются), а освободившиеся боковые позиции занимают полупрозрачные стрелки листания анкет. Вариант `thumb` (превью в списке) не меняется — там стрелки остаются.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind v4, framer-motion, vitest + @testing-library/react.

## Global Constraints

- Только токены дизайн-системы для цвета: `--vm-*` через утилиты Tailwind (`text-text-0`, `bg-bg-1`, `text-magenta`…). Хардкод `#RRGGBB` запрещён, кроме уже существующих в файле градиентов.
- Поверх фотографии допустимы `text-white` / `bg-black/NN` — это подложка кадра, а не тема (так уже сделано в `swipe-deck.tsx`).
- Фокус не отключать: глобальный `*:focus-visible` в `globals.css` даёт обводку, локальный `outline: none` без замены — регресс.
- Все подписи и `aria-label` — по-русски.
- Комментарии в коде — по-русски, объясняют «почему», а не «что».
- Тесты лежат рядом с кодом, имя `*.spec.ts(x)`.
- Команда одиночного теста: `pnpm --filter @vedamatch/web exec vitest run <путь>`
- Проверка типов: `cd apps/web && pnpm exec tsc --noEmit -p tsconfig.json`
- Линт: `cd apps/web && pnpm exec eslint <пути>`
- Коммитить после каждой задачи. `git push` не делать.

---

### Task 1: Порядок вкладок — Чаты перед Подборками

Согласовано: в нижней навигации Union «Подборки» и «Чаты» меняются местами.

**Files:**
- Modify: `apps/web/src/components/union/union-tabbar.tsx:8-14`
- Test: `apps/web/src/components/union/union-tabbar.spec.tsx`

**Interfaces:**
- Consumes: ничего.
- Produces: ничего (внутренний порядок массива `tabs`).

- [ ] **Step 1: Написать падающий тест на порядок**

Добавить в `apps/web/src/components/union/union-tabbar.spec.tsx` внутрь `describe("UnionTabBar", ...)`:

```tsx
  // Порядок закреплён тестом намеренно: он согласован с продуктом, и его
  // легко потерять при любой правке массива вкладок.
  it("keeps the agreed tab order with chats before collections", () => {
    render(<UnionTabBar />);

    const labels = screen
      .getAllByRole("link")
      .map((link) => link.textContent?.trim().replace(/\d+$/, "") ?? "");

    expect(labels).toEqual(["Анкеты", "Чаты", "Лайки", "Подборки", "Профиль"]);
  });
```

- [ ] **Step 2: Запустить и убедиться, что тест падает**

Run: `pnpm --filter @vedamatch/web exec vitest run src/components/union/union-tabbar.spec.tsx`
Expected: FAIL — `expected [ 'Анкеты', 'Подборки', 'Лайки', 'Чаты', 'Профиль' ] to deeply equal [ 'Анкеты', 'Чаты', 'Лайки', 'Подборки', 'Профиль' ]`

- [ ] **Step 3: Поменять вкладки местами**

В `apps/web/src/components/union/union-tabbar.tsx` заменить массив `tabs` (строки 8-14) на:

```tsx
const tabs: { key: TabKey; href: string; label: string }[] = [
  { key: "profiles", href: "/union/recommendations", label: "Анкеты" },
  { key: "chats", href: "/chat", label: "Чаты" },
  { key: "likes", href: "/union/likes", label: "Лайки" },
  { key: "collections", href: "/union/collections", label: "Подборки" },
  { key: "account", href: "/union/profile", label: "Профиль" },
];
```

- [ ] **Step 4: Запустить тесты — должны пройти**

Run: `pnpm --filter @vedamatch/web exec vitest run src/components/union/union-tabbar.spec.tsx`
Expected: PASS, 4 теста

- [ ] **Step 5: Коммит**

```bash
git add apps/web/src/components/union/union-tabbar.tsx apps/web/src/components/union/union-tabbar.spec.tsx
git commit -m "feat(union): чаты перед подборками в нижней навигации"
```

---

### Task 2: Кнопка «Показать вообще всех» на пустой выдаче

Дыра в текущем пустом экране: когда заданы фильтры **и** история прячет людей, «Сбросить фильтры» историю не снимает — человек снова упирается в пустоту. Нужен один клик до «вообще всех».

**Files:**
- Modify: `apps/web/src/components/union/recommendation-empty-state.ts`
- Modify: `apps/web/src/components/union/recommendations-empty.tsx`
- Test: `apps/web/src/components/union/recommendation-empty-state.spec.ts`

**Interfaces:**
- Consumes: `emptyStateActions({ narrowingFilterCount, includeSwiped, viewedMatchCount })`, `EmptyStateActions`, `AGE_STORAGE_KEY` — всё уже есть в `recommendation-empty-state.ts`.
- Produces: `EVERYTHING_URL: string` — константа `"/union/recommendations?includeSwiped=true"`.

Отдельного флага `canShowEverything` нет намеренно: он был бы точной копией
`canResetFilters` — обе кнопки осмысленны ровно тогда, когда задано хотя бы
одно сужающее условие. Дублировать предикат под вторым именем значит завести
две правды, которые однажды разойдутся.

- [ ] **Step 1: Написать падающий тест**

Добавить в `apps/web/src/components/union/recommendation-empty-state.spec.ts` импорт `EVERYTHING_URL`:

```ts
import {
  countActiveFilters,
  countNarrowingFilters,
  emptyStateActions,
  EVERYTHING_URL,
  withIncludeSwiped,
} from "./recommendation-empty-state";
```

и новый блок в конце файла:

```ts
describe("EVERYTHING_URL", () => {
  // Сброс фильтров историю показов не снимает, а «показать отсмотренных»
  // сохраняет фильтры. Когда пусто из-за обоих сразу, ни та ни другая
  // кнопка до людей не доводит — нужен адрес, снимающий и то и другое.
  it("drops every filter and turns viewed profiles on", () => {
    const url = new URL(EVERYTHING_URL, "https://example.test");

    expect(url.pathname).toBe("/union/recommendations");
    expect(url.searchParams.get("includeSwiped")).toBe("true");
    expect([...url.searchParams.keys()]).toEqual(["includeSwiped"]);
  });
});
```

- [ ] **Step 2: Запустить и убедиться, что тест падает**

Run: `pnpm --filter @vedamatch/web exec vitest run src/components/union/recommendation-empty-state.spec.ts`
Expected: FAIL — `EVERYTHING_URL` не экспортируется из `./recommendation-empty-state`

- [ ] **Step 3: Добавить константу**

В `apps/web/src/components/union/recommendation-empty-state.ts` добавить после `AGE_STORAGE_KEY`:

```ts
/**
 * Аварийный выход с пустой выдачи: ни одного условия и вместе с уже
 * отсмотренными. Это единственный адрес, после которого список гарантированно
 * не пуст, если на портале вообще есть анкеты.
 */
export const EVERYTHING_URL = "/union/recommendations?includeSwiped=true";
```

- [ ] **Step 4: Запустить тесты — должны пройти**

Run: `pnpm --filter @vedamatch/web exec vitest run src/components/union/recommendation-empty-state.spec.ts`
Expected: PASS, 15 тестов

- [ ] **Step 5: Показать кнопку на экране**

В `apps/web/src/components/union/recommendations-empty.tsx` заменить импорт:

```tsx
import {
  AGE_STORAGE_KEY,
  emptyStateActions,
  EVERYTHING_URL,
  withIncludeSwiped,
} from "./recommendation-empty-state";
```

и добавить третьим элементом внутрь блока с кнопками, сразу после ссылки «Сбросить фильтры» (перед закрывающим `</div>` этого блока). Условие то же самое, `canResetFilters`: сбрасывать и «показывать вообще всех» осмысленно ровно тогда, когда условие задано.

```tsx
          {canResetFilters && (
            <a
              href={EVERYTHING_URL}
              onClick={() => {
                // Тот же капкан, что у «Сбросить фильтры»: сохранённый возраст
                // молча вернулся бы и снова сузил выдачу.
                try {
                  window.localStorage.removeItem(AGE_STORAGE_KEY);
                } catch {
                  // localStorage недоступен (приватный режим) — не критично.
                }
              }}
              className="text-sm font-medium text-text-2 underline-offset-4 transition hover:text-text-0 hover:underline"
            >
              Показать вообще всех
            </a>
          )}
```

Условие показа блока с кнопками менять не нужно: новая ссылка появляется при том же `canResetFilters`, который уже входит в это условие.

- [ ] **Step 6: Проверить типы и линт**

Run: `cd apps/web && pnpm exec tsc --noEmit -p tsconfig.json && pnpm exec eslint src/components/union/recommendation-empty-state.ts src/components/union/recommendations-empty.tsx src/components/union/recommendation-empty-state.spec.ts`
Expected: обе команды без вывода

- [ ] **Step 7: Коммит**

```bash
git add apps/web/src/components/union/recommendation-empty-state.ts apps/web/src/components/union/recommendation-empty-state.spec.ts apps/web/src/components/union/recommendations-empty.tsx
git commit -m "feat(union): выход «показать вообще всех» с пустой выдачи"
```

---

### Task 3: Порядок кнопок в колоде — крестик первым

Согласованный порядок слева направо: `✕` · `↺` · `⭕` · `🔥` · `❤️`. Сейчас первые две стоят наоборот. Размеры привязаны к смыслу, а не к позиции: `✕` остаётся `h-12 w-12` (решение), `↺` — `h-11 w-11` (вспомогательное).

**Files:**
- Modify: `apps/web/src/components/union/swipe-deck.tsx:273-293`
- Test: `apps/web/src/components/union/swipe-deck.spec.tsx`

**Interfaces:**
- Consumes: ничего нового.
- Produces: ничего (порядок узлов в DOM).

- [ ] **Step 1: Написать падающий тест**

Добавить в `apps/web/src/components/union/swipe-deck.spec.tsx` внутрь основного `describe`:

```tsx
  // Порядок согласован с продуктом: крестик и лайк по краям под большие
  // пальцы, между ними — вспомогательные действия. `getAllByRole` отдаёт
  // узлы в порядке DOM, поэтому фильтр по known-подписям и есть проверка
  // порядка: кольцо совместимости и стрелки листания в список не попадают.
  it("keeps the agreed action order in the decision row", () => {
    render(<SwipeDeck items={[recommendation()]} />);

    const order = [
      "Пропустить",
      "Вернуть предыдущую анкету",
      "Суперлайк",
      "Познакомиться",
    ];
    const rendered = screen
      .getAllByRole("button")
      .map((button) => button.getAttribute("aria-label"))
      .filter((label): label is string => order.includes(label ?? ""));

    expect(rendered).toEqual(order);
  });
```

- [ ] **Step 2: Запустить и убедиться, что тест падает**

Run: `pnpm --filter @vedamatch/web exec vitest run src/components/union/swipe-deck.spec.tsx`
Expected: FAIL — первым в списке идёт `"Вернуть предыдущую анкету"`, а ожидается `"Пропустить"`

- [ ] **Step 3: Поменять кнопки местами**

В `apps/web/src/components/union/swipe-deck.tsx` заменить два первых узла внутри `<div className="absolute inset-x-3 bottom-3 z-10 flex items-center justify-between gap-2">` — кнопку отката и кнопку пропуска — на тот же код в обратном порядке:

```tsx
          <button
            type="button"
            onClick={() => {
              void swipe(current.user.id, "pass");
              advance("left");
            }}
            aria-label="Пропустить"
            className={`${actionButtonClass} h-12 w-12 text-xl text-white`}
          >
            ✕
          </button>
          <button
            type="button"
            onClick={() => void undo()}
            disabled={!canUndo || index === 0 || undoing}
            aria-label="Вернуть предыдущую анкету"
            className={`${actionButtonClass} h-11 w-11 text-lg text-white disabled:opacity-35`}
          >
            ↺
          </button>
```

- [ ] **Step 4: Запустить тесты — должны пройти**

Run: `pnpm --filter @vedamatch/web exec vitest run src/components/union/swipe-deck.spec.tsx`
Expected: PASS

- [ ] **Step 5: Коммит**

```bash
git add apps/web/src/components/union/swipe-deck.tsx apps/web/src/components/union/swipe-deck.spec.tsx
git commit -m "feat(union): крестик перед откатом в ряду решений"
```

---

### Task 4: Листание анкет без решения

Полупрозрачные `‹ ›` по вертикальным краям карточки. Двигают только указатель — на сервер ничего не уходит, решение не записывается. На границах колоды кнопка невидима (`disabled:opacity-0`), а не мигает серым.

**Files:**
- Modify: `apps/web/src/components/union/swipe-deck.tsx` — добавить функцию `browse` рядом с `advance` и два узла в блок карточки
- Test: `apps/web/src/components/union/swipe-deck.spec.tsx`

**Interfaces:**
- Consumes: состояние `index`, `items`, сеттеры `setIndex`, `setSent`, `setBreakdownOpen`, `setExitDirection` — всё уже есть внутри `SwipeDeck`.
- Produces: кнопки с `aria-label="Предыдущая анкета"` и `aria-label="Следующая анкета"`.

- [ ] **Step 1: Написать падающий тест**

Добавить в `apps/web/src/components/union/swipe-deck.spec.tsx`:

```tsx
  // Листание — это просмотр, а не решение: на сервер ничего уходить не должно,
  // иначе стрелка молча тратила бы анкеты так же, как крестик.
  it("browses to the next profile without recording a decision", async () => {
    const user = userEvent.setup();
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("{}"));
    render(
      <SwipeDeck
        items={[
          recommendation(),
          recommendation({ user: { id: "user-2", name: "Сита" } }),
        ]}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Следующая анкета" }));

    expect(screen.getByText("2 из 2")).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("disables browsing at both ends of the deck", () => {
    render(<SwipeDeck items={[recommendation()]} />);

    expect(
      screen.getByRole("button", { name: "Предыдущая анкета" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Следующая анкета" }),
    ).toBeDisabled();
  });
```

> Импорты `render`, `screen`, `userEvent`, `vi` и фабрика `recommendation()` в файле уже есть — см. его начало.

- [ ] **Step 2: Запустить и убедиться, что тест падает**

Run: `pnpm --filter @vedamatch/web exec vitest run src/components/union/swipe-deck.spec.tsx`
Expected: FAIL — `Unable to find an accessible element with the role "button" and name "Следующая анкета"`

- [ ] **Step 3: Добавить функцию листания**

В `apps/web/src/components/union/swipe-deck.tsx` сразу после функции `advance` добавить:

```tsx
  /**
   * Листание без решения: двигаем только указатель. На сервер ничего не
   * уходит — анкета не считается отсмотренной, и человек может пройтись по
   * колоде туда-сюда, ничего не потратив. Откат (↺) этим не заменяется: он
   * снимает уже записанное решение, а это просто просмотр.
   */
  function browse(delta: 1 | -1) {
    const target = index + delta;
    if (target < 0 || target >= items.length) return;
    setSent(null);
    setBreakdownOpen(false);
    setExitDirection(delta === 1 ? "left" : "right");
    setIndex(target);
  }
```

- [ ] **Step 4: Добавить стрелки на карточку**

В `apps/web/src/components/union/swipe-deck.tsx` вставить перед строкой `<UnionBoostButton />`:

```tsx
        {/*
          Листание анкет живёт у самых краёв и намеренно почти прозрачно:
          это вспомогательный путь, основной — свайп. Боковые позиции
          освободила карусель фото, которая в варианте `cover` листается
          тапом по половинам снимка.
        */}
        <button
          type="button"
          onClick={() => browse(-1)}
          disabled={index === 0}
          aria-label="Предыдущая анкета"
          className="absolute left-1 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/25 text-xl text-white/60 backdrop-blur-sm transition hover:bg-black/50 hover:text-white disabled:opacity-0"
        >
          <span aria-hidden="true">‹</span>
        </button>
        <button
          type="button"
          onClick={() => browse(1)}
          disabled={index >= items.length - 1}
          aria-label="Следующая анкета"
          className="absolute right-1 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/25 text-xl text-white/60 backdrop-blur-sm transition hover:bg-black/50 hover:text-white disabled:opacity-0"
        >
          <span aria-hidden="true">›</span>
        </button>
```

- [ ] **Step 5: Запустить тесты — должны пройти**

Run: `pnpm --filter @vedamatch/web exec vitest run src/components/union/swipe-deck.spec.tsx`
Expected: PASS

- [ ] **Step 6: Проверить типы и линт**

Run: `cd apps/web && pnpm exec tsc --noEmit -p tsconfig.json && pnpm exec eslint src/components/union/swipe-deck.tsx src/components/union/swipe-deck.spec.tsx`
Expected: обе команды без вывода

- [ ] **Step 7: Коммит**

```bash
git add apps/web/src/components/union/swipe-deck.tsx apps/web/src/components/union/swipe-deck.spec.tsx
git commit -m "feat(union): листание анкет стрелками без записи решения"
```

---

### Task 5: Фото листается тапом по половинам

Убирает конфликт: в варианте `cover` две пары `‹ ›` на одной карточке означали бы разное. Стрелки карусели остаются только в `thumb` (превью в списке), а на полной карточке фото переключается тапом по левой/правой половине — как в сторис.

Порог `TAP_SLOP` обязателен: слой лежит поверх перетаскиваемой карточки, и без него свайп решения засчитывался бы ещё и как тап по фото. Слой — `div`, а не `button`: `onPointerDownCapture` в `SwipeCard` глушит перетаскивание для `button, a`, и кнопка во всю площадь фото сломала бы свайп. Доступность обеспечивают точки-индикаторы сверху — они остаются и позволяют выбрать любое фото с клавиатуры, поэтому слой помечен `aria-hidden`.

**Files:**
- Create: `apps/web/src/components/union/photo-tap.ts`
- Create: `apps/web/src/components/union/photo-tap.spec.ts`
- Modify: `apps/web/src/components/union/recommendation-photo-carousel.tsx`

**Interfaces:**
- Consumes: ничего.
- Produces:
  - `TAP_SLOP: number` — 10.
  - `isTap(start: { x: number; y: number }, end: { x: number; y: number }): boolean`
  - `tappedPhotoIndex(input: { currentIndex: number; total: number; tapX: number; boundsLeft: number; boundsWidth: number }): number`

- [ ] **Step 1: Написать падающий тест чистой логики**

Создать `apps/web/src/components/union/photo-tap.spec.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isTap, tappedPhotoIndex, TAP_SLOP } from "./photo-tap";

describe("isTap", () => {
  it("treats a still finger as a tap", () => {
    expect(isTap({ x: 100, y: 100 }, { x: 100, y: 100 })).toBe(true);
  });

  it("allows jitter up to the slop", () => {
    expect(isTap({ x: 100, y: 100 }, { x: 100 + TAP_SLOP, y: 100 })).toBe(true);
  });

  // Риск: слой лежит поверх перетаскиваемой карточки. Без порога свайп
  // решения засчитался бы ещё и как переключение фото.
  it("rejects a horizontal swipe", () => {
    expect(isTap({ x: 100, y: 100 }, { x: 240, y: 100 })).toBe(false);
  });

  it("rejects a vertical swipe", () => {
    expect(isTap({ x: 100, y: 100 }, { x: 100, y: 20 })).toBe(false);
  });
});

describe("tappedPhotoIndex", () => {
  const bounds = { boundsLeft: 0, boundsWidth: 300 };

  it("moves forward on the right half", () => {
    expect(
      tappedPhotoIndex({ currentIndex: 0, total: 3, tapX: 250, ...bounds }),
    ).toBe(1);
  });

  it("moves back on the left half", () => {
    expect(
      tappedPhotoIndex({ currentIndex: 1, total: 3, tapX: 50, ...bounds }),
    ).toBe(0);
  });

  it("wraps around at both ends", () => {
    expect(
      tappedPhotoIndex({ currentIndex: 2, total: 3, tapX: 250, ...bounds }),
    ).toBe(0);
    expect(
      tappedPhotoIndex({ currentIndex: 0, total: 3, tapX: 50, ...bounds }),
    ).toBe(2);
  });

  // Карточка не прижата к левому краю окна: без вычета boundsLeft тап по
  // левой половине на смещённой карточке считался бы правым.
  it("measures halves relative to the element, not the window", () => {
    expect(
      tappedPhotoIndex({
        currentIndex: 0,
        total: 3,
        tapX: 460,
        boundsLeft: 400,
        boundsWidth: 300,
      }),
    ).toBe(2);
  });
});
```

- [ ] **Step 2: Запустить и убедиться, что тест падает**

Run: `pnpm --filter @vedamatch/web exec vitest run src/components/union/photo-tap.spec.ts`
Expected: FAIL — `Failed to load .../photo-tap.ts`

- [ ] **Step 3: Написать модуль**

Создать `apps/web/src/components/union/photo-tap.ts`:

```ts
/**
 * Тап по половинам фотографии. Вынесено отдельно от карусели: слой тапа
 * лежит поверх перетаскиваемой карточки, и вся тонкость — в отличии тапа от
 * свайпа. В jsdom `getBoundingClientRect` возвращает нули, поэтому арифметика
 * живёт здесь и проверяется без DOM.
 */

/** Допустимое дрожание пальца, px. Больше — это уже свайп карточки. */
export const TAP_SLOP = 10;

export function isTap(
  start: { x: number; y: number },
  end: { x: number; y: number },
): boolean {
  return (
    Math.abs(end.x - start.x) <= TAP_SLOP && Math.abs(end.y - start.y) <= TAP_SLOP
  );
}

/** Правая половина — следующее фото, левая — предыдущее, по кругу. */
export function tappedPhotoIndex({
  currentIndex,
  total,
  tapX,
  boundsLeft,
  boundsWidth,
}: {
  currentIndex: number;
  total: number;
  tapX: number;
  boundsLeft: number;
  boundsWidth: number;
}): number {
  const forward = tapX - boundsLeft > boundsWidth / 2;
  return forward
    ? (currentIndex + 1) % total
    : (currentIndex - 1 + total) % total;
}
```

- [ ] **Step 4: Запустить тесты — должны пройти**

Run: `pnpm --filter @vedamatch/web exec vitest run src/components/union/photo-tap.spec.ts`
Expected: PASS, 9 тестов

- [ ] **Step 5: Коммит модуля**

```bash
git add apps/web/src/components/union/photo-tap.ts apps/web/src/components/union/photo-tap.spec.ts
git commit -m "feat(union): арифметика тапа по половинам фото"
```

- [ ] **Step 6: Подключить слой в карусель**

В `apps/web/src/components/union/recommendation-photo-carousel.tsx` заменить импорты (строки 3-4) на:

```tsx
import type { UnionPhoto } from "@vedamatch/shared";
import { useRef, useState } from "react";
import { isTap, tappedPhotoIndex } from "./photo-tap";
```

Сразу после строки `const [navigation, setNavigation] = useState({ identity, index: 0 });` добавить:

```tsx
  const pointerStart = useRef<{ x: number; y: number } | null>(null);
```

Обе стрелки (весь блок от `<button ... aria-label="Предыдущее фото"` до закрывающего `</button>` кнопки «Следующее фото», строки 56-78) обернуть в проверку варианта и добавить рядом слой тапа. Заменить этот блок на:

```tsx
          {/* В превью рядом с текстом тапать по половинам нечего — снимок
              112px шириной, поэтому там остаются стрелки. */}
          {!isCover && (
            <>
              <button
                type="button"
                aria-label="Предыдущее фото"
                onClick={() =>
                  setNavigation({
                    identity,
                    index: (safeIndex - 1 + photos.length) % photos.length,
                  })
                }
                className="absolute left-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-xl text-white shadow-sm transition hover:bg-black/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-magenta"
              >
                <span aria-hidden="true">‹</span>
              </button>
              <button
                type="button"
                aria-label="Следующее фото"
                onClick={() =>
                  setNavigation({ identity, index: (safeIndex + 1) % photos.length })
                }
                className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-xl text-white shadow-sm transition hover:bg-black/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-magenta"
              >
                <span aria-hidden="true">›</span>
              </button>
            </>
          )}

          {/*
            На полной карточке боковые позиции отданы листанию анкет, поэтому
            фото переключается тапом по половинам. Это `div`, а не кнопка:
            `onPointerDownCapture` в SwipeCard глушит перетаскивание для
            `button, a`, и кнопка во всю площадь фото сломала бы свайп.
            Клавиатурный доступ дают точки-индикаторы сверху — здесь
            `aria-hidden`, чтобы не дублировать их в дереве доступности.
          */}
          {isCover && (
            <div
              aria-hidden="true"
              className="absolute inset-0"
              onPointerDown={(event) => {
                pointerStart.current = { x: event.clientX, y: event.clientY };
              }}
              onPointerUp={(event) => {
                const start = pointerStart.current;
                pointerStart.current = null;
                if (!start) return;
                if (!isTap(start, { x: event.clientX, y: event.clientY })) return;
                const bounds = event.currentTarget.getBoundingClientRect();
                setNavigation({
                  identity,
                  index: tappedPhotoIndex({
                    currentIndex: safeIndex,
                    total: photos.length,
                    tapX: event.clientX,
                    boundsLeft: bounds.left,
                    boundsWidth: bounds.width,
                  }),
                });
              }}
            />
          )}
```

- [ ] **Step 7: Прогнать соседние тесты — они не должны сломаться**

Существующие тесты карусели рендерят вариант по умолчанию (`thumb`), где стрелки остались, а `swipe-deck.spec.tsx` кликает по точкам-индикаторам, которые есть в обоих вариантах.

Run: `pnpm --filter @vedamatch/web exec vitest run src/components/union`
Expected: PASS, все файлы

- [ ] **Step 8: Проверить типы и линт**

Run: `cd apps/web && pnpm exec tsc --noEmit -p tsconfig.json && pnpm exec eslint src/components/union/recommendation-photo-carousel.tsx src/components/union/photo-tap.ts src/components/union/photo-tap.spec.ts`
Expected: обе команды без вывода

- [ ] **Step 9: Коммит**

```bash
git add apps/web/src/components/union/recommendation-photo-carousel.tsx
git commit -m "feat(union): фото на карточке листается тапом по половинам"
```

---

### Task 6: Проверка в браузере

Автотесты не ловят пересечение слоёв и то, что свайп по фото всё ещё работает поверх нового слоя тапа.

**Files:** нет (ручная проверка)

**Interfaces:**
- Consumes: результат задач 1-5.
- Produces: ничего.

- [ ] **Step 1: Поднять окружение**

Через preview-инструменты запустить сервер `api`, дождаться ответа, затем `web`. Не запускать `pnpm dev` фоном из Bash — он не переживает завершение хода.

- [ ] **Step 2: Пройти проверочный список**

Открыть `/union/recommendations`, войти демо-аккаунтом (пароль `vedamatch`), включить режим «Свайпами» и убедиться:

1. Порядок кнопок внизу: `✕ ↺ ⭕ 🔥 ❤️`.
2. Стрелка «‹» на первой анкете невидима; «›» листает вперёд, счётчик «N из M» растёт.
3. После листания стрелкой и перезагрузки страницы анкета осталась в колоде — решение не записалось.
4. Тап по правой половине фото переключает снимок, полоски-индикаторы сверху двигаются.
5. Перетаскивание карточки вправо/влево по-прежнему работает и **не** переключает фото.
6. В режиме «Списком» у превью анкеты стрелки фото остались на месте.
7. Нижние вкладки: `Анкеты · Чаты · Лайки · Подборки · Профиль`.
8. На `/union/recommendations?ageMin=119&ageMax=120` пустой экран показывает «Сбросить фильтры» и «Показать вообще всех»; вторая ведёт на непустой список.

- [ ] **Step 3: Коммит, если правки понадобились**

```bash
git add -A apps/web/src
git commit -m "fix(union): правки после проверки колоды в браузере"
```
