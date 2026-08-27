# Плеер сервиса «Музыка» — план реализации (этап 3)

> **Для агентов:** выполнять по задачам через `superpowers:subagent-driven-development`
> или `superpowers:executing-plans`. Шаги помечены чекбоксами `- [ ]`.

**Цель:** портальный плеер, который переживает переход между разделами: одна
полоса внизу экрана, очередь, возобновление с позиции и видимость «слушает
сейчас» для друзей.

**Архитектура:** один `<audio>` на всё приложение внутри
`MusicPlayerProvider` (React-контекст), смонтированного в **корневом**
`layout.tsx`. Состояние зеркалится в `localStorage` (мгновенный старт при
перезагрузке) и в `music/playback/state` (другое устройство). Раз в 30 секунд
— heartbeat: позиция в `MusicPlayState` и продление `MusicNowPlaying`.

**Стек:** Next.js 16 App Router, React 19, NestJS 11, Prisma, Web Audio не
используется (ломает Media Session — см. решение 5 в плане сервиса).

**Спецификация:** [docs/music-service-plan.md](../../music-service-plan.md),
разделы «Плеер: что обычно есть — и что берём», «Портальный виджет»,
«Приватность». **Макет:** `.design/music/MiniPlayer.dc.html`.

## Глобальные ограничения

- **Контракт сервисного модуля** ([docs/service-module-contract.md](../../service-module-contract.md)):
  модуль `music` импортирует только `AuthModule`, глобальный `PrismaService`,
  типы из `@vedamatch/shared` и `EventEmitter2`. Чужие фичевые модули —
  нельзя. Общие хелперы дублируются внутрь папки.
- **Вторая точка касания портала.** Мини-плеер в `apps/web/src/app/layout.tsx`
  — единственное исключение помимо строки в `app.module.ts`. Оно объявлено в
  плане сервиса заранее. Больше исключений не просить.
- **Только токены** из `globals.css`. Хардкод `#RRGGBB` переживёт
  переключение темы и останется от чужой.
- **Контраст ≥ 4.5:1** (3:1 для ≥24px), считать поверх фактической подложки.
  Замерять, а не оценивать на глаз.
- **Цели ≥ 24×24 CSS-пикселя** (WCAG 2.5.8).
- **`prefers-reduced-motion`** уважать: бегущая строка названия и пульсация
  не запускаются.
- **Фокус не отключать.** Локальный `outline: none` без замены — регресс.
- **Имя наружу** — через `resolveDisplayName()`; в модерации и админке
  осознанно мирское.
- Сборку API **не запускать** (`nest build` перезапишет `dist` под работающим
  `nest start --watch`): типы проверять `npx tsc -p tsconfig.json --noEmit`.

## Решения, принятые до плана

1. **Лайк в плеере включаем, «в плейлист» — нет.** Макет показывает обе
   кнопки, но плейлисты — этап 4. `MusicFavorite` уже есть в схеме и стоит
   двух эндпоинтов, поэтому сердце делаем сейчас; «в плейлист» до этапа 4
   остаётся ссылкой `/music/tracks/:id?add=1` — тем самым портально-
   безопасным адресом, который уже согласован в разделе «Друзья».
2. **Без Web Audio.** Эквалайзер и кроссфейд требуют графа на весь поток и
   ломают Media Session. Громкость — через `audio.volume`.
3. **Ссылка на аудио живёт 6 часов** (`MUSIC_STREAM_URL_TTL_SECONDS`).
   Плеер получает её редиректом с `music/tracks/:id/stream` и не кеширует:
   `<audio src>` ставится на сам маршрут, редирект отрабатывает браузер.
4. **`MusicListen` пишется один раз на прослушивание**, а не на каждый
   heartbeat: строка заводится, когда суммарно прослушано ≥ 30 секунд, и
   дальше только обновляется. Иначе таблица растёт быстрее всех остальных.

## Структура файлов

**Чистая логика (API, под тестом):**
- `apps/api/src/modules/music/music-queue.ts` — следующий и предыдущий трек
  при shuffle и repeat, поведение на краях очереди.
- `apps/api/src/modules/music/now-playing-visibility.ts` — кто кого видит с
  учётом настройки, приватного сеанса, блокировок и протухания.

