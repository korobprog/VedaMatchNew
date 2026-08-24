# Union: переключатель «Показывать уже отсмотренных» — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Добавить в ленту рекомендаций Union необратимый, обратимый переключатель `includeSwiped`, который честно показывает уже отсмотренные анкеты вместо того, чтобы полагаться на разрушительный сброс истории, и сделать существующий сброс истории (`DELETE /union/swipes/history`) явно опасным действием с подтверждением.

**Architecture:** Один новый опциональный булев фильтр (`includeSwiped`) проходит по всему существующему пути `UnionRecommendationFilters`: query-параметр → контроллер → `normalizeFilters()` → `getRecommendations()`. Когда включён, он снимает `swiped`-исключение из набора кандидатов (и на уровне SQL-условия, и в JS-фильтре ниже), но не трогает `hidden` (блокировки/модерация) и не пишет ничего в БД. Отдельно — фронтенд переименовывает кнопку полного сброса истории и добавляет `window.confirm()` перед вызовом.

**Tech Stack:** NestJS + Prisma (apps/api), Next.js App Router клиентский компонент (apps/web), Jest (юнит-тесты api), общий TS-тип в packages/shared.

## Global Constraints

- Спека: `docs/superpowers/specs/2026-08-24-union-recommendations-include-swiped-design.md` — реализация обязана соответствовать ей, включая раздел «Не в объёме этой задачи» (не чинить повисающую заявку при пересвайпе с pass после лайка).
- `includeSwiped` по умолчанию `false` — поведение ленты не меняется для тех, кто не трогал новый чекбокс.
- `hidden` (модерация/блокировки) исключаются из выдачи всегда, независимо от `includeSwiped`.
- Название кнопки меняется с «Показать всех заново» на «Стереть решения и заявки»; текст подтверждения и тултипа: «Все пропуски и ещё не отвеченные заявки будут отменены. Состоявшиеся знакомства не затрагиваются. Отменить это действие нельзя.»
- Название чекбокса: «Показывать уже отсмотренных».

---

### Task 1: Тип фильтра и разбор query-параметра в контроллере

**Files:**
- Modify: `packages/shared/src/union.ts:358-360`
- Modify: `apps/api/src/modules/union/union-recommendations.controller.ts:43-48`
- Test: `apps/api/src/modules/union/union-recommendations.controller.spec.ts`

**Interfaces:**
- Produces: `UnionRecommendationFilters.includeSwiped?: boolean` — читается в Task 2 внутри `UnionProfileService.normalizeFilters()` и `getRecommendations()`.

- [ ] **Step 1: Добавить поле в общий тип**

В `packages/shared/src/union.ts` рядом с существующим `photoVerifiedOnly`:

```typescript
  /** Показывать только профили с проверенными фото. */
  photoVerifiedOnly?: boolean;
  /** Не исключать из выдачи анкеты, которые уже свайпнули (лайк/пропуск). */
  includeSwiped?: boolean;
```

- [ ] **Step 2: Написать падающий тест на разбор параметра**

В `apps/api/src/modules/union/union-recommendations.controller.spec.ts`, после теста `'takes the first value of a repeated scalar parameter'`:

```typescript
  it('parses includeSwiped as a boolean', async () => {
    await controller.recommendations(user, { includeSwiped: 'true' });

    expect(getRecommendations).toHaveBeenCalledWith(
      'me',
      expect.objectContaining({ includeSwiped: true }),
    );
  });

  it('defaults includeSwiped to false when the parameter is absent', async () => {
    await controller.recommendations(user, {});

    expect(getRecommendations).toHaveBeenCalledWith(
      'me',
      expect.objectContaining({ includeSwiped: false }),
    );
  });
```

- [ ] **Step 3: Прогнать тесты и убедиться, что они падают**

Run: `pnpm --filter @vedamatch/api test -- union-recommendations.controller`
Expected: FAIL — оба новых теста падают, потому что `toFilters()` ещё не кладёт `includeSwiped` в результат (значение будет `undefined`, а не `true`/`false`).

- [ ] **Step 4: Реализовать разбор параметра**

В `apps/api/src/modules/union/union-recommendations.controller.ts`, в `toFilters()`, сразу после `photoVerifiedOnly`:

