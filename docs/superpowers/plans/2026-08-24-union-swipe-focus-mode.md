# Union: фокус-режим свайпов на мобильном — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** На мобильной ширине свайп-режим ленты «Знакомства» (`/union/recommendations`) открывается в полноэкранном оверлее без обвязки страницы (шапка портала, фильтры, счётчик, таб-бар), с единственной кнопкой выхода и поддержкой системного «назад».

**Architecture:** Один компонент, `apps/web/src/components/union/recommendations-view.tsx`, получает новую ветку рендера: когда `isMobile && mode === "swipe"` (`focusMode`), вместо обычной разметки со списком/переключателем возвращается `fixed inset-0` контейнер с кнопкой «✕» и тем же `<SwipeDeck>` внутри — без изменений в `swipe-deck.tsx` или в общем layout портала.

**Tech Stack:** Next.js App Router клиентский компонент, React `useState`/`useEffect`/`useSyncExternalStore`, Tailwind, `window.history` API.

## Global Constraints

- Спека: `docs/superpowers/specs/2026-08-24-union-swipe-focus-mode-design.md` — реализация обязана ей соответствовать.
- Затрагивается только мобильный свайп-режим (`isMobile === true`). Десктоп не меняется.
- `swipe-deck.tsx`, `apps/web/src/app/(portal)/layout.tsx`, `union-top-bar.tsx`, `union-tabbar.tsx` не меняются вообще.
- Кнопка выхода: `aria-label="Выйти из фокус-режима"`, иконка «✕», стиль `rounded-xl glass border border-glass-brd text-text-1 transition hover:text-text-0`, размер `h-10 w-10`.
- Переключатель «Списком/Свайпами» и сетка карточек не должны присутствовать в DOM, пока открыт фокус-режим (не просто скрыты стилем).
- Автотестов для `recommendations-view.tsx` в проекте нет — это существующий паттерн для UI-обвязки Union, ручная проверка через dev-сервер для обеих задач.

---

### Task 1: Полноэкранный оверлей и кнопка выхода

**Files:**
- Modify: `apps/web/src/components/union/recommendations-view.tsx:24-65`

**Interfaces:**
- Produces: локальная константа `focusMode: boolean` внутри `RecommendationsView` — читается в Task 2 в тех же условных эффектах.

- [ ] **Step 1: Добавить ветку `focusMode` с полноэкранной разметкой**

В `apps/web/src/components/union/recommendations-view.tsx`, заменить тело функции `RecommendationsView` (строки 28-65) целиком на:

```tsx
export function RecommendationsView({
  items,
}: {
  items: UnionRecommendation[];
}) {
  const isMobile = useSyncExternalStore(
    subscribeToMobileQuery,
    () => mobileQuery().matches,
    () => false,
  );
  const [modeOverride, setModeOverride] = useState<ViewMode | null>(null);
  const mode: ViewMode = modeOverride ?? (isMobile ? "swipe" : "grid");
  // На телефоне свайп — полноэкранный фокус-режим без обвязки страницы;
  // на десктопе тот же режим остаётся инлайн внутри обычной страницы.
  const focusMode = isMobile && mode === "swipe";

  if (focusMode) {
    return (
      <div
        className="fixed inset-0 z-50 flex flex-col bg-bg-0 px-4"
        style={{
          paddingTop: "calc(env(safe-area-inset-top) + 0.75rem)",
          paddingBottom: "calc(env(safe-area-inset-bottom) + 0.75rem)",
        }}
      >
        <button
          type="button"
          onClick={() => setModeOverride("grid")}
          aria-label="Выйти из фокус-режима"
          className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl glass border border-glass-brd text-text-1 transition hover:text-text-0"
        >
          <span aria-hidden="true">✕</span>
        </button>
        <div className="flex flex-1 items-center justify-center overflow-y-auto">
          <SwipeDeck items={items} />
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex gap-2">
        <ModeButton
          active={mode === "grid"}
          onClick={() => setModeOverride("grid")}
        >
          Списком
        </ModeButton>
        <ModeButton
          active={mode === "swipe"}
          onClick={() => setModeOverride("swipe")}
        >
          Свайпами
        </ModeButton>
      </div>

      {mode === "swipe" ? (
        <SwipeDeck items={items} />
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <RecommendationCard key={item.user.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
```

`ModeButton` ниже по файлу не меняется.

- [ ] **Step 2: Typecheck**

Run (из `apps/web`): `pnpm exec tsc --noEmit -p tsconfig.json`
Expected: без ошибок.

- [ ] **Step 3: Lint**

Run (из `apps/web`): `pnpm exec eslint "src/components/union/recommendations-view.tsx"`
Expected: без ошибок.

- [ ] **Step 4: Ручная проверка через dev-сервер (мобильная ширина)**

