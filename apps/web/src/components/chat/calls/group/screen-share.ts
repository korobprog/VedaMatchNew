"use client";

import type { ChatGroupCallDto } from "@vedamatch/shared";

/**
 * Показ экрана в групповом звонке (VED-360) — чистая часть на сайте.
 *
 * Как устроено (подробно — в шапке `group-call-screen.ts` на сервере):
 * экран подменяет камеру в том же видео-отправителе (`replaceTrack`), без
 * новой видеосекции и пересогласования; место под видео он занимает то же,
 * что камера; признак «это экран» ездит полем `screen` участника; в комнате
 * показывает не больше одного, и держит это сервер.
 *
 * Здесь — то, что решает клиент: есть ли вообще кнопка, можно ли её нажать
 * и что вернуть в отправитель, когда показ кончился.
 */

export interface ScreenShareSupportInput {
  /** `typeof navigator.mediaDevices?.getDisplayMedia === "function"`. */
  hasGetDisplayMedia: boolean;
  userAgent: string;
  /** `navigator.maxTouchPoints` — iPad прикидывается Маком. */
  maxTouchPoints: number;
}

/**
 * Есть ли кнопка «Показать экран».
 *
 * `getDisplayMedia` в браузерах телефона либо отсутствует (Safari на
 * iPhone, Chrome на Android), либо есть и сразу отказывает. Кнопка, которая
 * всегда отвечает «не получилось», хуже отсутствующей: поэтому мобильный
 * браузер кнопки не получает вовсе, даже если функция в нём объявлена.
 * iPadOS сообщает о себе как Mac — его выдаёт сенсорный экран.
 */
export function canShareScreen({
  hasGetDisplayMedia,
  userAgent,
  maxTouchPoints,
}: ScreenShareSupportInput): boolean {
  if (!hasGetDisplayMedia) return false;
  if (/Android|iPhone|iPad|iPod|Mobile/i.test(userAgent)) return false;
  if (/Macintosh/i.test(userAgent) && maxTouchPoints > 1) return false;
  return true;
}

/** Кто показывает экран, `null` — никто. Порядок — порядок комнаты. */
export function screenSharer(
  call: Pick<ChatGroupCallDto, "participants"> | null,
): { id: string; name: string } | null {
  const found = call?.participants.find((p) => p.screen);
  return found ? { id: found.user.id, name: found.user.name } : null;
}

export interface ScreenButtonState {
  /** Кнопку вообще показывать (браузер умеет показ). */
  visible: boolean;
  /** Нажатие начнёт показ (иначе — остановит). */
  willStart: boolean;
  /** Нажать можно, но откажут — кнопка гаснет и объясняет почему. */
  blocked: boolean;
  blockedReason: string | null;
}

/**
 * Можно ли начать показ — ПОДСКАЗКА для кнопки, как `cameraButtonState`:
 * настоящее решение принимает сервер (`POST /state` отвечает 409 с
 * текстом), а состав комнаты кнопка знает с задержкой события.
 *
 * Остановить свой показ можно всегда. Начать нельзя, когда показывает
 * другой (кнопка называет кого) и когда мест под видео нет, а своей камеры,
 * чьё место экран мог бы взять, тоже нет.
 */
export function screenButtonState(
  call: ChatGroupCallDto | null,
  selfId: string,
  { sharing, supported }: { sharing: boolean; supported: boolean },
): ScreenButtonState {
  if (!supported)
    return {
      visible: false,
      willStart: true,
      blocked: true,
      blockedReason: null,
    };
  if (sharing)
    return { visible: true, willStart: false, blocked: false, blockedReason: null };
  if (!call || call.status !== "live")
    return {
      visible: true,
      willStart: true,
      blocked: true,
      blockedReason: "Звонок уже закончился",
    };

  const holder = screenSharer(call);
  if (holder && holder.id !== selfId)
    return {
      visible: true,
      willStart: true,
      blocked: true,
      blockedReason: `Экран показывает ${holder.name}`,
    };

  const self = call.participants.find((p) => p.user.id === selfId);
  const usedByOthers = call.participants.filter(
    (p) => p.video && p.user.id !== selfId,
  ).length;
  if (!self?.video && usedByOthers >= call.maxVideoParticipants)
    return {
      visible: true,
      willStart: true,
      blocked: true,
      blockedReason: "Все места под видео заняты — экран занимает место камеры",
    };
  return { visible: true, willStart: true, blocked: false, blockedReason: null };
}

/**
 * Что сказать серверу, когда показ кончился: снять признак и вернуть
 * камеру, если она была включена, иначе отдать место под видео.
 * Одним запросом — иначе между «снял показ» и «погасил видео» остальные
 * успели бы увидеть «камера включена» у человека без камеры.
 */
export function screenStopPatch(cameraOn: boolean): {
  screen: false;
  video: boolean;
} {
  return { screen: false, video: cameraOn };
}

/**
 * Нужен ли серверу запрос, когда во время показа нажали «камеру».
 *
 * Нет: место под видео уже держит экран, а камера в отправитель не
 * попадёт, пока идёт показ. Нажатие меняет только то, вернётся ли камера
 * после показа, — и это уйдёт серверу вместе с концом показа
 * (`screenStopPatch`). Запрос `{video:false}` посреди показа погасил бы
 * и сам показ.
 */
export function cameraToggleNeedsServer(sharing: boolean): boolean {
  return !sharing;
}

/**
 * Сервер считает, что мы показываем, а мы уже нет — запрос конца показа
 * потерялся (сеть, закрытый ноутбук). Тогда наш «экран» держит у всех
 * крупную плитку и не даёт показать никому другому. Подтверждение
 * присутствия приносит свежий состав — по нему и чиним.
 *
 * `pending` — идёт запрос начала показа: состав, пришедший в это окно,
 * мог быть собран до него или после, и чинить по нему нельзя — иначе
 * только что начатый показ тут же гасился бы своими же руками.
 */
export function screenFlagStale(
  call: Pick<ChatGroupCallDto, "participants"> | null,
  selfId: string,
  { sharing, pending }: { sharing: boolean; pending: boolean },
): boolean {
  if (sharing || pending) return false;
  return Boolean(call?.participants.find((p) => p.user.id === selfId)?.screen);
}

/**
 * Почему показ не начался — словами, или `null`, если говорить нечего.
 *
 * Отказ в системном окне выбора — это «передумал», а не ошибка: ругаться
 * в ответ на «Отмена» нельзя. Исключение — запрет на уровне системы
 * (macOS не даёт браузеру записывать экран): Chrome сообщает его тем же
 * `NotAllowedError`, но со словом «system» — и тогда надо подсказать, где
 * разрешить. Текст отказа СЕРВЕРА показывается как есть, как у камеры.
 */
export function describeScreenShareError(
  error: unknown,
  isServerError: (error: unknown) => error is Error,
): string | null {
  if (isServerError(error)) return error.message;
  const name = (error as { name?: string } | null)?.name;
  const message = String(
    (error as { message?: unknown } | null)?.message ?? "",
  );
  if (name === "NotAllowedError" || name === "AbortError") {
    if (/system/i.test(message))
      return "Системе не разрешено давать браузеру запись экрана — разрешите её в настройках (на Mac: Конфиденциальность и безопасность → Запись экрана) и перезапустите браузер";
    return null;
  }
  if (name === "NotReadableError")
    return "Экран сейчас нельзя захватить — закройте программу, которая его записывает, и попробуйте снова";
  if (name === "NotFoundError")
    return "Нечего показать: браузер не нашёл ни экрана, ни окна";
  return "Не удалось показать экран";
}
