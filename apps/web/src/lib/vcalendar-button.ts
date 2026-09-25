/**
 * Кнопка «Вайшнавский календарь» на Блог-ленте главной (VED-489): по
 * умолчанию есть у всех, спрятать её можно в меню горячей кнопки
 * «Календарь». Выбор — про этот телефон, как вид доски или подсказки, и
 * хранится в `localStorage`.
 *
 * Читают двое — Блог-лента и меню «Календарь», — поэтому модулем в `lib`, а
 * не внутри одного из сервисов: переключили в меню, и кнопка на ленте
 * пропадает сразу, без перезагрузки.
 */
export const VCALENDAR_URL = "https://vcalendar.ru";

export const vcalendarButtonKey = "home:vcalendar-button-hidden";

export function isVcalendarButtonShown(
  storage: Pick<Storage, "getItem">,
): boolean {
  try {
    return storage.getItem(vcalendarButtonKey) !== "1";
  } catch {
    // Приватный режим: кнопка на месте, как у всех по умолчанию.
    return true;
  }
}

export function setVcalendarButtonShown(
  storage: Pick<Storage, "setItem" | "removeItem">,
  shown: boolean,
): void {
  try {
    if (shown) storage.removeItem(vcalendarButtonKey);
    else storage.setItem(vcalendarButtonKey, "1");
  } catch {
    // Не смогли запомнить — выбор проживёт до перезагрузки.
  }
  for (const listener of listeners) listener();
}

let listeners: Array<() => void> = [];

export function subscribeVcalendarButton(listener: () => void): () => void {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter((item) => item !== listener);
  };
}

export function getVcalendarButtonSnapshot(): boolean {
  if (typeof window === "undefined") return true;
  return isVcalendarButtonShown(window.localStorage);
}

/** На сервере кнопка есть — как у всех по умолчанию. */
export function getVcalendarButtonServerSnapshot(): boolean {
  return true;
}
