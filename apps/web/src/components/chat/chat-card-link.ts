import type { ChatAttachmentDto } from "@vedamatch/shared";

/**
 * Ссылка «открыть» на карточке чужого сервиса.
 *
 * Адрес НЕ приходит из сообщения. Приходит пара «сервис + идентификатор»
 * (`sourceService`/`sourceId`), заведённая в схеме ровно для этого, а маршрут
 * подставляется здесь — жёстко, из кода. Поэтому кнопка по устройству не может
 * увести наружу: что бы отправитель ни положил в `sourceId`, оно попадает
 * внутрь фиксированного пути и экранируется, а `//`, `\` и `http://` после
 * `encodeURIComponent` перестают быть частью адреса.
 *
 * Так и задумано в модели: `url` вложения — только объект нашего хранилища
 * (`assertStorageUrl` не зря запрещает чужие адреса — он рисуется как
 * `<a href>` и `<img src>`, и посторонний домен узнавал бы IP получателя и
 * время, когда переписку открыли). Ссылка на оригинал живёт отдельно.
 *
 * Сервисы добавляются сюда по одному, когда их маршрут проверен: неверный
 * путь молча ведёт на «страница не найдена», и это хуже, чем текст без ссылки.
 */
export interface ChatCardLink {
  href: string;
  label: string;
}

export function chatCardLink(
  attachment: Pick<ChatAttachmentDto, "sourceService" | "sourceId">,
): ChatCardLink | null {
  const id = attachment.sourceId?.trim();
  if (!id) return null;

  switch (attachment.sourceService) {
    case "work":
      // `sourceId` приглашения — его одноразовый токен: у приглашения нет
      // другого имени, а сама ссылка и так ехала в тексте карточки.
      return {
        href: `/work/join/${encodeURIComponent(id)}`,
        label: "Принять приглашение",
      };
    default:
      return null;
  }
}