**API:**
- `music-playback.service.ts` + `music-playback.controller.ts` — состояние,
  heartbeat, настройки.
- `music-favorites.service.ts` — избранное (внутри того же контроллера).

**Веб:**
- `apps/web/src/lib/music-queue.ts` — та же логика очереди на клиенте
  (дублируется осознанно: сервер про очередь ничего не знает, а тест нужен
  обоим).
- `apps/web/src/components/music/player/player-provider.tsx` — контекст,
  `<audio>`, зеркала в `localStorage` и в API.
- `apps/web/src/components/music/player/mini-player.tsx` — полоса по макету.
- `apps/web/src/components/music/player/queue-panel.tsx` — очередь.
- `apps/web/src/components/music/player/media-session.ts` — регистрация
  Media Session.
- `apps/web/src/lib/music-playback-api.ts` — браузерный клиент.

---

### Задача 1: Очередь — чистая логика

**Файлы:**
- Создать: `apps/api/src/modules/music/music-queue.ts`
- Тест: `apps/api/src/modules/music/music-queue.spec.ts`

**Интерфейсы:**
- Отдаёт: `nextIndex(state): number | null`, `prevIndex(state): number | null`,
  `buildShuffleOrder(length, seed): number[]`, тип `QueueState`.

- [ ] **Шаг 1: Написать падающий тест**

```ts
// apps/api/src/modules/music/music-queue.spec.ts
import { buildShuffleOrder, nextIndex, prevIndex } from './music-queue';
import type { QueueState } from './music-queue';

const state = (over: Partial<QueueState> = {}): QueueState => ({
  length: 3,
  index: 0,
  repeat: 'off',
  shuffle: false,
  order: null,
  ...over,
});

describe('nextIndex', () => {
  it('идёт по порядку', () => {
    expect(nextIndex(state({ index: 0 }))).toBe(1);
    expect(nextIndex(state({ index: 1 }))).toBe(2);
  });

  it('на конце без повтора останавливается', () => {
    expect(nextIndex(state({ index: 2 }))).toBeNull();
  });

  it('repeat=all с конца возвращает в начало', () => {
    expect(nextIndex(state({ index: 2, repeat: 'all' }))).toBe(0);
  });

  it('repeat=one остаётся на месте', () => {
    expect(nextIndex(state({ index: 1, repeat: 'one' }))).toBe(1);
  });

  it('пустая очередь не даёт следующего', () => {
    expect(nextIndex(state({ length: 0, index: 0 }))).toBeNull();
  });
});

describe('prevIndex', () => {
  it('в начале без повтора остаётся на месте, а не проваливается', () => {
    expect(prevIndex(state({ index: 0 }))).toBeNull();
  });

  it('repeat=all из начала уводит в конец', () => {
    expect(prevIndex(state({ index: 0, repeat: 'all' }))).toBe(2);
  });
});

describe('buildShuffleOrder', () => {
  it('перестановка содержит все позиции ровно по разу', () => {
    const order = buildShuffleOrder(5, 42);
    expect([...order].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4]);
  });

  it('один и тот же seed даёт один и тот же порядок', () => {
    expect(buildShuffleOrder(8, 7)).toEqual(buildShuffleOrder(8, 7));
  });

  it('разные seed дают разный порядок', () => {
    expect(buildShuffleOrder(8, 1)).not.toEqual(buildShuffleOrder(8, 2));
  });
});

describe('shuffle и repeat вместе', () => {
  it('следующий идёт по перестановке, а не по исходному порядку', () => {
    const order = [2, 0, 1];
    // Сейчас играет трек 2 — он первый в перестановке.
    expect(nextIndex(state({ shuffle: true, order, index: 2 }))).toBe(0);
  });

  it('конец перестановки с repeat=all возвращает к её началу', () => {
    const order = [2, 0, 1];
    expect(
      nextIndex(state({ shuffle: true, order, index: 1, repeat: 'all' })),
    ).toBe(2);
  });
});
```

- [ ] **Шаг 2: Убедиться, что тест падает**

Выполнить: `pnpm --filter @vedamatch/api test -- music-queue`
Ожидается: FAIL, «Cannot find module './music-queue'».