```typescript
    photoVerifiedOnly:
      first(query.photoVerifiedOnly) === 'true' ||
      first(query.photoVerifiedOnly) === '1',
    includeSwiped:
      first(query.includeSwiped) === 'true' || first(query.includeSwiped) === '1',
```

- [ ] **Step 5: Прогнать тесты и убедиться, что они проходят**

Run: `pnpm --filter @vedamatch/api test -- union-recommendations.controller`
Expected: PASS — все тесты файла, включая два новых.

- [ ] **Step 6: Закоммитить**

```bash
git add packages/shared/src/union.ts apps/api/src/modules/union/union-recommendations.controller.ts apps/api/src/modules/union/union-recommendations.controller.spec.ts
git commit -m "feat(union): parse includeSwiped recommendation filter"
```

---

### Task 2: Применить `includeSwiped` в выдаче рекомендаций

**Files:**
- Modify: `apps/api/src/modules/union/union-profile.service.ts:346-352` (SQL-исключения), `apps/api/src/modules/union/union-profile.service.ts:383-386` (JS-фильтр), `apps/api/src/modules/union/union-profile.service.ts:704-705` (normalizeFilters)
- Test: `apps/api/src/modules/union/union-profile.service.spec.ts`

**Interfaces:**
- Consumes: `UnionRecommendationFilters.includeSwiped` (из Task 1).
- Produces: не меняет публичную сигнатуру `getRecommendations(userId, filters)` — только поведение при `filters.includeSwiped === true`.

- [ ] **Step 1: Написать падающие тесты**

В `apps/api/src/modules/union/union-profile.service.spec.ts`, сразу после существующего теста `'keeps swiped profiles out of the deck'` (использует тот же паттерн моков — `profile()`, `prisma.unionSwipe.findMany.mockResolvedValue([{ toUserId: 'seen' }])`):

```typescript
  it('shows swiped profiles when includeSwiped is set', async () => {
    prisma.unionProfile.findUnique.mockResolvedValue(profile('me'));
    prisma.unionProfile.findMany.mockResolvedValue([
      profile('seen'),
      profile('fresh'),
    ]);
    prisma.unionConnectionRequest.findMany.mockResolvedValue([]);
    prisma.unionSwipe.findMany.mockResolvedValue([{ toUserId: 'seen' }]);

    const result = await service.getRecommendations('me', {
      includeSwiped: true,
    });

    expect(result.items.map((item) => item.user.id).sort()).toEqual([
      'fresh',
      'seen',
    ]);
  });

  it('still hides moderated profiles when includeSwiped is set', async () => {
    prisma.unionProfile.findUnique.mockResolvedValue(profile('me'));
    prisma.unionProfile.findMany.mockResolvedValue([
      profile('blocked'),
      profile('fresh'),
    ]);
    prisma.unionConnectionRequest.findMany.mockResolvedValue([]);
    moderation.hiddenUserIds.mockResolvedValue(new Set(['blocked']));

    const result = await service.getRecommendations('me', {
      includeSwiped: true,
    });

    expect(result.items.map((item) => item.user.id)).toEqual(['fresh']);
  });
```

- [ ] **Step 2: Прогнать тесты и убедиться, что первый падает**

Run: `pnpm --filter @vedamatch/api test -- union-profile.service`
Expected: FAIL на `'shows swiped profiles when includeSwiped is set'` — сейчас `result.items` содержит только `['fresh']`, потому что `swiped` исключает `'seen'` независимо от фильтра. Тест `'still hides moderated profiles...'` уже проходит и до правки (это регрессионная защита, не забыть — он должен остаться зелёным на шаге 4 тоже).

- [ ] **Step 3: Реализовать условное исключение**

В `apps/api/src/modules/union/union-profile.service.ts`, метод `normalizeFilters()` — добавить поле сразу после `photoVerifiedOnly`:

```typescript
      verifiedOnly: filters.verifiedOnly === true,
      photoVerifiedOnly: filters.photoVerifiedOnly === true,
      includeSwiped: filters.includeSwiped === true,
```

В том же файле, метод `getRecommendations()` — заменить формирование `excludedUserIds`:

