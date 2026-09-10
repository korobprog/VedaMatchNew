import type { ProfileMessengers } from "@vedamatch/shared";

/**
 * Способы связи участника — в кнопки справочника администрации.
 *
 * Значения человек вводит в свободной форме: `@username`, номер телефона,
 * готовая ссылка. Готовую оставляем как есть, остальное достраиваем по схеме
 * мессенджера.
 *
 * У MAX надёжной схемы диплинка нет: адрес вида `max.ru/<что-то>` уводит не
 * туда чаще, чем туда. Такой контакт остаётся текстом, который копируют, —
 * то же решение, что и в «Знакомствах». Правила там свои: контракт
 * сервисного модуля запрещает тянуть хелпер из чужой папки.
 */

export type ContactKind = keyof ProfileMessengers;

export interface ContactLink {
  kind: ContactKind;
  label: string;
  /** Как человек это записал — его и показываем рядом с кнопкой. */
  value: string;
  /** `null` — открыть нечем, значение можно только скопировать. */
  href: string | null;
}

const LABELS: Record<ContactKind, string> = {
  telegram: "Telegram",
  whatsapp: "WhatsApp",
  mx: "MAX",
  phone: "Телефон",
};

/** Порядок кнопок: чем быстрее отвечают, тем левее. */
const ORDER: ContactKind[] = ["telegram", "whatsapp", "mx", "phone"];

function buildHref(kind: ContactKind, raw: string): string | null {
  const value = raw.trim();
  if (value === "") return null;
  // Человек мог вставить готовую ссылку — достраивать её значит сломать.
  if (/^(https?:|tel:)/i.test(value)) return value;

  switch (kind) {
    case "telegram":
      return `https://t.me/${value.replace(/^@/, "")}`;
    case "whatsapp": {
      // wa.me принимает только цифры: «+7 (999) 000-00-00» её ломает.
      const digits = value.replace(/\D/g, "");
      return digits === "" ? null : `https://wa.me/${digits}`;
    }
    case "phone": {
      const dialable = value.replace(/[^\d+]/g, "");
      return dialable === "" || dialable === "+" ? null : `tel:${dialable}`;
    }
    // MAX — только текст, см. заголовок файла.
    default:
      return null;
  }
}

/**
 * Список способов связи в порядке кнопок. Пустые поля пропускаются: пустая
 * кнопка читается как «связи нет», хотя связь может быть в соседнем поле.
 */
export function contactLinks(messengers: ProfileMessengers): ContactLink[] {
  const links: ContactLink[] = [];
  for (const kind of ORDER) {
    const value = messengers[kind]?.trim();
    if (!value) continue;
    links.push({
      kind,
      label: LABELS[kind],
      value,
      href: buildHref(kind, value),
    });
  }
  return links;
}