- [ ] **Шаг 3: Реализовать**

```ts
// apps/api/src/modules/music/music-queue.ts
/**
 * Очередь: следующий и предыдущий трек.
 *
 * Чистая функция от состояния, а не метод плеера: единственное, что здесь
 * можно перепутать, — это края очереди и сочетание shuffle с repeat, и
 * проверять это надо без звука и без React.
 *
 * Перестановка хранится списком позиций, а не пересортированной очередью:
 * выключение shuffle должно вернуть исходный порядок, а не «тот, что
 * получился».
 */
export type MusicRepeatMode = 'off' | 'all' | 'one';

export interface QueueState {
  length: number;
  /** Позиция играющего трека в исходной очереди. */
  index: number;
  repeat: MusicRepeatMode;
  shuffle: boolean;
  /** Перестановка позиций; `null` — shuffle выключен. */
  order: number[] | null;
}

function positions(state: QueueState): number[] {
  if (state.shuffle && state.order && state.order.length === state.length) {
    return state.order;
  }
  return Array.from({ length: state.length }, (_, i) => i);
}

function step(state: QueueState, delta: 1 | -1): number | null {
  if (state.length === 0) return null;
  // repeat=one отвечает раньше всего: он про «играй это же», а не про
  // движение по очереди.
  if (state.repeat === 'one') return state.index;

  const list = positions(state);
  const at = list.indexOf(state.index);
  if (at === -1) return null;

  const target = at + delta;
  if (target >= 0 && target < list.length) return list[target];

  if (state.repeat === 'all') {
    return delta === 1 ? list[0] : list[list.length - 1];
  }
  return null;
}

export function nextIndex(state: QueueState): number | null {
  return step(state, 1);
}

export function prevIndex(state: QueueState): number | null {
  return step(state, -1);
}

/**
 * Перестановка для shuffle. Генератор детерминированный: тот же seed даёт
 * тот же порядок, и очередь переживает перезагрузку страницы, не
 * перетасовавшись заново под человеком.
 */
export function buildShuffleOrder(length: number, seed: number): number[] {
  const order = Array.from({ length }, (_, i) => i);
  let state = seed >>> 0 || 1;
  const random = () => {
    // xorshift32: короткий, без зависимостей и воспроизводимый.
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0xffffffff;
  };
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}
```

- [ ] **Шаг 4: Убедиться, что тест проходит**

Выполнить: `pnpm --filter @vedamatch/api test -- music-queue`
Ожидается: PASS, 12 тестов.

- [ ] **Шаг 5: Скопировать на веб и переиспользовать тест**

Создать `apps/web/src/lib/music-queue.ts` с тем же содержимым и заголовком
комментария: «Копия apps/api/src/modules/music/music-queue.ts — очередь живёт
в браузере, но сервер обязан считать следующий трек так же, когда отдаёт
состояние на другое устройство. Контракт запрещает общий модуль между
приложениями, поэтому дублирование осознанное».
Создать `apps/web/src/lib/music-queue.spec.ts` — тот же набор проверок на
`vitest` (`import { describe, expect, it } from "vitest"`).

Выполнить: `pnpm --filter @vedamatch/web exec vitest run src/lib/music-queue.spec.ts`
Ожидается: PASS.

- [ ] **Шаг 6: Коммит**

```bash
git add apps/api/src/modules/music/music-queue.ts apps/api/src/modules/music/music-queue.spec.ts apps/web/src/lib/music-queue.ts apps/web/src/lib/music-queue.spec.ts
git commit -m "feat(music): очередь плеера — следующий и предыдущий при shuffle и repeat"
```

---

### Задача 2: Видимость «слушает сейчас» — чистая логика

**Файлы:**
- Создать: `apps/api/src/modules/music/now-playing-visibility.ts`
- Тест: `apps/api/src/modules/music/now-playing-visibility.spec.ts`

**Интерфейсы:**
- Отдаёт: `isNowPlayingVisible(input): boolean`, `isNowPlayingStale(row, now): boolean`.

- [ ] **Шаг 1: Написать падающий тест**

