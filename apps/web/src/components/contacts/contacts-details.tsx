import type { ProfileMessengers, ProfileSocialLinks } from "@vedamatch/shared";
import { contactsMessengerLabels, contactsSocialLabels } from "./labels";

/**
 * Открытые способы связи.
 *
 * Показывается только там, где бэкенд сам прислал непустое поле `contacts`:
 * оно заполняется исключительно при действующем раскрытии. Никакой своей
 * логики «кому можно» здесь нет и быть не должно.
 */
export interface ContactsDetailsValue {
  socialLinks: ProfileSocialLinks;
  messengers: ProfileMessengers;
}

/** Подписи задают и порядок, и белый список ключей: чужого ничего не покажем. */
function entries<T extends object>(
  labels: Record<keyof T & string, string>,
  values: T | null | undefined,
): Array<[string, string]> {
  const result: Array<[string, string]> = [];
  for (const [key, label] of Object.entries(labels) as Array<[keyof T, string]>) {
    const value = values?.[key];
    const text = typeof value === "string" ? value.trim() : "";
    if (text) result.push([label, text]);
  }
  return result;
}

export function ContactsDetails({
  contacts,
  title = "Контакты открыты",
}: {
  contacts: ContactsDetailsValue;
  title?: string;
}) {
  // Мессенджеры идут первыми: за ними обычно и обращаются.
  const rows = [
    ...entries(contactsMessengerLabels, contacts.messengers),
    ...entries(contactsSocialLabels, contacts.socialLinks),
  ];

  return (
    <section
      data-testid="contacts-details"
      className="rounded-2xl border border-cyan/40 bg-cyan/5 p-4"
    >
      <h3 className="font-display text-base font-semibold text-text-0">
        {title}
      </h3>
      {rows.length === 0 ? (
        <p className="mt-1 text-sm text-text-1">
          Доступ открыт, но человек пока не указал ни одного способа связи.
        </p>
      ) : (
        <dl className="mt-2 grid gap-2 sm:grid-cols-2">
          {rows.map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs uppercase tracking-wide text-text-2">
                {label}
              </dt>
              <dd className="mt-0.5 break-all text-sm text-text-0">{value}</dd>
            </div>
          ))}
        </dl>
      )}
      <p className="mt-3 text-xs text-text-2">
        Это личные данные человека. Не передавайте их дальше и не публикуйте.
      </p>
    </section>
  );
}