```typescript
    const others = await this.prisma.unionProfile.findMany({
      where: buildRecommendationCandidateWhere({
        userId,
        excludedUserIds: normalizedFilters.includeSwiped
          ? [...hidden]
          : [...swiped, ...hidden],
        filters: normalizedFilters,
        myAge: myAgePreference,
      }),
```

И JS-фильтр чуть ниже:

```typescript
    const beforeIntentions = others
      .filter((other) => !hidden.has(other.userId))
      .filter(
        (other) => normalizedFilters.includeSwiped || !swiped.has(other.userId),
      )
      .filter((other) => this.hasCompleteLocation(other.user))
```

- [ ] **Step 4: Прогнать тесты и убедиться, что все проходят**

Run: `pnpm --filter @vedamatch/api test -- union-profile.service`
Expected: PASS — все тесты файла, включая старый `'keeps swiped profiles out of the deck'` (без `includeSwiped` поведение не изменилось) и оба новых.

- [ ] **Step 5: Прогнать полный набор тестов api и typecheck**

Run: `pnpm --filter @vedamatch/api test`
Expected: PASS, без новых красных тестов.

Run (из `apps/api`): `pnpm exec tsc --noEmit -p tsconfig.json`
Expected: без ошибок.

- [ ] **Step 6: Закоммитить**

```bash
git add apps/api/src/modules/union/union-profile.service.ts apps/api/src/modules/union/union-profile.service.spec.ts
git commit -m "feat(union): apply includeSwiped filter in recommendations"
```

---

### Task 3: Чекбокс «Показывать уже отсмотренных» на фронтенде

**Files:**
- Modify: `apps/web/src/components/union/recommendation-filters.tsx:363-372` (чекбоксы), `apps/web/src/components/union/recommendation-filters.tsx:576-594` (`filterKeys`)
- Modify: `apps/web/src/app/(portal)/union/recommendations/page.tsx:64-70` (текст пустой выдачи)

**Interfaces:**
- Consumes: `params.includeSwiped` (строка `"true"`/`undefined` из URL search params, как остальные фильтры формы), передаётся на бэкенд Task 1/2 через обычную GET-навигацию формы (`<form action="/union/recommendations">`), без отдельного API-клиента.

Автотестов для этого файла в проекте нет (сверено: `recommendation-filters.tsx` не покрыт спеком, только ручная проверка через dev-сервер — это существующий паттерн для данного компонента, не пробел, вносимый этой задачей).

- [ ] **Step 1: Добавить чекбокс**

В `apps/web/src/components/union/recommendation-filters.tsx`, сразу после блока чекбокса `photoVerifiedOnly` (после закрывающего `</label>` на строке 372, перед `<div className="mt-4 flex flex-wrap items-center gap-3">`):

```tsx
      <label className="mt-2 flex w-fit cursor-pointer items-center gap-2 rounded-xl border border-glass-brd bg-bg-1 px-3 py-2 text-sm text-text-1">
        <input
          type="checkbox"
          name="includeSwiped"
          value="true"
          defaultChecked={first(params.includeSwiped) === "true"}
          className="h-4 w-4 accent-magenta"
        />
        Показывать уже отсмотренных
      </label>
```

- [ ] **Step 2: Включить в счётчик активных фильтров**

В том же файле, массив `filterKeys` — добавить строку после `"photoVerifiedOnly"`:

```typescript
  "verifiedOnly",
  "photoVerifiedOnly",
  "includeSwiped",
] as const;
```

- [ ] **Step 3: Обновить подсказку в пустой выдаче**

В `apps/web/src/app/(portal)/union/recommendations/page.tsx`, заменить:

```tsx
            Учтите: «Сбросить» очищает только видимые фильтры. Уже
            отсмотренные анкеты возвращаются отдельной кнопкой «Показать всех
            заново» выше, а желаемый возраст партнёра задаётся в{" "}
```

на:

```tsx
            Учтите: «Сбросить» очищает только видимые фильтры. Часть
            подходящих анкет может быть уже отсмотрена — включите
            «Показывать уже отсмотренных» среди фильтров, а желаемый возраст
            партнёра задаётся в{" "}
```

- [ ] **Step 4: Typecheck и линт**

Run (из `apps/web`): `pnpm exec tsc --noEmit -p tsconfig.json`
Expected: без ошибок.