```ts
// apps/api/src/modules/music/now-playing-visibility.spec.ts
import {
  isNowPlayingStale,
  isNowPlayingVisible,
} from './now-playing-visibility';

const input = (over = {}) => ({
  visibility: 'friends' as const,
  isPrivateSession: false,
  viewerIsFriend: true,
  viewerBlocked: false,
  stale: false,
  ...over,
});

describe('isNowPlayingVisible', () => {
  it('друг видит', () => {
    expect(isNowPlayingVisible(input())).toBe(true);
  });

  it('чужой не видит даже при настройке «друзьям»', () => {
    expect(isNowPlayingVisible(input({ viewerIsFriend: false }))).toBe(false);
  });

  it('настройка «никому» перекрывает дружбу', () => {
    expect(isNowPlayingVisible(input({ visibility: 'nobody' }))).toBe(false);
  });

  it('невидимый сеанс перекрывает всё', () => {
    expect(isNowPlayingVisible(input({ isPrivateSession: true }))).toBe(false);
  });

  it('заблокировавший не видит, что я слушаю', () => {
    expect(isNowPlayingVisible(input({ viewerBlocked: true }))).toBe(false);
  });

  it('протухшая строка невидима, даже когда всё разрешено', () => {
    expect(isNowPlayingVisible(input({ stale: true }))).toBe(false);
  });
});

describe('isNowPlayingStale', () => {
  const now = new Date('2026-08-27T12:00:00.000Z');

  it('свежий heartbeat — не протухло', () => {
    expect(
      isNowPlayingStale(
        { updatedAt: new Date('2026-08-27T11:59:30.000Z'), durationSeconds: 200 },
        now,
      ),
    ).toBe(false);
  });

  it('дольше длительности плюс две минуты — протухло', () => {
    expect(
      isNowPlayingStale(
        { updatedAt: new Date('2026-08-27T11:50:00.000Z'), durationSeconds: 200 },
        now,
      ),
    ).toBe(true);
  });

  it('длинная лекция не протухает раньше времени', () => {
    expect(
      isNowPlayingStale(
        { updatedAt: new Date('2026-08-27T11:40:00.000Z'), durationSeconds: 3600 },
        now,
      ),
    ).toBe(false);
  });
});
```

- [ ] **Шаг 2: Убедиться, что тест падает**

Выполнить: `pnpm --filter @vedamatch/api test -- now-playing-visibility`
Ожидается: FAIL, модуля нет.

- [ ] **Шаг 3: Реализовать**

```ts
// apps/api/src/modules/music/now-playing-visibility.ts
/**
 * Кто видит, что человек слушает сейчас.
 *
 * Чистой функцией и под тестом, потому что здесь четыре независимых запрета
 * и ошибка в любом означает, что человек «светится» там, где не хотел.
 * Порядок проверок неважен — все они запрещающие, и это тоже проверяется.
 */
export interface NowPlayingVisibilityInput {
  visibility: 'friends' | 'nobody';
  /** Кнопка «невидимый сеанс» в плеере, на один сеанс. */
  isPrivateSession: boolean;
  /** Открыта ли зрителю активность: мэтч в Знакомствах, раскрытые контакты. */
  viewerIsFriend: boolean;
  /** Блокировка в любую сторону — через ModerationModule. */
  viewerBlocked: boolean;
  /** Строка старше `durationSeconds + 2 мин` без heartbeat. */
  stale: boolean;
}

export function isNowPlayingVisible(
  input: NowPlayingVisibilityInput,
): boolean {
  if (input.isPrivateSession) return false;
  if (input.visibility === 'nobody') return false;
  if (input.viewerBlocked) return false;
  if (input.stale) return false;
  return input.viewerIsFriend;
}

/** Запас поверх длительности: heartbeat раз в 30 с, две минуты — с полем. */
const STALE_GRACE_MS = 2 * 60 * 1000;

export function isNowPlayingStale(
  row: { updatedAt: Date; durationSeconds: number },
  now: Date,
): boolean {
  const limit = row.durationSeconds * 1000 + STALE_GRACE_MS;
  return now.getTime() - row.updatedAt.getTime() > limit;
}
```

- [ ] **Шаг 4: Убедиться, что тест проходит**

Выполнить: `pnpm --filter @vedamatch/api test -- now-playing-visibility`
Ожидается: PASS, 9 тестов.

