import type { AssistantMessageDto } from "@vedamatch/shared";

/**
 * Куда ведёт «Отправить в чат» под ответом ассистента: на общую страницу
 * отправки «Общения», где карточка уходит снимком. Ассистент про устройство
 * чата не знает — только адрес и поля карточки.
 */
const MAX_BODY = 1_500;
const MAX_TITLE = 80;

export function buildShareHref(message: AssistantMessageDto): string | null {
  const body = message.text.trim();
  if (!body || message.failed) return null;
  const params = new URLSearchParams({
    kind: "assistant",
    title: titleOf(body),
    body: body.length > MAX_BODY ? `${body.slice(0, MAX_BODY - 1)}…` : body,
    sourceService: "assistant",
    sourceId: message.id,
  });
  return `/chat/share?${params.toString()}`;
}

/** Заголовок карточки — первая строка ответа, укороченная. */
export function titleOf(text: string): string {
  const first = text
    .split(/\n/)[0]
    .replace(/[*_#`]/g, "")
    .replace(/^[\-•\s]+/, "")
    .trim();
  if (first.length <= MAX_TITLE) return first || "Ответ ассистента";
  const cut = first.slice(0, MAX_TITLE);
  const space = cut.lastIndexOf(" ");
  return `${space > MAX_TITLE / 2 ? cut.slice(0, space) : cut}…`;
}

/** Подпись сервиса на карточке — по слагу, без похода в каталог. */
export const SERVICE_LABELS: Record<string, string> = {
  market: "Рынок",
  notices: "Объявления",
  motivation: "Вдохновение",
  library: "Образование",
  music: "Музыка",
  vedabase: "Библиотека",
  astro: "Астрология",
  chat: "Общение",
  union: "Знакомства",
  portal: "Портал",
};

export function serviceLabel(slug: string): string {
  return SERVICE_LABELS[slug] ?? slug;
}