Run (из `apps/web`): `pnpm exec eslint src/components/union/recommendation-filters.tsx src/app/\(portal\)/union/recommendations/page.tsx`
Expected: без ошибок.

- [ ] **Step 5: Ручная проверка через dev-сервер**

Поднять `web` (порт 3000) и `api` (порт 4000) через `preview_start` (см. `.claude/launch.json`), залогиниться dev-аккаунтом (`/login`, пароль по умолчанию `vedamatch`, см. `README.md`), открыть `/union/recommendations`, развернуть «Фильтры».

Проверить:
- Чекбокс «Показывать уже отсмотренных» присутствует, по умолчанию не отмечен.
- Свайпнуть (или пропустить) одну анкету, отметить чекбокс, нажать «Применить фильтры» — свайпнутая анкета снова в выдаче, счётчик «Все · N» увеличился на неё.
- Снять чекбокс, применить — анкета снова пропадает из выдачи.

- [ ] **Step 6: Закоммитить**

```bash
git add apps/web/src/components/union/recommendation-filters.tsx "apps/web/src/app/(portal)/union/recommendations/page.tsx"
git commit -m "feat(union): add includeSwiped checkbox to recommendation filters"
```

---

### Task 4: Кнопка сброса истории — явное подтверждение и новое название

**Files:**
- Modify: `apps/web/src/components/union/recommendation-filters.tsx:131-151` (`handleResetHistory`), `apps/web/src/components/union/recommendation-filters.tsx:396-404` (кнопка)

Автотестов нет по той же причине, что в Task 3 — только ручная проверка.

- [ ] **Step 1: Добавить подтверждение перед запросом**

В `apps/web/src/components/union/recommendation-filters.tsx`, начало `handleResetHistory`:

```tsx
  async function handleResetHistory() {
    const confirmed = window.confirm(
      "Все пропуски и ещё не отвеченные заявки будут отменены. Состоявшиеся знакомства не затрагиваются. Отменить это действие нельзя.",
    );
    if (!confirmed) return;
    setHistoryError(null);
    setResettingHistory(true);
```

(Дальше тело функции — без изменений: `try { ... } catch { ... }` остаётся как есть.)

- [ ] **Step 2: Переименовать кнопку и обновить тултип**

В том же файле — заменить:

```tsx
        <button
          type="button"
          onClick={handleResetHistory}
          disabled={resettingHistory}
          title="Уже отсмотренные вами анкеты вернутся в колоду. Состоявшиеся знакомства не затрагиваются."
          className="text-sm font-medium text-text-2 transition hover:text-text-0 disabled:opacity-50"
        >
          {resettingHistory ? "Показываем заново…" : "Показать всех заново"}
        </button>
```

на:

```tsx
        <button
          type="button"
          onClick={handleResetHistory}
          disabled={resettingHistory}
          title="Все пропуски и ещё не отвеченные заявки будут отменены. Состоявшиеся знакомства не затрагиваются. Отменить это действие нельзя."
          className="text-sm font-medium text-text-2 transition hover:text-text-0 disabled:opacity-50"
        >
          {resettingHistory ? "Стираем…" : "Стереть решения и заявки"}
        </button>
```

- [ ] **Step 3: Typecheck и линт**

Run (из `apps/web`): `pnpm exec tsc --noEmit -p tsconfig.json`
Expected: без ошибок.

Run (из `apps/web`): `pnpm exec eslint src/components/union/recommendation-filters.tsx`
Expected: без ошибок.

- [ ] **Step 4: Ручная проверка через dev-сервер**

На той же странице `/union/recommendations` (сервера из Task 3 можно оставить поднятыми):
- Кнопка называется «Стереть решения и заявки».
- Клик показывает системное окно подтверждения с текстом про отмену пропусков и заявок.
- Отмена окна — запрос `DELETE /union/swipes/history` не уходит (проверить по сетевым запросам вкладки), страница не перезагружается.
- Подтверждение — запрос уходит, страница перезагружается с баннером про восстановленные анкеты (существующее поведение `HistoryResetBanner`, не меняется).

- [ ] **Step 5: Закоммитить**

```bash
git add apps/web/src/components/union/recommendation-filters.tsx
git commit -m "fix(union): confirm before wiping swipe history and pending requests"
```