- [ ] **Шаг 5: Коммит**

```bash
git add apps/api/src/modules/music/now-playing-visibility.ts apps/api/src/modules/music/now-playing-visibility.spec.ts
git commit -m "feat(music): правила видимости «слушает сейчас»"
```

---

### Задача 3: API воспроизведения — состояние, heartbeat, настройки

**Файлы:**
- Создать: `apps/api/src/modules/music/music-playback.service.ts`
- Создать: `apps/api/src/modules/music/music-playback.controller.ts`
- Тест: `apps/api/src/modules/music/music-playback.service.spec.ts`
- Изменить: `apps/api/src/modules/music/music.module.ts` (регистрация)
- Изменить: `packages/shared/src/music.ts` (типы)

**Интерфейсы:**
- Потребляет: `isNowPlayingStale` из задачи 2.
- Отдаёт: `GET/PUT music/playback/state`, `POST music/playback/heartbeat`,
  `GET/PUT music/settings`; типы `MusicPlaybackStateDto`,
  `MusicHeartbeatRequest`, `MusicSettingsDto`.

- [ ] **Шаг 1: Добавить типы в shared**

```ts
// packages/shared/src/music.ts — дописать в конец
// ===== Плеер (этап 3) =====

export type MusicRepeatMode = 'off' | 'all' | 'one';

/** Состояние плеера, переживающее переход между устройствами. */
export interface MusicPlaybackStateDto {
  trackId: string | null;
  positionSeconds: number;
  /** Очередь идентификаторами: карточки страница дочитает сама. */
  queue: string[];
  repeat: MusicRepeatMode;
  shuffle: boolean;
  updatedAt: string | null;
}

export interface MusicHeartbeatRequest {
  trackId: string;
  positionSeconds: number;
  /** Сколько секунд реально прослушано с прошлого heartbeat. */
  listenedSeconds: number;
  isPrivateSession: boolean;
}

export interface MusicSettingsDto {
  nowPlayingVisibility: MusicNowPlayingVisibility;
  autoplay: boolean;
}
```

Выполнить: `pnpm --filter @vedamatch/shared build`
Ожидается: без ошибок.

- [ ] **Шаг 2: Написать падающий тест сервиса**

```ts
// apps/api/src/modules/music/music-playback.service.spec.ts
import type { PrismaService } from '../../prisma/prisma.service';
import { MusicPlaybackService } from './music-playback.service';

function prismaMock() {
  return {
    musicPlayState: {
      findFirst: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue({}),
    },
    musicNowPlaying: { upsert: jest.fn().mockResolvedValue({}) },
    musicListen: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
    },
    musicSettings: {
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockImplementation(({ create }) => create),
    },
    musicTrack: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ id: 't1', durationSeconds: 200, status: 'published' }),
    },
  };
}

const service = (p: ReturnType<typeof prismaMock>) =>
  new MusicPlaybackService(p as unknown as PrismaService);

describe('MusicPlaybackService.heartbeat', () => {
  it('сохраняет позицию', async () => {
    const prisma = prismaMock();

    await service(prisma).heartbeat('u1', {
      trackId: 't1',
      positionSeconds: 42,
      listenedSeconds: 30,
      isPrivateSession: false,
    });

    expect(prisma.musicPlayState.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_trackId: { userId: 'u1', trackId: 't1' } },
      }),
    );
  });

  it('в невидимом сеансе «слушает сейчас» не пишется', async () => {
    const prisma = prismaMock();

    await service(prisma).heartbeat('u1', {
      trackId: 't1',
      positionSeconds: 42,
      listenedSeconds: 30,
      isPrivateSession: true,
    });

    expect(prisma.musicNowPlaying.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ isPrivateSession: true }),
      }),
    );
  });

  it('короткое прослушивание не заводит строку истории', async () => {
    const prisma = prismaMock();

    await service(prisma).heartbeat('u1', {
      trackId: 't1',
      positionSeconds: 10,
      listenedSeconds: 10,
      isPrivateSession: false,
    });

    expect(prisma.musicListen.create).not.toHaveBeenCalled();
  });

  it('после тридцати секунд заводит одну строку и дальше обновляет её', async () => {
    const prisma = prismaMock();

    await service(prisma).heartbeat('u1', {
      trackId: 't1',
      positionSeconds: 35,
      listenedSeconds: 35,
      isPrivateSession: false,
    });
    expect(prisma.musicListen.create).toHaveBeenCalledTimes(1);

    prisma.musicListen.findFirst.mockResolvedValue({ id: 'l1', seconds: 35 });
    await service(prisma).heartbeat('u1', {
      trackId: 't1',
      positionSeconds: 70,
      listenedSeconds: 35,
      isPrivateSession: false,
    });
    expect(prisma.musicListen.create).toHaveBeenCalledTimes(1);
    expect(prisma.musicListen.update).toHaveBeenCalledTimes(1);
  });

  it('отрицательную и запредельную позицию зажимает длительностью', async () => {
    const prisma = prismaMock();

    await service(prisma).heartbeat('u1', {
      trackId: 't1',
      positionSeconds: -5,
      listenedSeconds: 0,
      isPrivateSession: false,
    });
    expect(
      prisma.musicPlayState.upsert.mock.calls[0][0].create.positionSeconds,
    ).toBe(0);

    await service(prisma).heartbeat('u1', {
      trackId: 't1',
      positionSeconds: 99999,
      listenedSeconds: 0,
      isPrivateSession: false,
    });
    expect(
      prisma.musicPlayState.upsert.mock.calls[1][0].create.positionSeconds,
    ).toBe(200);
  });
});

describe('MusicPlaybackService.settings', () => {
  it('без строки отдаёт значения по умолчанию, а не пустоту', async () => {
    const prisma = prismaMock();

    const result = await service(prisma).getSettings('u1');

    expect(result).toEqual({ nowPlayingVisibility: 'friends', autoplay: true });
  });
});
```

