import { ApiError } from "@/lib/http-client";

/**
 * Почему не удалось войти в групповой звонок — словами, которые можно
 * показать человеку.
 *
 * Отдельным чистым модулем, а не веткой в провайдере, по двум причинам.
 *
 * 1. Отказов здесь ровно два рода, и путать их нельзя. Отказ СЕРВЕРА —
 *    это правило портала (комната полна, звонок кончился, звонки
 *    выключены), и формулировка уже пришла с ним: переписывать её на
 *    клиенте значит начать врать при первом же изменении правила. Отказ
 *    БРАУЗЕРА — это про устройство человека, и сервер о нём не знает
 *    вовсе; здесь текст обязан подсказать, что делать.
 * 2. Потолок в четыре человека держит сервер (409), а не кнопка: кнопка
 *    гаснет по составу, который ей известен, но между «нажал» и «дошло»
 *    место мог занять кто-то ещё. Пятый обязан увидеть внятный отказ, а не
 *    молчание, — и это ровно та ветка, которую иначе никто не проверит.
 */

/** Отказ такого рода лечится разрешением в браузере, а не повтором. */
export type GroupCallErrorKind = "server" | "permission" | "device" | "unknown";

export interface GroupCallError {
  kind: GroupCallErrorKind;
  message: string;
}

/**
 * Что браузер вообще позволяет на этой странице. Параметром, а не чтением
 * `window` прямо внутри: от окружения тут зависит целая ветка ответа, и
 * проверять её надо явно, а не надеяться, что тестовый jsdom случайно
 * окажется в нужном состоянии.
 */
export interface MediaCapability {
  /** `window.isSecureContext`: https или localhost. */
  secure: boolean;
  /** `navigator.mediaDevices` существует. */
  hasMediaDevices: boolean;
}

function currentCapability(): MediaCapability {
  if (typeof window === "undefined")
    return { secure: true, hasMediaDevices: true };
  return {
    secure: window.isSecureContext,
    hasMediaDevices: Boolean(navigator.mediaDevices),
  };
}

export function describeGroupCallError(
  error: unknown,
  capability: MediaCapability = currentCapability(),
): GroupCallError {
  // Сервер уже сказал, почему нельзя: «В звонке уже 4 человека — больше
  // пока нельзя», «Этот звонок уже закончился», «Звонки временно
  // выключены». Свой текст поверх чужого правила — источник расхождений.
  if (error instanceof ApiError)
    return { kind: "server", message: error.message };

  // Портал по http (локальная проверка, старый прокси без TLS): браузер
  // не отдаёт `navigator.mediaDevices` вовсе, и захват падает обычным
  // TypeError без говорящего имени. Молчать про причину здесь особенно
  // обидно — человек пойдёт искать её в разрешениях, которых ему не
  // покажут. Проверяем до разбора имени: имени тут и нет.
  if (!capability.secure && !capability.hasMediaDevices)
    return {
      kind: "device",
      message:
        "Браузер не даёт доступ к микрофону на незащищённом соединении — откройте портал по https",
    };

  const name = (error as { name?: string })?.name;
  if (name === "NotAllowedError" || name === "SecurityError")
    return {
      kind: "permission",
      message:
        "Нет доступа к микрофону — разрешите его в настройках браузера и войдите снова",
    };
  if (name === "NotFoundError")
    return { kind: "device", message: "Микрофон не найден" };
  if (name === "NotReadableError")
    return {
      kind: "device",
      message: "Микрофон занят другой программой или вкладкой",
    };

  if (error instanceof Error && error.message)
    return { kind: "unknown", message: error.message };
  return { kind: "unknown", message: "Не удалось войти в звонок" };
}
