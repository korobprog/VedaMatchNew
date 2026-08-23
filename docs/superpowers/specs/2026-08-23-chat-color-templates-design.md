# Конструктор цвета чата — шаблоны оформления

Дата: 2026-08-23

## Задача

Пользователь хочет настраивать цвет элементов переписки под себя и сохранять
настройку как переиспользуемый шаблон, который можно применить к любой беседе.

Настройка приватна: она не меняет то, что видят другие участники беседы —
только собственный экран настроившего.

## Что настраивается

Четыре цвета на шаблон, каждый — один hex-цвет (без градиентов):

- `bubbleMine` — фон пузыря своих сообщений
- `bubbleTheirs` — фон пузыря чужих сообщений
- `accent` — акцентный цвет переписки (ссылки, галочка «прочитано», рамка
  цитаты ответа)
- `background` — фон переписки целиком

Цвет имени автора и подложка аватара **не входят** в конструктор — они
остаются детерминированным per-user различением из
`chat-author-color.ts` (иначе теряется смысл различения говорящих в группе).

Выбор цвета свободный (hex/RGB через `<input type="color">` + текстовое
поле), без курируемого набора и без ограничения по контрасту на вход:
контраст текста внутри пузыря считается автоматически (см. «Автоконтраст»).

## Модель шаблонов

Несколько именованных шаблонов на пользователя, независимых от бесед.
Каждая беседа хранит ссылку на применённый шаблон (или её отсутствие —
дефолтное оформление). Один шаблон может быть применён к N беседам без
дублирования цветов.

## Хранение — Postgres, модуль `chat`

Обе модели — в конце `apps/api/prisma/schema.prisma`, в блоке чата:

```prisma
model ChatColorTemplate {
  id           String   @id @default(cuid())
  userId       String
  name         String
  bubbleMine   String
  bubbleTheirs String
  accent       String
  background   String
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  themes       ChatConversationTheme[]

  @@index([userId])
}

model ChatConversationTheme {
  userId         String
  conversationId String
  templateId     String?
  template       ChatColorTemplate? @relation(fields: [templateId], references: [id], onDelete: SetNull)
  updatedAt      DateTime @updatedAt

  @@id([userId, conversationId])
}
```

`templateId: null` в существующей строке `ChatConversationTheme` означает
«явно сброшено на оформление по умолчанию» — отличается от отсутствия
строки («никогда не настраивал»), хотя рендерится одинаково.

Обе модели живут внутри `modules/chat` (свой сервис), `conversationId` не
получает формальный FK на `ChatConversation` Prisma-уровня, так как это та
же модель того же модуля — связь по контракту допустима.

## API (`modules/chat`, префикс `chat/...`)

- `GET /chat/color-templates` — список шаблонов пользователя
- `POST /chat/color-templates` — создать
  `{name, bubbleMine, bubbleTheirs, accent, background}`
- `PATCH /chat/color-templates/:id` — редактировать (только свой)
- `DELETE /chat/color-templates/:id` — удалить; ссылавшиеся
  `ChatConversationTheme` откатываются на `null` через `onDelete: SetNull`
- `GET /chat/:conversationId/theme` — применённый шаблон текущего
  пользователя к этой беседе (или `null`)
- `PUT /chat/:conversationId/theme` — применить `{templateId | null}`

Hex-поля валидируются регэкспом `^#[0-9a-f]{6}$` в DTO.

## Фронтенд

### Страница `/chat/appearance` («Мои шаблоны оформления»)

Новый маршрут `apps/web/src/app/chat/appearance/`, клиент
`apps/web/src/lib/chat-appearance-api.ts` поверх `lib/api.ts`. Список
карточек-шаблонов с мини-превью переписки (пузырь свой/чужой/фон), кнопки
«Создать», «Изменить», «Удалить». Форма редактирования — 4 цветовых поля с
живым превью рядом.

### Пункт «Оформление» в меню беседы

В `chat-room-menu.tsx` добавляется пункт, открывающий поповер: список
шаблонов пользователя (выбор применяется сразу через
`PUT /chat/:id/theme`), пункт «Без шаблона (по умолчанию)» и ссылка
«Создать новый шаблон» → `/chat/appearance`.

### Рендеринг — CSS-переменные на контейнере беседы

`chat-room.tsx` при загрузке беседы тянет `GET /chat/:id/theme`, резолвит
цвета (или `null` → дефолт) и выставляет CSS-переменные на корневой
контейнер:

```
--chat-bubble-mine
--chat-bubble-theirs
--chat-accent
--chat-bg
--chat-bubble-mine-ink   (посчитан)
--chat-bubble-theirs-ink (посчитан)
```

`chat-message.tsx` и соседние компоненты (цвет ссылки «Обсудить», рамка
цитаты, галочка «прочитано») переключаются со статичных Tailwind-классов на
`style={{ background: "var(--chat-bubble-mine)" }}`, где значение
переменной по умолчанию (fallback) равно текущим токенам темы:
`var(--chat-accent, var(--vm-cyan))` — так беседа без шаблона выглядит
ровно как сейчас.

### Автоконтраст текста

Свободный hex может дать тёмный текст на тёмном фоне. По аналогии с `ink` в
`chat-author-color.ts`, для `bubbleMine`/`bubbleTheirs` считается
относительная яркость фона и выбирается текстовый цвет (светлый/тёмный) —
без участия пользователя, чисто вычисляемая функция, выносится в отдельный
модуль (`chat-contrast-ink.ts`) и тестируется изолированно.

## Тестирование

- `chat-color-template.service.spec.ts` — CRUD, каскад `SetNull` при
  удалении шаблона, валидация hex, доступ только к своим записям
- `chat-conversation-theme.service.spec.ts` — применение/сброс, доступ
  только к своим беседам
- `chat-contrast-ink.spec.ts` — чистая функция яркость → ink, границы
  (чёрный/белый/серый фон)
- `chat-appearance-api.spec.ts` (веб) — тонкий слой fetch-хелперов

## Вне рамок

- Градиенты в пузырях — только сплошной цвет
- Общее оформление беседы для всех участников — только приватный просмотр
- Настройка цвета имени автора / подложки аватара — остаётся автоматикой