- [ ] **Шаг 3: Убедиться, что тест падает**

Выполнить: `pnpm --filter @vedamatch/api test -- music-playback`
Ожидается: FAIL, модуля нет.

- [ ] **Шаг 4: Реализовать сервис**

Ключевые правила, которые обязаны быть в коде:
- позиция зажимается в `[0, durationSeconds]` — клиент присылает что угодно;
- `MusicListen` заводится при накопленных `>= 30` секундах и дальше
  обновляется, а не дублируется (`LISTEN_THRESHOLD_SECONDS = 30`);
- `MusicNowPlaying` — `upsert` по `userId` (одна строка на человека);
- `getSettings` без строки отдаёт `{ nowPlayingVisibility: 'friends', autoplay: true }`;
- запись со статусом не `published` в heartbeat принимается только от того,
  кто её загрузил, иначе `NotFoundException`.

- [ ] **Шаг 5: Убедиться, что тест проходит**

Выполнить: `pnpm --filter @vedamatch/api test -- music-playback`
Ожидается: PASS, 6 тестов.

- [ ] **Шаг 6: Контроллер и регистрация**

`@Controller('music/playback')` и `@Controller('music/settings')` под
`AuthGuard`. Добавить оба в `controllers`, сервис — в `providers`
`music.module.ts`.

Проверить типы: `cd apps/api && npx tsc -p tsconfig.json --noEmit`
Ожидается: без вывода.

