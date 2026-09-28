/**
 * Текст приглашения горячей кнопки «Пригласить» (VED-618). Хранится в
 * `RewardsSettings.inviteText`, правит его администратор прямо в окне
 * кнопки; `null` в базе — текст по умолчанию ниже.
 *
 * Чистая логика отдельно от сервиса: подстановка личной ссылки и проверка
 * длины покрываются тестом без базы.
 */

/**
 * Текст по умолчанию — слово в слово из карточки VED-618, включая эмодзи,
 * двойной пробел и латинскую «B» в «БETA»: заказчик прислал его готовым к
 * отправке, «исправленный» он был бы уже не его текстом.
 */
export const INVITE_TEXT_DEFAULT = [
  '🌎 VEDAMATCH.ru',
  'Глобальный Портал Саморазвития.',
  '',
  '🌄 НАШИ СЕРВИСЫ:',
  '⦁ Общение, мессенджер;',
  '⦁ Образование;',
  '⦁ Знакомства;',
  '⦁ Медиатека;',
  '⦁ Здоровье;',
  '⦁ Астрология;',
  '⦁ Афоризмы;',
  '⦁ Рынок;',
  '⦁ Объявления;',
  '⦁ Работа;',
  'и многое другое в будущих обновлениях.',
  '',
  '📤 ПРИСОЕДИНЯЙСЯ и делись!',
  '',
  '📲 Зарегистрируйся на сайте и пользуйся БETA-версией, с возможностью режима приложения как под IOS  так и под Android: vedamatch.ru',
  '',
  '📱Реальное ПРИЛОЖЕНИЕ [android] Зарегистрироваться на портале и установить APK можно и через: @vedamatch_bot',
].join('\n');

/**
 * Потолок длины шаблона. Сообщение Telegram — 4096 символов, а к шаблону
 * ещё приезжает личная ссылка: с запасом на неё текст уходит одним
 * сообщением.
 */
export const INVITE_TEXT_MAX_LENGTH = 3500;

/** Явное место для ссылки, если администратор хочет поставить её сам. */
export const INVITE_LINK_PLACEHOLDER = '{ссылка}';

/**
 * Голый адрес сайта строчными буквами: не часть другого адреса (`/`, `.`,
 * `@` перед ним), не домен третьего уровня и без пути после. Заглавное
 * «VEDAMATCH.ru» в шапке — название, а не адрес, и остаётся как есть.
 */
const BARE_SITE_ADDRESS = /(?<![\w./@:-])vedamatch\.ru(?![\w/-]|\.\w)/g;

/** `@имя_bot` отдельным словом: имя бота Telegram оканчивается на «bot». */
const TELEGRAM_BOT_MENTION = /(?<![\w./@:-])@([A-Za-z]\w{1,29}bot)(?!\w)/gi;

/** `t.me/…` без схемы: не хвост другого адреса. */
const BARE_TELEGRAM_LINK = /(?<![\w./@:-])t\.me\//gi;

/**
 * Ссылки на Telegram в виде, который мессенджеры сами подсвечивают
 * (VED-622): `@vedamatch_bot` синим становится только внутри Telegram, а в
 * WhatsApp и прочих — простой текст. Упоминание бота и `t.me/…` без схемы
 * приводятся к `https://t.me/…`; остальной текст не меняется.
 */
export function linkifyTelegram(text: string): string {
  return text
    .replace(BARE_TELEGRAM_LINK, 'https://t.me/')
    .replace(TELEGRAM_BOT_MENTION, 'https://t.me/$1');
}

/**
 * Текст, который человек отправляет другу: шаблон с его личной ссылкой.
 *
 * Ссылка обязана попасть в текст — без реферальной метки баллы не
 * начислятся ни приглашённому, ни пригласившему. Поэтому по порядку:
 * `{ссылка}` в шаблоне → на её место; иначе голый адрес `vedamatch.ru`
 * (в тексте по умолчанию — в строке про регистрацию на сайте) → заменяется
 * ссылкой, как было и в прежнем тексте VED-423; иначе ссылка дописывается
 * последней строкой. Упоминание бота заранее становится ссылкой
 * (`linkifyTelegram`) — и в тексте по умолчанию, и в тексте администратора.
 */
export function buildInviteMessage(raw: string, link: string): string {
  const template = linkifyTelegram(raw);
  if (template.includes(INVITE_LINK_PLACEHOLDER)) {
    return template.split(INVITE_LINK_PLACEHOLDER).join(link);
  }
  const replaced = template.replace(BARE_SITE_ADDRESS, link);
  if (replaced !== template) return replaced;
  return template ? `${template}\n\n${link}` : link;
}

export type InviteTextCheck =
  { ok: true; text: string | null } | { ok: false; error: string };

/**
 * Что сохранить из поля администратора. Переводы строк приводятся к `\n`,
 * пробелы по краям срезаются. Пустое поле — вернуть текст по умолчанию
 * (`null`), а не сохранить пустое приглашение из одной ссылки.
 */
export function normalizeInviteText(raw: unknown): InviteTextCheck {
  if (raw !== null && typeof raw !== 'string') {
    return { ok: false, error: 'Текст приглашения должен быть строкой' };
  }
  const text = (raw ?? '').replace(/\r\n?/g, '\n').trim();
  if (!text) return { ok: true, text: null };
  if (text.length > INVITE_TEXT_MAX_LENGTH) {
    return {
      ok: false,
      error: `Текст длиннее ${INVITE_TEXT_MAX_LENGTH} символов`,
    };
  }
  return { ok: true, text };
}
