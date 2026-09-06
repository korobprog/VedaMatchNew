import type {
  AssistantActionCard,
  AssistantCard,
  AssistantLinkCard,
  AssistantToolItem,
  AssistantToolReply,
} from '@vedamatch/shared';

/**
 * Карточки ответа. Сервисы отвечают на события в свободной форме — подписчик
 * мог вернуть мусор, `undefined` или упасть, — и всё это здесь превращается в
 * проверенные карточки или отбрасывается. Ассистент не должен падать из-за
 * одного сломанного сервиса.
 */

const MAX_TITLE = 160;
const MAX_SUBTITLE = 160;
const MAX_BODY = 400;

function text(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().replace(/\s+/g, ' ');
  if (!trimmed) return null;
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed;
}

/** Только внутренние ссылки: карточка ведёт по порталу, а не наружу. */
function href(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) return null;
  return trimmed;
}

function imageUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return /^https?:\/\//.test(trimmed) || trimmed.startsWith('/')
    ? trimmed
    : null;
}

export function isToolReply(value: unknown): value is AssistantToolReply {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { ok?: unknown }).ok === 'boolean'
  );
}

/**
 * Первый осмысленный ответ. На одно событие могут ответить несколько
 * подписчиков (или ни одного): берётся первый, похожий на ответ.
 */
export function pickReply(
  replies: readonly unknown[],
): AssistantToolReply | null {
  for (const reply of replies) if (isToolReply(reply)) return reply;
  return null;
}

export function toLinkCards(
  service: string,
  items: readonly unknown[] | undefined,
  limit: number,
): AssistantLinkCard[] {
  const cards: AssistantLinkCard[] = [];
  for (const raw of items ?? []) {
    if (!raw || typeof raw !== 'object') continue;
    const item = raw as Partial<AssistantToolItem>;
    const title = text(item.title, MAX_TITLE);
    const link = href(item.href);
    if (!title || !link) continue;
    cards.push({
      kind: 'link',
      service,
      title,
      subtitle: text(item.subtitle, MAX_SUBTITLE),
      body: text(item.body, MAX_BODY),
      imageUrl: imageUrl(item.imageUrl),
      href: link,
    });
    if (cards.length >= limit) break;
  }
  return cards;
}

/**
 * Что модель узнает о результате. Картинки и ссылки ей ни к чему — карточки
 * человек увидит сам, — а вот заголовки и подписи нужны, чтобы рассказать о
 * найденном словами.
 */
export function describeForModel(
  reply: AssistantToolReply | null,
  cards: readonly AssistantLinkCard[],
): string {
  if (!reply)
    return JSON.stringify({ ok: false, error: 'service_unavailable' });
  if (!reply.ok)
    return JSON.stringify({ ok: false, error: reply.text ?? 'failed' });
  if (cards.length === 0 && !reply.text)
    return JSON.stringify({ ok: true, found: 0 });
  return JSON.stringify({
    ok: true,
    found: cards.length,
    ...(reply.text ? { note: reply.text } : {}),
    items: cards.map((card) => ({
      title: card.title,
      ...(card.subtitle ? { subtitle: card.subtitle } : {}),
      ...(card.body ? { body: card.body } : {}),
    })),
  });
}

export function pendingActionCard(input: {
  action: string;
  label: string;
  summary: string;
  args: Record<string, unknown>;
}): AssistantActionCard {
  return {
    kind: 'action',
    action: input.action,
    label: input.label,
    summary: input.summary,
    args: input.args,
    status: 'pending',
    resultHref: null,
    resultText: null,
  };
}

/** Что именно предлагается — человеку, перед кнопкой. */
export function actionSummary(
  action: string,
  args: Record<string, unknown>,
): string {
  if (action === 'motivation_create_reel') {
    const textValue = typeof args.text === 'string' ? args.text : '';
    const track = args.audienceTrack === 'vaishnava' ? 'вайшнавский' : 'общий';
    return `Рилс во Вдохновении, поток ${track}: «${textValue}». Картинку нарисует сервис, текст проверит модерация.`;
  }
  return `Действие ${action}`;
}

/** Карточки из JSON базы: форму проверяем, а не доверяем колонке. */
export function parseStoredCards(value: unknown): AssistantCard[] {
  if (!Array.isArray(value)) return [];
  const cards: AssistantCard[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue;
    const card = raw as { kind?: unknown };
    if (card.kind === 'link') {
      const link = raw as AssistantLinkCard;
      if (typeof link.title === 'string' && typeof link.href === 'string')
        cards.push({
          kind: 'link',
          service: typeof link.service === 'string' ? link.service : 'portal',
          title: link.title,
          subtitle: link.subtitle ?? null,
          body: link.body ?? null,
          imageUrl: link.imageUrl ?? null,
          href: link.href,
        });
    } else if (card.kind === 'action') {
      const action = raw as AssistantActionCard;
      if (typeof action.action === 'string')
        cards.push({
          kind: 'action',
          action: action.action,
          label:
            typeof action.label === 'string' ? action.label : 'Подтвердить',
          summary: typeof action.summary === 'string' ? action.summary : '',
          args:
            action.args && typeof action.args === 'object' ? action.args : {},
          status: action.status ?? 'pending',
          resultHref: action.resultHref ?? null,
          resultText: action.resultText ?? null,
        });
    }
  }
  return cards;
}