- [ ] **Шаг 7: Проверить живьём**

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4000/music/settings
```
Ожидается: `401` (без авторизации).

- [ ] **Шаг 8: Коммит**

```bash
git add apps/api/src/modules/music packages/shared/src/music.ts
git commit -m "feat(music): состояние плеера, heartbeat и настройки прослушивания"
```

---

### Задача 4: Избранное

**Файлы:**
- Создать: `apps/api/src/modules/music/music-favorites.service.ts`
- Тест: `apps/api/src/modules/music/music-favorites.service.spec.ts`
- Изменить: `music-playback.controller.ts` (добавить `@Controller('music/favorites')`)

**Интерфейсы:**
- Отдаёт: `POST/DELETE music/favorites/:trackId`, `GET music/favorites`.

- [ ] **Шаг 1: Тест**

Проверить: повторное добавление не падает (идемпотентность `upsert`),
удаление несуществующего не падает, в избранное нельзя добавить чужую
неопубликованную запись (`NotFoundException`), список отсортирован по
`createdAt desc`.

- [ ] **Шаг 2–4:** прогнать цикл красный → зелёный, как в задаче 3.

- [ ] **Шаг 5: Коммит**

```bash
git commit -m "feat(music): избранное"
```

---

### Задача 5: Провайдер плеера на вебе

**Файлы:**
- Создать: `apps/web/src/components/music/player/player-provider.tsx`
- Создать: `apps/web/src/lib/music-playback-api.ts`
- Тест: `apps/web/src/components/music/player/player-state.spec.ts`

**Интерфейсы:**
- Потребляет: `nextIndex`/`prevIndex`/`buildShuffleOrder` из `@/lib/music-queue`.
- Отдаёт: `useMusicPlayer()` → `{ current, queue, isPlaying, position, duration,
  play(track, queue?), toggle(), next(), prev(), seek(s), setRepeat(m),
  toggleShuffle(), setRate(r), setVolume(v), togglePrivateSession() }`.

- [ ] **Шаг 1: Вынести сериализацию состояния в чистый модуль и покрыть тестом**

Создать `apps/web/src/components/music/player/player-state.ts` с
`serializePlayerState` / `parsePlayerState` (зеркало в `localStorage`).
Тест обязан покрывать: битый JSON не роняет плеер (возвращается `null`),
чужая версия схемы отбрасывается, позиция и очередь переживают круг.

- [ ] **Шаг 2: Реализовать провайдер**

Правила, которые обязаны быть в коде:
- **один** `<audio>` на приложение, создаётся в провайдере;
- `src` ставится на `${API_URL}/music/tracks/${id}/stream` — редирект на
  подписанную ссылку отрабатывает браузер, ссылку не кешируем;
- heartbeat раз в 30 с через `setInterval`, останавливается на паузе;
- возобновление: при постановке трека — `GET music/playback/state`, позиция
  применяется один раз, до первого `play`;
- `prefers-reduced-motion` гасит бегущую строку названия;
- при `ended` — `next()`; если `next()` вернул `null`, воспроизведение
  останавливается, а не начинается заново.

- [ ] **Шаг 3: Тесты проходят**

Выполнить: `pnpm --filter @vedamatch/web exec vitest run src/components/music/player`
Ожидается: PASS.

- [ ] **Шаг 4: Коммит**

```bash
git commit -m "feat(music): провайдер плеера с очередью и возобновлением"
```

---

### Задача 6: Полоса мини-плеера

**Файлы:**
- Создать: `apps/web/src/components/music/player/mini-player.tsx`
- Макет: `.design/music/MiniPlayer.dc.html`

Анатомия из макета: полоса `glass`, высота **64px**, скругление 16px,
отступы `0 18px`, `gap: 20px`. Слева обложка 44px + название и исполнитель.
По центру — предыдущий, play/pause (мятный круг), следующий. Справа —
скорость чипом `1.0×`, сердце, «в плейлист», громкость. Под полосой —
дорожка с временем `2:34` и `6:46` моноширинным.

- [ ] **Шаг 1: Сверстать по макету на токенах**

Обязательно: `position: fixed`, `bottom`, отступ по `safe-area`
(`padding-bottom: env(safe-area-inset-bottom)`), показывается только когда
есть что играть и только вошедшему.

- [ ] **Шаг 2: Доступность**

- у каждой иконочной кнопки `aria-label` («Предыдущая запись», «Воспроизвести»,
  «Следующая запись», «В избранное», «Невидимый сеанс»);
- дорожка — `<input type="range">` с `aria-label="Позиция"` и
  `aria-valuetext` временем словами, а не числом секунд;
- все цели ≥ 24×24;
- на телефоне ползунок громкости прячется (системная громкость), но кнопка
  mute остаётся.

- [ ] **Шаг 3: Замерить контраст в обеих темах**

Замерить вычисленные цвета поверх фактической подложки полосы (она стеклянная
— фон композитный). Норма: 4.5:1 для текста мельче 18px.

- [ ] **Шаг 4: Коммит**

```bash
git commit -m "feat(music): полоса мини-плеера по макету"
```

---

### Задача 7: Media Session

**Файлы:**
- Создать: `apps/web/src/components/music/player/media-session.ts`

- [ ] **Шаг 1: Реализовать регистрацию**

`navigator.mediaSession.metadata = new MediaMetadata({ title, artist, album,
artwork })`, обработчики `play`, `pause`, `previoustrack`, `nexttrack`,
`seekto`, `seekbackward`/`seekforward` по 15 секунд. Всё под проверкой
`'mediaSession' in navigator` — на десктопных браузерах без поддержки плеер
обязан работать так же.

- [ ] **Шаг 2: Проверить на устройстве**

Без этого шага задача не закрыта: Media Session проверяется экраном
блокировки телефона, а не юнит-тестом. Записать в отчёте, на чём проверено.

- [ ] **Шаг 3: Коммит**

```bash
git commit -m "feat(music): Media Session — обложка и кнопки на экране блокировки"
```

---

### Задача 8: Монтаж в корневой layout

**Файлы:**
- Изменить: `apps/web/src/app/layout.tsx`

- [ ] **Шаг 1: Смонтировать провайдер и полосу**

Внутри `ThemeProvider`, ниже `{children}`. В комментарии сослаться на решение
6 плана сервиса: это вторая и последняя точка касания портала.

- [ ] **Шаг 2: Убедиться, что звук переживает переход**

Проверить: начать воспроизведение на `/music`, перейти в `/chat`, вернуться.
Звук не прерывается, позиция не сбрасывается.

- [ ] **Шаг 3: Убедиться, что гостю полосы нет**

Открыть лендинг `/` без cookie — полосы быть не должно.

- [ ] **Шаг 4: Коммит**

```bash
git commit -m "feat(music): мини-плеер в корневом layout — звук переживает переход между сервисами"
```

---

### Задача 9: Очередь и рельс

**Файлы:**
- Создать: `apps/web/src/components/music/player/queue-panel.tsx`
- Изменить: `apps/web/src/components/music/music-rail.tsx` (Избранное и
  История становятся ссылками)
- Создать: `apps/web/src/app/(portal)/music/favorites/page.tsx`

- [ ] **Шаг 1: Панель очереди**

«Слушать дальше», добавить в конец, посмотреть очередь. Открывается кнопкой
в полосе, закрывается Esc, фокус не выпадает наружу.

- [ ] **Шаг 2: Оживить рельс**

Убрать пометку «скоро» у «Избранного» и «Истории», подставить настоящие
счётчики. **Плейлисты остаются со «скоро» до этапа 4.**

- [ ] **Шаг 3: Коммит**

```bash
git commit -m "feat(music): очередь и избранное в рельсе"
```

---

### Задача 10: Приёмка

- [ ] **Шаг 1: Полный прогон тестов**

```bash
pnpm --filter @vedamatch/api test
pnpm --filter @vedamatch/web test
```
Ожидается: всё зелёное, счётчики не ниже прежних.

- [ ] **Шаг 2: Скилл `accessibility` по странице с плеером**

Проверить: имена всех кнопок, размеры целей, контраст в обеих темах,
видимый фокус, `prefers-reduced-motion`.

- [ ] **Шаг 3: Приватность — сквозная проверка**

Двумя аккаунтами: друг видит «слушает сейчас», не-друг не видит, невидимый
сеанс скрывает от друга, настройка «никому» скрывает от всех, протухшая
строка не показывается.

- [ ] **Шаг 4: Убрать демо-данные, оставленные при проверке**

---

## Самопроверка плана

**Покрытие спецификации.** Из списка «Обязательное (v1)» закрыты: play/pause
(6), следующий/предыдущий (1, 6), перемотка (6), очередь (9), shuffle и
repeat (1), громкость и mute (6), Media Session (7), возобновление (3, 5),
±15 секунд (7), лайк (4, 6), скорость (6). **«В плейлист» сознательно не
закрыт** — этап 4, вместо кнопки ссылка; отмечено в решениях.

**Не закрыто и не должно быть:** сон-таймер, тексты, волновая форма,
кроссфейд, эквалайзер — этап 9 и «осознанно не делаем».

**Риск, который стоит знать заранее.** Задача 8 трогает корневой layout, то
есть все страницы портала. Если что-то пойдёт не так, откатывать надо именно
её, а не весь этап — поэтому она отдельная и минимальная.