Поднять `web` (порт 3000) и `api` (порт 4000) через `preview_start` (`.claude/launch.json`), залогиниться dev-аккаунтом (`/login`, пароль `vedamatch`), переключить окно превью в мобильный пресет (`resize_window` c `preset: "mobile"`), открыть `/union/recommendations`.

Проверить:
- Сразу открывается полноэкранная колода: не видно шапки портала (лого/уведомления/аватар), заголовка раздела, панели фильтров, строки «Найдено: N», переключателя «Списком/Свайпами» и нижнего таб-бара.
- Кнопка «✕» в левом верхнем углу, с отступом от края экрана.
- Свайп/лайк/пропуск/буст/undo внутри карточки работают как раньше.
- Клик «✕» возвращает к обычной странице со списком анкет и всей обвязкой видимой.
- Развернуть окно превью в десктопный пресет (`resize_window` c `preset: "desktop"`), перезагрузить страницу — свайп-режим (кнопка «Свайпами») остаётся инлайн внутри обычной страницы, без полноэкранного оверлея.

- [ ] **Step 5: Закоммитить**

```bash
git add apps/web/src/components/union/recommendations-view.tsx
git commit -m "feat(union): full-screen focus mode for mobile swipe deck"
```

---

### Task 2: Системное «назад» и блокировка скролла фона

**Files:**
- Modify: `apps/web/src/components/union/recommendations-view.tsx:1-3` (импорт), внутри `RecommendationsView` (после Task 1 — рядом с объявлением `focusMode` и вызовом кнопки выхода)

**Interfaces:**
- Consumes: `focusMode: boolean` (из Task 1).
- Produces: функция `exitFocusMode()` — вызывается из `onClick` кнопки «✕» вместо прямого `setModeOverride("grid")`.

- [ ] **Step 1: Добавить `useEffect` в импорт**

В `apps/web/src/components/union/recommendations-view.tsx`, строка 3, заменить:

```tsx
import { useState, useSyncExternalStore } from "react";
```

на:

```tsx
import { useEffect, useState, useSyncExternalStore } from "react";
```

- [ ] **Step 2: Добавить эффекты истории и блокировки скролла, заменить обработчик кнопки**

В том же файле, сразу после строки `const focusMode = isMobile && mode === "swipe";` (добавленной в Task 1), вставить:

```tsx

  useEffect(() => {
    if (!focusMode) return;
    window.history.pushState({ unionFocusMode: true }, "");
    const onPopState = () => setModeOverride("grid");
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [focusMode]);

  useEffect(() => {
    if (!focusMode) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [focusMode]);

  function exitFocusMode() {
    // history.back() запускает popstate-обработчик выше, который и
    // переключает mode на "grid" — единая точка выхода что для клика,
    // что для системного «назад», без лишней записи в истории.
    window.history.back();
  }
```

Затем в разметке `focusMode`-ветки (из Task 1) заменить:

```tsx
        <button
          type="button"
          onClick={() => setModeOverride("grid")}
          aria-label="Выйти из фокус-режима"
```

на:

```tsx
        <button
          type="button"
          onClick={exitFocusMode}
          aria-label="Выйти из фокус-режима"
```

- [ ] **Step 3: Typecheck**

Run (из `apps/web`): `pnpm exec tsc --noEmit -p tsconfig.json`
Expected: без ошибок.

- [ ] **Step 4: Lint**

Run (из `apps/web`): `pnpm exec eslint "src/components/union/recommendations-view.tsx"`
Expected: без ошибок.

- [ ] **Step 5: Ручная проверка через dev-сервер (мобильная ширина)**

На той же превью-сессии из Task 1 (мобильный пресет, `/union/recommendations`):

- Открыть фокус-режим (по умолчанию уже открыт на мобильной ширине). Проверить, что фоновая страница за оверлеем не скроллится при попытке потянуть её (тач/скролл по видимой области вне карточки).
- Клик «✕» — возвращает к списку, как в Task 1.
- Снова оказаться в фокус-режиме (перезагрузить страницу или нажать «Свайпами»). Вызвать переход «назад»: `mcp__Claude_Browser__navigate` с `{"url": "back"}`. Ожидается: страница остаётся на `/union/recommendations`, но фокус-режим закрывается — видна обычная разметка со списком, как после клика «✕».
- Повторно вызвать переход «назад» ещё раз. Ожидается: уже обычная навигация браузера назад (уход со страницы «Знакомства»), а не повторное открытие/закрытие фокус-режима — то есть после первого «назад» никакая лишняя запись в истории не осталась.

- [ ] **Step 6: Закоммитить**

```bash
git add apps/web/src/components/union/recommendations-view.tsx
git commit -m "feat(union): close focus mode on back-gesture, lock background scroll"
```
